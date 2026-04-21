from __future__ import annotations

import csv
import json
import math
import os
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests
from sklearn.model_selection import KFold
from xgboost import XGBRegressor


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "src" / "lib" / "data" / "sealed-ml"
MANIFEST_PATH = DATA_DIR / "products.json"
DATASET_FILENAME = "training-dataset.csv"
SUMMARY_FILENAME = "training-summary.json"
LATEST_FEATURES_FILENAME = "product-history-summary.json"
DEFAULT_OUTPUT_DIR = DATA_DIR

FEATURE_NAMES = [
    "current_price",
    "most_expensive_card_price",
    "chase_card_count",
    "chase_card_index_score",
    "set_age_years",
    "google_trends_score",
    "print_run_type_encoded",
    "price_trajectory_6mo",
    "price_trajectory_24mo",
    "collector_demand_ratio",
    "market_cycle_score",
    "popularity_score",
    "product_type_encoded",
    "era_encoded",
]

TARGETS = {
    "1yr": "price_1yr_later",
    "3yr": "price_3yr_later",
    "5yr": "price_5yr_later",
}

MARKET_CYCLE_BY_YEAR = {
    2016: 44,
    2017: 49,
    2018: 46,
    2019: 52,
    2020: 78,
    2021: 92,
    2022: 38,
    2023: 55,
    2024: 67,
    2025: 63,
    2026: 58,
}

PRICE_CHARTING_MARKER = "VGPC.chart_data = "
REQUEST_HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "text/html,application/xhtml+xml"}
SNAPSHOT_STEP_MONTHS = 1
MAX_TARGET_MULTIPLE = 10.0
MAX_MAE_SHARE_OF_MEAN_TARGET = 0.5
MAX_SINGLE_FEATURE_INFLUENCE = 60.0
TARGET_TRANSFORM = {
    "train": "np.log",
    "inference": "np.exp",
}


@dataclass
class ProductManifest:
    set_id: str
    name: str
    product_type: str
    release_date: str
    price_charting_url: str
    print_run_type: str
    era: str
    most_expensive_card_price: float
    chase_card_count: int
    chase_card_index_score: float
    google_trends_score: float
    collector_demand_ratio: float
    market_cycle_score: float
    popularity_score: float


def load_manifest() -> list[ProductManifest]:
    data = json.loads(MANIFEST_PATH.read_text())
    return [
        ProductManifest(
            set_id=item["setId"],
            name=item["name"],
            product_type=item["productType"],
            release_date=item["releaseDate"],
            price_charting_url=item["priceChartingUrl"],
            print_run_type=item["printRunType"],
            era=item["era"],
            most_expensive_card_price=float(item["mostExpensiveCardPrice"]),
            chase_card_count=int(item["chaseCardCount"]),
            chase_card_index_score=float(item["chaseCardIndexScore"]),
            google_trends_score=float(item["googleTrendsScore"]),
            collector_demand_ratio=float(item["collectorDemandRatio"]),
            market_cycle_score=float(item["marketCycleScore"]),
            popularity_score=float(item["popularityScore"]),
        )
        for item in data
    ]


def encode_print_run(value: str) -> int:
    mapping = {"Limited": 2, "Standard": 1, "Overprinted": 0}
    return mapping.get(value, 1)


def encode_product_type(value: str) -> int:
    mapping = {
        "ETB": 3,
        "Booster Box": 2,
        "Booster Bundle": 1,
        "Booster Pack": 1,
        "Collection Box": 1,
        "Special Collection": 1,
        "Tin": 0,
        "UPC": 2,
        "Case": 3,
        "Unknown": 1,
    }
    return mapping.get(value, 1)


def encode_era(value: str) -> int:
    mapping = {
        "Base/Neo": 3,
        "EX/DS": 2,
        "HGSS/BW": 1,
        "XY/SM/Modern": 0,
    }
    return mapping.get(value, 0)


def market_cycle_for_date(date: datetime) -> float:
    if date.year in MARKET_CYCLE_BY_YEAR:
        return float(MARKET_CYCLE_BY_YEAR[date.year])

    if date.year < min(MARKET_CYCLE_BY_YEAR):
        return float(MARKET_CYCLE_BY_YEAR[min(MARKET_CYCLE_BY_YEAR)])

    if date.year > max(MARKET_CYCLE_BY_YEAR):
        return float(MARKET_CYCLE_BY_YEAR[max(MARKET_CYCLE_BY_YEAR)])

    years = sorted(MARKET_CYCLE_BY_YEAR)
    for left, right in zip(years, years[1:]):
        if left <= date.year <= right:
            left_value = MARKET_CYCLE_BY_YEAR[left]
            right_value = MARKET_CYCLE_BY_YEAR[right]
            pct = (date.year - left) / max(right - left, 1)
            return float(left_value + (right_value - left_value) * pct)

    return 55.0


def parse_release_date(value: str) -> datetime:
    return datetime.fromisoformat(value).replace(tzinfo=UTC)


def extract_chart_data(html: str) -> dict[str, Any]:
    marker_index = html.find(PRICE_CHARTING_MARKER)
    if marker_index < 0:
        raise ValueError("Unable to locate chart data marker")

    start_index = html.find("{", marker_index)
    if start_index < 0:
        raise ValueError("Unable to locate chart data payload")

    depth = 0
    in_string = False
    is_escaped = False

    for index in range(start_index, len(html)):
        char = html[index]

        if in_string:
            if is_escaped:
                is_escaped = False
            elif char == "\\":
                is_escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return json.loads(html[start_index : index + 1])

    raise ValueError("Unable to parse chart data payload")


def select_price_series(chart_data: dict[str, Any]) -> list[Any]:
    preferred_keys = ["used", "new", "boxonly"]

    def preference_rank(key: str) -> int:
        return len(preferred_keys) - preferred_keys.index(key) if key in preferred_keys else 0

    ranked_series = sorted(
        (
            (
                key,
                sum(1 for _, raw_value in values if float(raw_value) > 0),
                len(values),
                values,
            )
            for key, values in chart_data.items()
            if isinstance(values, list)
        ),
        key=lambda item: (
            item[1],
            item[2],
            preference_rank(item[0]),
        ),
        reverse=True,
    )

    if not ranked_series:
        return []

    for key in preferred_keys:
        for series_key, positive_points, _, values in ranked_series:
            if series_key == key and positive_points >= 8:
                return values

    return ranked_series[0][3]


def fetch_price_series(product: ProductManifest, session: requests.Session) -> list[tuple[datetime, float]]:
    response = session.get(product.price_charting_url, timeout=30)
    response.raise_for_status()
    chart_data = extract_chart_data(response.text)
    used = select_price_series(chart_data)
    series: list[tuple[datetime, float]] = []
    for timestamp_ms, raw_value in used:
        price = float(raw_value) / 100.0
        if price <= 0:
            continue
        series.append((datetime.fromtimestamp(timestamp_ms / 1000, tz=UTC), price))

    if len(series) < 8:
        raise ValueError(f"Insufficient price history for {product.name}")

    return series


def safe_pct_change(current_price: float, previous_price: float | None) -> float | None:
    if previous_price is None or previous_price <= 0:
        return None
    return round(((current_price - previous_price) / previous_price) * 100.0, 3)


def latest_price_before(
    series: list[tuple[datetime, float]], index: int, months_back: int
) -> float | None:
    target = index - months_back
    if target < 0:
        return None
    price = series[target][1]
    return price if price > 0 else None


def target_price_after(
    series: list[tuple[datetime, float]], index: int, months_forward: int, tolerance: int = 0
) -> float | None:
    target = index + months_forward
    candidate_indexes = [target]

    for offset in range(1, tolerance + 1):
        candidate_indexes.extend([target - offset, target + offset])

    for candidate in candidate_indexes:
        if candidate < 0 or candidate >= len(series):
            continue
        price = series[candidate][1]
        if price > 0:
            return price

    return None


def build_training_rows(
    products: list[ProductManifest],
) -> tuple[pd.DataFrame, dict[str, Any], dict[str, Any]]:
    session = requests.Session()
    session.headers.update(REQUEST_HEADERS)

    rows: list[dict[str, Any]] = []
    history_summary: dict[str, Any] = {}

    for product in products:
        series = fetch_price_series(product, session)
        release_date = parse_release_date(product.release_date)

        latest_index = len(series) - 1
        latest_price = series[latest_index][1]
        latest_6mo = safe_pct_change(latest_price, latest_price_before(series, latest_index, 6))
        latest_24mo = safe_pct_change(latest_price, latest_price_before(series, latest_index, 24))
        history_summary[product.set_id] = {
            "name": product.name,
            "latestPriceDate": series[latest_index][0].date().isoformat(),
            "latestHistoricalPrice": round(latest_price, 2),
            "priceTrajectory6mo": latest_6mo,
            "priceTrajectory24mo": latest_24mo,
            "historyPoints": len(series),
        }

        for index, (snapshot_date, current_price) in enumerate(series):
            if index % SNAPSHOT_STEP_MONTHS != 0:
                continue

            target_1yr = target_price_after(series, index, 12, tolerance=1)
            target_3yr = target_price_after(series, index, 36, tolerance=2)
            target_5yr = target_price_after(series, index, 60, tolerance=3)

            if not any([target_1yr, target_3yr, target_5yr]):
                continue

            age_days = max((snapshot_date - release_date).days, 0)
            set_age_years = round(age_days / 365.25, 4)

            row = {
                "row_id": f"{product.set_id}:{snapshot_date.date().isoformat()}",
                "set_id": product.set_id,
                "name": product.name,
                "product_type": product.product_type,
                "snapshot_date": snapshot_date.date().isoformat(),
                "current_price": round(current_price, 2),
                "most_expensive_card_price": product.most_expensive_card_price,
                "chase_card_count": product.chase_card_count,
                "chase_card_index_score": product.chase_card_index_score,
                "set_age_years": set_age_years,
                "google_trends_score": product.google_trends_score,
                "print_run_type_encoded": encode_print_run(product.print_run_type),
                "price_trajectory_6mo": safe_pct_change(
                    current_price, latest_price_before(series, index, 6)
                ),
                "price_trajectory_24mo": safe_pct_change(
                    current_price, latest_price_before(series, index, 24)
                ),
                "collector_demand_ratio": product.collector_demand_ratio,
                "market_cycle_score": market_cycle_for_date(snapshot_date),
                "popularity_score": product.popularity_score,
                "product_type_encoded": encode_product_type(product.product_type),
                "era_encoded": encode_era(product.era),
                "price_1yr_later": target_1yr,
                "price_3yr_later": target_3yr,
                "price_5yr_later": target_5yr,
            }
            rows.append(row)

    if not rows:
        raise RuntimeError("No training rows were generated")

    frame = pd.DataFrame(rows)
    frame.sort_values(["snapshot_date", "name"], inplace=True)

    summary = {
        **build_dataset_summary(frame, len(products)),
    }
    return frame, summary, history_summary


def build_dataset_summary(frame: pd.DataFrame, product_count: int) -> dict[str, Any]:
    return {
        "generatedAt": datetime.now(tz=UTC).isoformat(),
        "products": product_count,
        "rows": int(frame.shape[0]),
        "rowsBySet": Counter(frame["set_id"]).most_common(),
        "horizons": {
            horizon: int(frame[target].notna().sum()) for horizon, target in TARGETS.items()
        },
    }


def print_training_dataset(frame: pd.DataFrame) -> None:
    print("=== TRAINING DATASET START ===")
    print(frame.to_csv(index=False))
    print("=== TRAINING DATASET END ===")


def audit_training_frame(frame: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    audited = frame.copy()
    audited.sort_values(["snapshot_date", "name"], inplace=True)
    print_training_dataset(audited)

    current_prices = audited["current_price"].replace(0, np.nan).astype(float)
    outlier_mask = pd.Series(False, index=audited.index)
    max_target_multiple_by_horizon: dict[str, float] = {}

    for horizon, target_column in TARGETS.items():
        target_values = audited[target_column].astype(float)
        ratios = target_values / current_prices
        finite_ratios = ratios[np.isfinite(ratios)]
        max_target_multiple_by_horizon[horizon] = round(
            float(finite_ratios.max()) if not finite_ratios.empty else 0.0,
            4,
        )
        outlier_mask = outlier_mask | (ratios >= MAX_TARGET_MULTIPLE).fillna(False)

    outliers = audited.loc[outlier_mask].copy()
    if not outliers.empty:
        print("=== TRAINING OUTLIERS REMOVED START ===")
        print(outliers.to_csv(index=False))
        print("=== TRAINING OUTLIERS REMOVED END ===")

    cleaned = audited.loc[~outlier_mask].copy()
    cleaned.sort_values(["snapshot_date", "name"], inplace=True)

    return cleaned, {
        "loggedRows": int(audited.shape[0]),
        "outlierRowsRemoved": int(outliers.shape[0]),
        "maxTargetMultipleByHorizon": max_target_multiple_by_horizon,
        "targetTransform": TARGET_TRANSFORM,
    }


def load_cached_training_artifacts(
    data_dir: Path = DATA_DIR,
) -> tuple[pd.DataFrame, dict[str, Any], dict[str, Any]]:
    dataset_path = data_dir / DATASET_FILENAME
    history_path = data_dir / LATEST_FEATURES_FILENAME
    if not dataset_path.exists() or not history_path.exists():
        raise FileNotFoundError("Cached training artifacts are missing")

    frame = pd.read_csv(dataset_path)
    frame.sort_values(["snapshot_date", "name"], inplace=True)
    history_summary = json.loads(history_path.read_text())
    summary = build_dataset_summary(frame, len(load_manifest()))
    return frame, summary, history_summary


def write_training_data_artifacts(
    frame: pd.DataFrame,
    history_summary: dict[str, Any],
    output_dir: Path = DATA_DIR,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    frame.sort_values(["snapshot_date", "name"], inplace=True)
    (output_dir / DATASET_FILENAME).write_text(
        frame.to_csv(index=False, quoting=csv.QUOTE_MINIMAL)
    )
    (output_dir / LATEST_FEATURES_FILENAME).write_text(json.dumps(history_summary, indent=2))


def make_model() -> XGBRegressor:
    return XGBRegressor(
        objective="reg:squarederror",
        n_estimators=100,
        max_depth=2,
        learning_rate=0.05,
        subsample=0.7,
        colsample_bytree=0.7,
        min_child_weight=5,
        reg_alpha=1.0,
        reg_lambda=5.0,
        gamma=2.0,
        random_state=42,
        tree_method="hist",
        missing=np.nan,
    )


def evaluate_cross_validation(features: pd.DataFrame, target: pd.Series) -> dict[str, float]:
    sample_count = len(features)
    fold_count = min(5, sample_count)
    if fold_count < 2:
        return {"folds": float(fold_count), "rmse": 0.0, "mae": 0.0, "mape": 0.0}

    kfold = KFold(n_splits=fold_count, shuffle=True, random_state=42)
    predictions: list[float] = []
    actuals: list[float] = []

    for train_idx, test_idx in kfold.split(features):
        model = make_model()
        x_train = features.iloc[train_idx]
        x_test = features.iloc[test_idx]
        y_train = np.log(target.iloc[train_idx].to_numpy(dtype=float))
        y_test = target.iloc[test_idx].to_numpy(dtype=float)

        model.fit(x_train, y_train)
        pred_log = model.predict(x_test)
        pred = np.exp(pred_log)

        predictions.extend(pred.tolist())
        actuals.extend(y_test.tolist())

    pred_arr = np.array(predictions)
    actual_arr = np.array(actuals)
    rmse = float(np.sqrt(np.mean((pred_arr - actual_arr) ** 2)))
    mae = float(np.mean(np.abs(pred_arr - actual_arr)))
    mape = float(np.mean(np.abs((pred_arr - actual_arr) / np.maximum(actual_arr, 1e-6))) * 100.0)

    return {
        "folds": float(fold_count),
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
        "mape": round(mape, 4),
    }


def train_model(
    frame: pd.DataFrame,
    horizon: str,
    target_column: str,
    output_dir: Path = DATA_DIR,
) -> dict[str, Any]:
    usable = frame[frame[target_column].notna()].copy()
    if usable.empty:
        raise RuntimeError(f"No rows available for {horizon} model")

    features = usable[FEATURE_NAMES].astype(float)
    target = usable[target_column].astype(float)
    cv_metrics = evaluate_cross_validation(features, target)

    model = make_model()
    logged_target = np.log(target.to_numpy(dtype=float))
    model.fit(features, logged_target)

    booster = model.get_booster()
    dump = booster.get_dump(dump_format="json", with_stats=True)
    trees = [json.loads(tree) for tree in dump]
    config = json.loads(booster.save_config())
    base_score = float(config["learner"]["learner_model_param"]["base_score"])
    raw_importance = booster.get_score(importance_type="gain")
    total_gain = sum(raw_importance.values()) or 1.0
    global_importance = [
        {
            "key": feature,
            "name": feature,
            "gain": round(gain, 6),
            "influence": round((gain / total_gain) * 100.0, 4),
        }
        for feature, gain in sorted(raw_importance.items(), key=lambda item: item[1], reverse=True)
    ]
    mean_target_price = float(target.mean())
    mae_share_of_mean_target = (
        float(cv_metrics["mae"]) / mean_target_price if mean_target_price > 0 else 0.0
    )
    dominant_feature = global_importance[0] if global_importance else None
    manual_review_reasons: list[str] = []

    if mae_share_of_mean_target > MAX_MAE_SHARE_OF_MEAN_TARGET:
        manual_review_reasons.append(
            f"Cross-validation MAE is {round(mae_share_of_mean_target * 100, 2)}% of mean target price"
        )

    if dominant_feature and float(dominant_feature["influence"]) > MAX_SINGLE_FEATURE_INFLUENCE:
        manual_review_reasons.append(
            f"{dominant_feature['key']} accounts for {dominant_feature['influence']}% of feature importance"
        )

    print(f"=== {horizon.upper()} TARGET TRANSFORM ===")
    print(json.dumps(TARGET_TRANSFORM, indent=2))
    print(f"=== {horizon.upper()} FEATURE IMPORTANCE START ===")
    print(json.dumps(global_importance, indent=2))
    print(f"=== {horizon.upper()} FEATURE IMPORTANCE END ===")

    artifact = {
        "generatedAt": datetime.now(tz=UTC).isoformat(),
        "horizon": horizon,
        "targetColumn": target_column,
        "featureNames": FEATURE_NAMES,
        "baseScore": base_score,
        "trees": trees,
        "treeCount": len(trees),
        "trainingRows": int(usable.shape[0]),
        "crossValidation": cv_metrics,
        "meanTargetPrice": round(mean_target_price, 4),
        "maeShareOfMeanTarget": round(mae_share_of_mean_target, 4),
        "targetTransform": TARGET_TRANSFORM,
        "deploymentApproved": len(manual_review_reasons) == 0,
        "manualReviewReasons": manual_review_reasons,
        "globalImportance": global_importance,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = output_dir / f"model-{horizon}.json"
    artifact_path.write_text(json.dumps(artifact, indent=2))

    return {
        "artifactPath": str(artifact_path.relative_to(ROOT))
        if artifact_path.is_relative_to(ROOT)
        else str(artifact_path),
        "trainingRows": int(usable.shape[0]),
        "crossValidation": cv_metrics,
        "meanTargetPrice": round(mean_target_price, 4),
        "maeShareOfMeanTarget": round(mae_share_of_mean_target, 4),
        "targetTransform": TARGET_TRANSFORM,
        "dominantFeature": dominant_feature,
        "deploymentApproved": len(manual_review_reasons) == 0,
        "manualReviewReasons": manual_review_reasons,
        "treeCount": len(trees),
    }


def train_models(frame: pd.DataFrame, output_dir: Path = DATA_DIR) -> dict[str, Any]:
    return {
        horizon: train_model(frame, horizon, target_column, output_dir)
        for horizon, target_column in TARGETS.items()
    }


def write_training_summary(summary: dict[str, Any], output_dir: Path = DATA_DIR) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / SUMMARY_FILENAME).write_text(json.dumps(summary, indent=2))


def main() -> None:
    output_dir = Path(os.environ.get("SEALED_ML_OUTPUT_DIR", str(DEFAULT_OUTPUT_DIR)))
    output_dir.mkdir(parents=True, exist_ok=True)

    products = load_manifest()
    try:
        frame, summary, history_summary = build_training_rows(products)
    except (requests.RequestException, ValueError):
        frame, summary, history_summary = load_cached_training_artifacts(DATA_DIR)
    frame, audit_summary = audit_training_frame(frame)
    summary = build_dataset_summary(frame, len(products))
    summary["audit"] = audit_summary
    write_training_data_artifacts(frame, history_summary, output_dir)

    model_summary = train_models(frame, output_dir)
    summary["models"] = model_summary
    summary["deploymentApproved"] = all(
        bool(model.get("deploymentApproved")) for model in model_summary.values()
    )
    write_training_summary(summary, output_dir)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
