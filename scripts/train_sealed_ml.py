from __future__ import annotations

import csv
import json
import math
import os
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests
from sklearn.model_selection import TimeSeriesSplit
from xgboost import XGBRegressor


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "src" / "lib" / "data" / "sealed-ml"
MANIFEST_PATH = DATA_DIR / "products.json"
TRAINING_SNAPSHOT_PATH = DATA_DIR / "dual-provider-monthly-snapshots.json"
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
    "price_momentum_1mo",
    "price_momentum_12mo",
    "price_volatility_6mo",
    "price_volatility_12mo",
    "drawdown_12mo",
    "history_density_12mo",
    "available_provider_count",
    "provider_spread_pct",
    "provider_agreement_score",
    "snapshot_freshness_days",
    "liquidity_proxy_score",
    "history_window_missing_flag",
    "provider_context_missing_flag",
]

TARGETS = {
    "1yr": "price_1yr_later",
    "3yr": "price_3yr_later",
    "5yr": "price_5yr_later",
}
HORIZON_MONTHS = {
    "1yr": 12,
    "3yr": 36,
    "5yr": 60,
}
HORIZON_TOLERANCE_MONTHS = {
    "1yr": 1,
    "3yr": 2,
    "5yr": 3,
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
MODEL_TARGET_MODE = "forward_log_return"
VALIDATION_STRATEGY = "time_series_split"
MIN_TRAINING_ROWS_FOR_APPROVAL = 24
PANEL_SUMMARY_KEYS = (
    "panelRows",
    "horizonCoverage",
    "snapshotSources",
)


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


@dataclass(frozen=True)
class ProductMonthlySnapshot:
    set_id: str
    name: str
    product_type: str
    snapshot_date: datetime
    current_price: float
    source: str
    available_provider_count: int = 1
    provider_spread_pct: float | None = None
    captured_at: datetime | None = None
    price_charting_price: float | None = None
    price_charting_manual_only_price: float | None = None
    price_charting_sales_volume: int | None = None
    tcgplayer_price: float | None = None
    ebay_price: float | None = None
    pokedata_price: float | None = None
    pokedata_best_price: float | None = None


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
    return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)


def month_start(value: datetime) -> datetime:
    normalized = value.astimezone(timezone.utc)
    return normalized.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def add_months(value: datetime, months: int) -> datetime:
    month_index = value.year * 12 + (value.month - 1) + months
    year, month_zero_index = divmod(month_index, 12)
    return value.replace(
        year=year,
        month=month_zero_index + 1,
        day=1,
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )


def months_between(start: datetime, end: datetime) -> int:
    start_month = month_start(start)
    end_month = month_start(end)
    return (end_month.year - start_month.year) * 12 + (end_month.month - start_month.month)


def parse_snapshot_month(value: str | None, captured_at: str | None = None) -> datetime | None:
    candidate = (value or "").strip()
    if candidate:
        if len(candidate) == 7:
            candidate = f"{candidate}-01"
        parsed = datetime.fromisoformat(candidate)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return month_start(parsed)

    if not captured_at:
        return None

    normalized = captured_at.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return month_start(parsed)


def parse_capture_datetime(value: str | None) -> datetime | None:
    candidate = (value or "").strip()
    if not candidate:
        return None

    normalized = candidate.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def first_positive_price(*candidates: Any) -> float | None:
    for candidate in candidates:
        if isinstance(candidate, (int, float)) and float(candidate) > 0:
            return round(float(candidate), 2)
    return None


def maybe_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def maybe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and float(value).is_integer():
        return int(value)
    return None


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def positive_numbers(*candidates: Any) -> list[float]:
    return [
        round(float(candidate), 2)
        for candidate in candidates
        if isinstance(candidate, (int, float)) and float(candidate) > 0
    ]


def compute_provider_spread_pct(*candidates: Any) -> float | None:
    values = positive_numbers(*candidates)
    if len(values) < 2:
        return None

    midpoint = sum(values) / len(values)
    if midpoint <= 0:
        return None

    return round(((max(values) - min(values)) / midpoint) * 100.0, 3)


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
        series.append((datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc), price))

    if len(series) < 8:
        raise ValueError(f"Insufficient price history for {product.name}")

    return series


def build_backfill_snapshots(
    product: ProductManifest,
    session: requests.Session,
) -> list[ProductMonthlySnapshot]:
    monthly_snapshots: dict[str, ProductMonthlySnapshot] = {}
    for snapshot_date, current_price in fetch_price_series(product, session):
        normalized_date = month_start(snapshot_date)
        key = normalized_date.date().isoformat()
        monthly_snapshots[key] = ProductMonthlySnapshot(
            set_id=product.set_id,
            name=product.name,
            product_type=product.product_type,
            snapshot_date=normalized_date,
            current_price=round(float(current_price), 2),
            source="pricecharting_html_backfill",
            captured_at=normalized_date,
            price_charting_price=round(float(current_price), 2),
        )

    return sorted(monthly_snapshots.values(), key=lambda snapshot: snapshot.snapshot_date)


def load_dual_provider_snapshots(
    products: list[ProductManifest],
    snapshot_path: Path = TRAINING_SNAPSHOT_PATH,
) -> dict[str, list[ProductMonthlySnapshot]]:
    if not snapshot_path.exists():
        return {}

    raw_payload = json.loads(snapshot_path.read_text() or "[]")
    if not isinstance(raw_payload, list):
        return {}

    manifest_by_id = {product.set_id: product for product in products}
    snapshots_by_set: dict[str, dict[str, ProductMonthlySnapshot]] = defaultdict(dict)

    for item in raw_payload:
        if not isinstance(item, dict):
            continue

        set_id = str(item.get("setId") or "").strip()
        if not set_id:
            continue

        manifest_product = manifest_by_id.get(set_id)
        snapshot_date = parse_snapshot_month(
            str(item.get("snapshotMonth") or "").strip() or None,
            str(item.get("capturedAt") or "").strip() or None,
        )
        if snapshot_date is None:
            continue

        current_price = first_positive_price(
            item.get("priceChartingPrice"),
            item.get("pokedataBestPrice"),
            item.get("tcgplayerPrice"),
            item.get("ebayPrice"),
            item.get("pokedataPrice"),
        )
        if current_price is None:
            continue

        provider_candidates = (
            item.get("priceChartingPrice"),
            item.get("pokedataBestPrice"),
            item.get("tcgplayerPrice"),
            item.get("ebayPrice"),
            item.get("pokedataPrice"),
        )
        provider_count = item.get("availableProviderCount")
        if not isinstance(provider_count, int) or provider_count <= 0:
            provider_count = sum(
                1
                for candidate in provider_candidates
                if isinstance(candidate, (int, float)) and float(candidate) > 0
            )

        captured_at = parse_capture_datetime(str(item.get("capturedAt") or "").strip() or None)
        provider_spread_pct = maybe_float(item.get("providerSpreadPct"))
        if provider_spread_pct is None:
            provider_spread_pct = compute_provider_spread_pct(*provider_candidates)

        snapshot = ProductMonthlySnapshot(
            set_id=set_id,
            name=str(item.get("name") or (manifest_product.name if manifest_product else set_id)),
            product_type=str(
                item.get("productType")
                or (manifest_product.product_type if manifest_product else "Unknown")
            ),
            snapshot_date=snapshot_date,
            current_price=current_price,
            source="dual_provider_artifact",
            available_provider_count=max(int(provider_count), 1),
            provider_spread_pct=provider_spread_pct,
            captured_at=captured_at,
            price_charting_price=maybe_float(item.get("priceChartingPrice")),
            price_charting_manual_only_price=maybe_float(item.get("priceChartingManualOnlyPrice")),
            price_charting_sales_volume=maybe_int(item.get("priceChartingSalesVolume")),
            tcgplayer_price=maybe_float(item.get("tcgplayerPrice")),
            ebay_price=maybe_float(item.get("ebayPrice")),
            pokedata_price=maybe_float(item.get("pokedataPrice")),
            pokedata_best_price=maybe_float(item.get("pokedataBestPrice")),
        )
        snapshots_by_set[set_id][snapshot.snapshot_date.date().isoformat()] = snapshot

    return {
        set_id: sorted(snapshot_map.values(), key=lambda snapshot: snapshot.snapshot_date)
        for set_id, snapshot_map in snapshots_by_set.items()
    }


def safe_pct_change(current_price: float, previous_price: float | None) -> float | None:
    if previous_price is None or previous_price <= 0:
        return None
    return round(((current_price - previous_price) / previous_price) * 100.0, 3)


def collect_window_snapshots(
    snapshots: list[ProductMonthlySnapshot],
    index: int,
    lookback_months: int,
) -> list[ProductMonthlySnapshot]:
    current_snapshot = snapshots[index]
    window: list[ProductMonthlySnapshot] = []
    for candidate in snapshots[: index + 1]:
        delta = months_between(candidate.snapshot_date, current_snapshot.snapshot_date)
        if 0 <= delta <= lookback_months:
            window.append(candidate)
    return window


def compute_trailing_volatility(
    snapshots: list[ProductMonthlySnapshot],
    index: int,
    lookback_months: int,
) -> float | None:
    window = collect_window_snapshots(snapshots, index, lookback_months)
    if len(window) < 4:
        return None

    returns: list[float] = []
    for previous, current in zip(window, window[1:]):
        if previous.current_price <= 0 or current.current_price <= 0:
            continue
        month_gap = months_between(previous.snapshot_date, current.snapshot_date)
        if month_gap <= 0 or month_gap > 2:
            continue
        monthly_log_return = math.log(current.current_price / previous.current_price) / month_gap
        returns.append(monthly_log_return)

    if len(returns) < 3:
        return None

    return round(float(np.std(np.array(returns), ddof=0) * 100.0), 4)


def compute_drawdown_pct(
    snapshots: list[ProductMonthlySnapshot],
    index: int,
    lookback_months: int,
) -> float | None:
    current_price = snapshots[index].current_price
    if current_price <= 0:
        return None

    window = collect_window_snapshots(snapshots, index, lookback_months)
    peak_price = max((snapshot.current_price for snapshot in window if snapshot.current_price > 0), default=0.0)
    if peak_price <= 0:
        return None

    return round(((current_price / peak_price) - 1.0) * 100.0, 3)


def compute_history_density_pct(
    snapshots: list[ProductMonthlySnapshot],
    index: int,
    lookback_months: int,
) -> float:
    window = collect_window_snapshots(snapshots, index, lookback_months)
    observed = len(window)
    age_in_months = months_between(snapshots[0].snapshot_date, snapshots[index].snapshot_date)
    expected = min(lookback_months, age_in_months) + 1
    expected = max(expected, 1)
    return round((observed / expected) * 100.0, 2)


def compute_provider_agreement_score(
    provider_count: int,
    provider_spread_pct: float | None,
) -> float | None:
    if provider_count < 2 or provider_spread_pct is None:
        return None

    spread_penalty = clamp(provider_spread_pct * 2.0, 0.0, 100.0)
    breadth_bonus = clamp(float(provider_count - 2) * 5.0, 0.0, 10.0)
    return round(clamp(100.0 - spread_penalty + breadth_bonus, 0.0, 100.0), 2)


def compute_snapshot_freshness_days(snapshot: ProductMonthlySnapshot) -> float:
    if snapshot.captured_at is None:
        return 0.0

    delta_days = max((snapshot.captured_at - snapshot.snapshot_date).total_seconds() / 86400.0, 0.0)
    return round(delta_days, 2)


def compute_liquidity_proxy_score(
    provider_count: int,
    history_density_pct: float,
    sales_volume: int | None,
) -> float:
    provider_component = min(max(provider_count, 1), 4) / 4.0 * 35.0
    density_component = clamp(history_density_pct, 0.0, 100.0) / 100.0 * 45.0
    sales_component = 0.0
    if isinstance(sales_volume, int) and sales_volume > 0:
        sales_component = min(math.log1p(sales_volume) / math.log1p(50), 1.0) * 20.0

    return round(clamp(provider_component + density_component + sales_component, 0.0, 100.0), 2)


def build_engineered_features(
    snapshots: list[ProductMonthlySnapshot],
    index: int,
) -> dict[str, float | None]:
    snapshot = snapshots[index]
    price_momentum_1mo = safe_pct_change(
        snapshot.current_price,
        resolve_snapshot_price_at_offset(snapshots, index, -1, tolerance=1),
    )
    price_momentum_12mo = safe_pct_change(
        snapshot.current_price,
        resolve_snapshot_price_at_offset(snapshots, index, -12, tolerance=2),
    )
    price_volatility_6mo = compute_trailing_volatility(snapshots, index, 6)
    price_volatility_12mo = compute_trailing_volatility(snapshots, index, 12)
    drawdown_12mo = compute_drawdown_pct(snapshots, index, 12)
    history_density_12mo = compute_history_density_pct(snapshots, index, 12)
    provider_spread_pct = snapshot.provider_spread_pct
    provider_agreement_score = compute_provider_agreement_score(
        snapshot.available_provider_count,
        provider_spread_pct,
    )
    snapshot_freshness_days = compute_snapshot_freshness_days(snapshot)
    liquidity_proxy_score = compute_liquidity_proxy_score(
        snapshot.available_provider_count,
        history_density_12mo,
        snapshot.price_charting_sales_volume,
    )
    history_window_missing_flag = 1.0 if (
        price_momentum_12mo is None
        or price_volatility_12mo is None
        or drawdown_12mo is None
    ) else 0.0
    provider_context_missing_flag = 1.0 if (
        provider_spread_pct is None or snapshot.available_provider_count < 2
    ) else 0.0

    return {
        "price_momentum_1mo": price_momentum_1mo,
        "price_momentum_12mo": price_momentum_12mo,
        "price_volatility_6mo": price_volatility_6mo,
        "price_volatility_12mo": price_volatility_12mo,
        "drawdown_12mo": drawdown_12mo,
        "history_density_12mo": history_density_12mo,
        "available_provider_count": float(snapshot.available_provider_count),
        "provider_spread_pct": provider_spread_pct,
        "provider_agreement_score": provider_agreement_score,
        "snapshot_freshness_days": snapshot_freshness_days,
        "liquidity_proxy_score": liquidity_proxy_score,
        "history_window_missing_flag": history_window_missing_flag,
        "provider_context_missing_flag": provider_context_missing_flag,
    }


def resolve_snapshot_price_at_offset(
    snapshots: list[ProductMonthlySnapshot],
    index: int,
    months_offset: int,
    tolerance: int = 0,
) -> float | None:
    if months_offset == 0:
        return snapshots[index].current_price

    current_snapshot = snapshots[index]
    if months_offset > 0:
        candidates = snapshots[index + 1 :]
    else:
        candidates = snapshots[:index]

    if not candidates:
        return None

    best_match: ProductMonthlySnapshot | None = None
    best_score: tuple[int, int] | None = None

    for candidate in candidates:
        offset = months_between(current_snapshot.snapshot_date, candidate.snapshot_date)
        deviation = abs(offset - months_offset)
        if deviation > tolerance:
            continue

        prefer_past_target = 0 if offset <= months_offset else 1
        candidate_score = (deviation, prefer_past_target)
        if best_score is None or candidate_score < best_score:
            best_match = candidate
            best_score = candidate_score

    if best_match and best_match.current_price > 0:
        return best_match.current_price

    return None


def is_snapshot_due_for_horizon(
    snapshots: list[ProductMonthlySnapshot],
    index: int,
    months_forward: int,
    tolerance: int = 0,
) -> bool:
    if not snapshots:
        return False

    latest_snapshot = snapshots[-1]
    current_snapshot = snapshots[index]
    effective_months_forward = max(months_forward - tolerance, 0)
    return (
        months_between(current_snapshot.snapshot_date, latest_snapshot.snapshot_date)
        >= effective_months_forward
    )


def merge_product_snapshots(
    backfill_snapshots: list[ProductMonthlySnapshot],
    artifact_snapshots: list[ProductMonthlySnapshot],
) -> tuple[list[ProductMonthlySnapshot], dict[str, int]]:
    merged_by_month = {
        snapshot.snapshot_date.date().isoformat(): snapshot for snapshot in backfill_snapshots
    }
    overlayed = 0
    added = 0

    for snapshot in artifact_snapshots:
        key = snapshot.snapshot_date.date().isoformat()
        if key in merged_by_month:
            overlayed += 1
        else:
            added += 1
        merged_by_month[key] = snapshot

    merged = sorted(merged_by_month.values(), key=lambda snapshot: snapshot.snapshot_date)
    return merged, {
        "artifactMonthsOverlayed": overlayed,
        "artifactMonthsAdded": added,
    }


def extract_panel_summary(summary: dict[str, Any]) -> dict[str, Any]:
    return {
        key: summary[key]
        for key in PANEL_SUMMARY_KEYS
        if key in summary
    }


def finalize_horizon_coverage(
    coverage: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    finalized: dict[str, dict[str, Any]] = {}
    for horizon, details in coverage.items():
        due_rows = int(details["dueRows"])
        captured_rows = int(details["capturedRows"])
        panel_rows = int(details["panelRows"])
        finalized[horizon] = {
            **details,
            "capturedShareOfDuePct": round((captured_rows / due_rows) * 100.0, 2)
            if due_rows > 0
            else 0.0,
            "capturedShareOfPanelPct": round((captured_rows / panel_rows) * 100.0, 2)
            if panel_rows > 0
            else 0.0,
            "minimumTrainingRowsForApproval": MIN_TRAINING_ROWS_FOR_APPROVAL,
            "meetsMinimumTrainingRows": captured_rows >= MIN_TRAINING_ROWS_FOR_APPROVAL,
        }

    return finalized


def build_panel_summary(
    coverage: dict[str, dict[str, Any]],
    panel_rows: int,
    snapshot_sources: dict[str, int],
) -> dict[str, Any]:
    return {
        "panelRows": panel_rows,
        "horizonCoverage": finalize_horizon_coverage(coverage),
        "snapshotSources": snapshot_sources,
    }


def build_training_rows(
    products: list[ProductManifest],
) -> tuple[pd.DataFrame, dict[str, Any], dict[str, Any]]:
    session = requests.Session()
    session.headers.update(REQUEST_HEADERS)

    rows: list[dict[str, Any]] = []
    history_summary: dict[str, Any] = {}
    artifact_snapshots_by_set = load_dual_provider_snapshots(products)
    snapshot_sources = {
        "dualProviderArtifactRows": 0,
        "priceChartingHtmlBackfillRows": 0,
        "artifactMonthsOverlayed": 0,
        "artifactMonthsAdded": 0,
        "productsWithArtifactSnapshots": 0,
    }
    horizon_coverage = {
        horizon: {
            "monthsForward": HORIZON_MONTHS[horizon],
            "toleranceMonths": HORIZON_TOLERANCE_MONTHS[horizon],
            "panelRows": 0,
            "dueRows": 0,
            "capturedRows": 0,
            "missingRows": 0,
            "pendingRows": 0,
        }
        for horizon in TARGETS
    }
    panel_row_count = 0

    for product in products:
        backfill_snapshots = build_backfill_snapshots(product, session)
        artifact_snapshots = artifact_snapshots_by_set.get(product.set_id, [])
        merged_snapshots, merge_stats = merge_product_snapshots(
            backfill_snapshots,
            artifact_snapshots,
        )
        if not merged_snapshots:
            continue

        snapshot_sources["dualProviderArtifactRows"] += sum(
            1 for snapshot in merged_snapshots if snapshot.source == "dual_provider_artifact"
        )
        snapshot_sources["priceChartingHtmlBackfillRows"] += sum(
            1 for snapshot in merged_snapshots if snapshot.source == "pricecharting_html_backfill"
        )
        snapshot_sources["artifactMonthsOverlayed"] += merge_stats["artifactMonthsOverlayed"]
        snapshot_sources["artifactMonthsAdded"] += merge_stats["artifactMonthsAdded"]
        if artifact_snapshots:
            snapshot_sources["productsWithArtifactSnapshots"] += 1

        release_date = parse_release_date(product.release_date)
        latest_index = len(merged_snapshots) - 1
        latest_snapshot = merged_snapshots[latest_index]
        latest_price = latest_snapshot.current_price
        latest_6mo = safe_pct_change(
            latest_price,
            resolve_snapshot_price_at_offset(merged_snapshots, latest_index, -6, tolerance=1),
        )
        latest_24mo = safe_pct_change(
            latest_price,
            resolve_snapshot_price_at_offset(merged_snapshots, latest_index, -24, tolerance=2),
        )
        latest_engineered_features = build_engineered_features(merged_snapshots, latest_index)
        history_summary[product.set_id] = {
            "name": product.name,
            "latestPriceDate": latest_snapshot.snapshot_date.date().isoformat(),
            "latestHistoricalPrice": round(latest_price, 2),
            "priceTrajectory6mo": latest_6mo,
            "priceTrajectory24mo": latest_24mo,
            "historyPoints": len(merged_snapshots),
            "latestSnapshotSource": latest_snapshot.source,
            "latestSnapshotProviderCount": latest_snapshot.available_provider_count,
            "latestSnapshotProviderSpreadPct": latest_snapshot.provider_spread_pct,
            "latestSnapshotFreshnessDays": latest_engineered_features["snapshot_freshness_days"],
            "priceMomentum1mo": latest_engineered_features["price_momentum_1mo"],
            "priceMomentum12mo": latest_engineered_features["price_momentum_12mo"],
            "priceVolatility6mo": latest_engineered_features["price_volatility_6mo"],
            "priceVolatility12mo": latest_engineered_features["price_volatility_12mo"],
            "drawdown12mo": latest_engineered_features["drawdown_12mo"],
            "historyDensity12mo": latest_engineered_features["history_density_12mo"],
            "providerAgreementScore": latest_engineered_features["provider_agreement_score"],
            "liquidityProxyScore": latest_engineered_features["liquidity_proxy_score"],
            "historyWindowMissingFlag": latest_engineered_features["history_window_missing_flag"],
            "providerContextMissingFlag": latest_engineered_features["provider_context_missing_flag"],
            "latestPriceChartingSalesVolume": latest_snapshot.price_charting_sales_volume,
        }

        for index, snapshot in enumerate(merged_snapshots):
            if index % SNAPSHOT_STEP_MONTHS != 0:
                continue

            panel_row_count += 1
            target_prices: dict[str, float | None] = {}
            for horizon, months_forward in HORIZON_MONTHS.items():
                coverage_entry = horizon_coverage[horizon]
                coverage_entry["panelRows"] += 1
                tolerance = HORIZON_TOLERANCE_MONTHS[horizon]
                is_due = is_snapshot_due_for_horizon(
                    merged_snapshots,
                    index,
                    months_forward,
                    tolerance=tolerance,
                )
                if is_due:
                    coverage_entry["dueRows"] += 1
                else:
                    coverage_entry["pendingRows"] += 1

                target_price = (
                    resolve_snapshot_price_at_offset(
                        merged_snapshots,
                        index,
                        months_forward,
                        tolerance=tolerance,
                    )
                    if is_due
                    else None
                )
                target_prices[horizon] = target_price

                if is_due:
                    if target_price is not None:
                        coverage_entry["capturedRows"] += 1
                    else:
                        coverage_entry["missingRows"] += 1

            if not any(target_prices.values()):
                continue

            age_days = max((snapshot.snapshot_date - release_date).days, 0)
            set_age_years = round(age_days / 365.25, 4)
            engineered_features = build_engineered_features(merged_snapshots, index)

            row = {
                "row_id": f"{product.set_id}:{snapshot.snapshot_date.date().isoformat()}",
                "set_id": product.set_id,
                "name": product.name,
                "product_type": product.product_type,
                "snapshot_date": snapshot.snapshot_date.date().isoformat(),
                "current_price": round(snapshot.current_price, 2),
                "most_expensive_card_price": product.most_expensive_card_price,
                "chase_card_count": product.chase_card_count,
                "chase_card_index_score": product.chase_card_index_score,
                "set_age_years": set_age_years,
                "google_trends_score": product.google_trends_score,
                "print_run_type_encoded": encode_print_run(product.print_run_type),
                "price_trajectory_6mo": safe_pct_change(
                    snapshot.current_price,
                    resolve_snapshot_price_at_offset(merged_snapshots, index, -6, tolerance=1),
                ),
                "price_trajectory_24mo": safe_pct_change(
                    snapshot.current_price,
                    resolve_snapshot_price_at_offset(merged_snapshots, index, -24, tolerance=2),
                ),
                "collector_demand_ratio": product.collector_demand_ratio,
                "market_cycle_score": market_cycle_for_date(snapshot.snapshot_date),
                "popularity_score": product.popularity_score,
                "product_type_encoded": encode_product_type(product.product_type),
                "era_encoded": encode_era(product.era),
                **engineered_features,
                "price_1yr_later": target_prices["1yr"],
                "price_3yr_later": target_prices["3yr"],
                "price_5yr_later": target_prices["5yr"],
            }
            rows.append(row)

    if not rows:
        raise RuntimeError("No training rows were generated")

    frame = pd.DataFrame(rows)
    frame.sort_values(["snapshot_date", "name"], inplace=True)

    summary = build_dataset_summary(
        frame,
        len(products),
        panel_summary=build_panel_summary(
            horizon_coverage,
            panel_row_count,
            snapshot_sources,
        ),
    )
    return frame, summary, history_summary


def build_dataset_summary(
    frame: pd.DataFrame,
    product_count: int,
    panel_summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    summary = {
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(),
        "products": product_count,
        "rows": int(frame.shape[0]),
        "rowsBySet": Counter(frame["set_id"]).most_common(),
        "horizons": {
            horizon: int(frame[target].notna().sum()) for horizon, target in TARGETS.items()
        },
    }

    if panel_summary:
        summary.update(panel_summary)

    return summary


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
    summary_path = data_dir / SUMMARY_FILENAME
    if not dataset_path.exists() or not history_path.exists():
        raise FileNotFoundError("Cached training artifacts are missing")

    frame = pd.read_csv(dataset_path)
    frame.sort_values(["snapshot_date", "name"], inplace=True)
    history_summary = json.loads(history_path.read_text())
    if summary_path.exists():
        summary = json.loads(summary_path.read_text())
    else:
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


def build_forward_log_return_target(
    current_prices: pd.Series, target_prices: pd.Series
) -> pd.Series:
    current = current_prices.astype(float)
    future = target_prices.astype(float)
    values = pd.Series(np.nan, index=target_prices.index, dtype=float)
    valid_mask = (current > 0) & (future > 0)
    values.loc[valid_mask] = np.log(
        future.loc[valid_mask].to_numpy(dtype=float)
        / current.loc[valid_mask].to_numpy(dtype=float)
    )
    return values


def evaluate_cross_validation(
    features: pd.DataFrame,
    current_prices: pd.Series,
    target_prices: pd.Series,
    target_returns: pd.Series,
) -> dict[str, float]:
    sample_count = len(features)
    fold_count = min(5, sample_count - 1)
    if fold_count < 2:
        return {
            "folds": float(max(fold_count, 1)),
            "rmse": 0.0,
            "mae": 0.0,
            "mape": 0.0,
            "returnRmse": 0.0,
            "returnMae": 0.0,
            "strategy": VALIDATION_STRATEGY,
        }

    splitter = TimeSeriesSplit(n_splits=fold_count)
    predictions: list[float] = []
    actuals: list[float] = []
    return_predictions: list[float] = []
    return_actuals: list[float] = []

    for train_idx, test_idx in splitter.split(features):
        model = make_model()
        x_train = features.iloc[train_idx]
        x_test = features.iloc[test_idx]
        y_train = target_returns.iloc[train_idx].to_numpy(dtype=float)
        y_test = target_returns.iloc[test_idx].to_numpy(dtype=float)
        current_test = current_prices.iloc[test_idx].to_numpy(dtype=float)
        actual_price = target_prices.iloc[test_idx].to_numpy(dtype=float)

        model.fit(x_train, y_train)
        pred_return = model.predict(x_test)
        pred = current_test * np.exp(pred_return)

        predictions.extend(pred.tolist())
        actuals.extend(actual_price.tolist())
        return_predictions.extend(pred_return.tolist())
        return_actuals.extend(y_test.tolist())

    pred_arr = np.array(predictions)
    actual_arr = np.array(actuals)
    pred_return_arr = np.array(return_predictions)
    actual_return_arr = np.array(return_actuals)
    rmse = float(np.sqrt(np.mean((pred_arr - actual_arr) ** 2)))
    mae = float(np.mean(np.abs(pred_arr - actual_arr)))
    mape = float(np.mean(np.abs((pred_arr - actual_arr) / np.maximum(actual_arr, 1e-6))) * 100.0)
    return_rmse = float(np.sqrt(np.mean((pred_return_arr - actual_return_arr) ** 2)))
    return_mae = float(np.mean(np.abs(pred_return_arr - actual_return_arr)))

    return {
        "folds": float(fold_count),
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
        "mape": round(mape, 4),
        "returnRmse": round(return_rmse, 6),
        "returnMae": round(return_mae, 6),
        "strategy": VALIDATION_STRATEGY,
    }


def train_model(
    frame: pd.DataFrame,
    horizon: str,
    target_column: str,
    output_dir: Path = DATA_DIR,
) -> dict[str, Any]:
    usable = frame[
        frame[target_column].notna() & (frame["current_price"].astype(float) > 0)
    ].copy()
    if usable.empty:
        raise RuntimeError(f"No rows available for {horizon} model")

    usable.sort_values(["snapshot_date", "name"], inplace=True)
    features = usable[FEATURE_NAMES].astype(float)
    current_prices = usable["current_price"].astype(float)
    target_prices = usable[target_column].astype(float)
    target_returns = build_forward_log_return_target(current_prices, target_prices)
    if target_returns.isna().all():
        raise RuntimeError(f"No valid forward returns available for {horizon} model")
    cv_metrics = evaluate_cross_validation(
        features,
        current_prices,
        target_prices,
        target_returns,
    )

    model = make_model()
    logged_target = target_returns.to_numpy(dtype=float)
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
    mean_target_price = float(target_prices.mean())
    mean_target_return_percent = float(
        (np.exp(target_returns.to_numpy(dtype=float)).mean() - 1) * 100.0
    )
    mae_share_of_mean_target = (
        float(cv_metrics["mae"]) / mean_target_price if mean_target_price > 0 else 0.0
    )
    dominant_feature = global_importance[0] if global_importance else None
    manual_review_reasons: list[str] = []

    if int(usable.shape[0]) < MIN_TRAINING_ROWS_FOR_APPROVAL:
        manual_review_reasons.append(
            f"Only {int(usable.shape[0])} training rows available; minimum approval threshold is {MIN_TRAINING_ROWS_FOR_APPROVAL}"
        )

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
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(),
        "horizon": horizon,
        "targetColumn": target_column,
        "targetMode": MODEL_TARGET_MODE,
        "featureNames": FEATURE_NAMES,
        "baseScore": base_score,
        "trees": trees,
        "treeCount": len(trees),
        "trainingRows": int(usable.shape[0]),
        "crossValidation": cv_metrics,
        "meanTargetPrice": round(mean_target_price, 4),
        "meanTargetReturnPercent": round(mean_target_return_percent, 4),
        "historicalErrorPercent": round(float(cv_metrics["mape"]), 4),
        "maeShareOfMeanTarget": round(mae_share_of_mean_target, 4),
        "targetTransform": TARGET_TRANSFORM,
        "validationStrategy": VALIDATION_STRATEGY,
        "minimumTrainingRowsForApproval": MIN_TRAINING_ROWS_FOR_APPROVAL,
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
        "meanTargetReturnPercent": round(mean_target_return_percent, 4),
        "historicalErrorPercent": round(float(cv_metrics["mape"]), 4),
        "maeShareOfMeanTarget": round(mae_share_of_mean_target, 4),
        "targetMode": MODEL_TARGET_MODE,
        "targetTransform": TARGET_TRANSFORM,
        "validationStrategy": VALIDATION_STRATEGY,
        "minimumTrainingRowsForApproval": MIN_TRAINING_ROWS_FOR_APPROVAL,
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
    summary = build_dataset_summary(frame, len(products), panel_summary=extract_panel_summary(summary))
    summary["audit"] = audit_summary
    summary["targetMode"] = MODEL_TARGET_MODE
    summary["validationStrategy"] = VALIDATION_STRATEGY
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
