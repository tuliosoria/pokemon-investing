from __future__ import annotations

import json
import os
from collections import Counter
from decimal import Decimal
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import boto3
import numpy as np
import pandas as pd
import requests
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import BotoCoreError, ClientError

try:
    from scripts.train_sealed_ml import (
        DEFAULT_OUTPUT_DIR,
        FEATURE_NAMES,
        HORIZON_MONTHS,
        HORIZON_TOLERANCE_MONTHS,
        ProductMonthlySnapshot,
        TARGETS,
        add_months,
        audit_training_frame,
        build_dataset_summary,
        build_training_rows,
        extract_panel_summary,
        load_cached_training_artifacts,
        load_manifest,
        month_start,
        parse_capture_datetime,
        parse_snapshot_month,
        train_models,
        write_training_data_artifacts,
        write_training_summary,
    )
except ModuleNotFoundError:
    from train_sealed_ml import (
        DEFAULT_OUTPUT_DIR,
        FEATURE_NAMES,
        HORIZON_MONTHS,
        HORIZON_TOLERANCE_MONTHS,
        ProductMonthlySnapshot,
        TARGETS,
        add_months,
        audit_training_frame,
        build_dataset_summary,
        build_training_rows,
        extract_panel_summary,
        load_cached_training_artifacts,
        load_manifest,
        month_start,
        parse_capture_datetime,
        parse_snapshot_month,
        train_models,
        write_training_data_artifacts,
        write_training_summary,
    )

OUTPUT_DIR = Path(os.environ.get("SEALED_ML_OUTPUT_DIR", str(DEFAULT_OUTPUT_DIR)))
MODEL_PK = "SEALED_MODEL#sealed-forecast"
LOOKUP_ENTITY_TYPE = "SEALED_FORECAST_LOOKUP"
MODEL_CHUNK_SIZE = 240_000
TRAINING_SNAPSHOT_ENTITY_TYPE = "SEALED_TRAINING_SNAPSHOT"

READY_FIELDS = {
    "1yr": "readyForRetraining1yrAt",
    "3yr": "readyForRetraining3yrAt",
    "5yr": "readyForRetraining5yrAt",
}

CAPTURED_FIELDS = {
    "1yr": "capturedTarget1yr",
    "3yr": "capturedTarget3yr",
    "5yr": "capturedTarget5yr",
}


def env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def parse_iso_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized).astimezone(timezone.utc)


def get_lookup_table():
    table_name = os.environ.get("DYNAMODB_TABLE")
    if not table_name:
        return None

    dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return dynamodb.Table(table_name)


def scan_lookup_items(table) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    scan_kwargs = {
        "FilterExpression": Attr("entityType").eq(LOOKUP_ENTITY_TYPE),
    }

    while True:
        response = table.scan(**scan_kwargs)
        items.extend(response.get("Items", []))
        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_evaluated_key

    return items


def get_due_horizons(item: dict[str, Any], now: datetime) -> list[str]:
    due: list[str] = []
    for horizon, ready_field in READY_FIELDS.items():
        ready_at = parse_iso_timestamp(item.get(ready_field))
        if not ready_at:
            continue
        if ready_at <= now and not item.get(CAPTURED_FIELDS[horizon]):
            due.append(horizon)
    return due


def coerce_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    return None


def coerce_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    return None


def first_positive_numeric(*candidates: Any) -> float | None:
    for candidate in candidates:
        normalized = coerce_float(candidate)
        if normalized is not None and normalized > 0:
            return round(normalized, 2)
    return None


def query_partition_items(
    table,
    partition_key: str,
    sort_key_prefix: str,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    query_kwargs: dict[str, Any] = {
        "KeyConditionExpression": Key("pk").eq(partition_key) & Key("sk").begins_with(sort_key_prefix),
    }

    while True:
        response = table.query(**query_kwargs)
        items.extend(response.get("Items", []))
        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break
        query_kwargs["ExclusiveStartKey"] = last_evaluated_key

    return items


def build_stored_training_snapshot(item: dict[str, Any]) -> ProductMonthlySnapshot | None:
    if item.get("entityType") != TRAINING_SNAPSHOT_ENTITY_TYPE:
        return None

    snapshot_date = parse_snapshot_month(
        str(item.get("snapshotMonth") or "").strip() or None,
        str(item.get("capturedAt") or "").strip() or None,
    )
    if snapshot_date is None:
        return None

    current_price = first_positive_numeric(
        item.get("priceChartingPrice"),
        item.get("pokedataBestPrice"),
        item.get("tcgplayerPrice"),
        item.get("ebayPrice"),
        item.get("pokedataPrice"),
    )
    if current_price is None:
        return None

    provider_candidates = (
        item.get("priceChartingPrice"),
        item.get("pokedataBestPrice"),
        item.get("tcgplayerPrice"),
        item.get("ebayPrice"),
        item.get("pokedataPrice"),
    )
    provider_count = coerce_int(item.get("availableProviderCount"))
    if provider_count is None or provider_count <= 0:
        provider_count = sum(
            1
            for candidate in provider_candidates
            if (coerce_float(candidate) or 0.0) > 0
        )

    return ProductMonthlySnapshot(
        set_id=str(item.get("setId") or "").strip(),
        name=str(item.get("name") or "").strip(),
        product_type=str(item.get("productType") or "Unknown").strip(),
        snapshot_date=snapshot_date,
        current_price=current_price,
        source="stored_training_snapshot",
        available_provider_count=max(provider_count, 1),
        provider_spread_pct=coerce_float(item.get("providerSpreadPct")),
        captured_at=parse_capture_datetime(str(item.get("capturedAt") or "").strip() or None),
        price_charting_price=coerce_float(item.get("priceChartingPrice")),
        price_charting_manual_only_price=coerce_float(item.get("priceChartingManualOnlyPrice")),
        price_charting_sales_volume=coerce_int(item.get("priceChartingSalesVolume")),
        tcgplayer_price=coerce_float(item.get("tcgplayerPrice")),
        ebay_price=coerce_float(item.get("ebayPrice")),
        pokedata_price=coerce_float(item.get("pokedataPrice")),
        pokedata_best_price=coerce_float(item.get("pokedataBestPrice")),
    )


def load_stored_training_histories(
    table,
    set_ids: set[str],
) -> dict[str, list[ProductMonthlySnapshot]]:
    histories: dict[str, list[ProductMonthlySnapshot]] = {}
    for set_id in sorted(candidate for candidate in set_ids if candidate):
        snapshot_items = query_partition_items(
            table,
            f"SEALED_TRAINING#{set_id}",
            "SNAPSHOT#",
        )
        snapshots = [
            snapshot
            for snapshot in (
                build_stored_training_snapshot(item) for item in snapshot_items
            )
            if snapshot is not None
        ]
        if snapshots:
            histories[set_id] = sorted(snapshots, key=lambda snapshot: snapshot.snapshot_date)

    return histories


def build_stored_product_snapshot(
    item: dict[str, Any],
    pokedata_id: str,
    *,
    set_id: str,
    name: str,
    product_type: str,
) -> ProductMonthlySnapshot | None:
    snapshot_date = parse_snapshot_month(
        str(item.get("snapshotDate") or "").strip() or None,
        str(item.get("updatedAt") or "").strip() or None,
    )
    if snapshot_date is None:
        return None

    primary_provider = str(item.get("primaryProvider") or "").strip().lower()
    price_charting_price = first_positive_numeric(
        item.get("priceChartingPrice"),
        item.get("bestPrice") if primary_provider == "pricecharting" else None,
    )
    if price_charting_price is None:
        return None

    provider_count = sum(
        1
        for candidate in (
            item.get("priceChartingPrice"),
            item.get("tcgplayerPrice"),
            item.get("ebayPrice"),
            item.get("pokedataPrice"),
        )
        if (coerce_float(candidate) or 0.0) > 0
    )

    return ProductMonthlySnapshot(
        set_id=set_id,
        name=name,
        product_type=product_type,
        snapshot_date=snapshot_date,
        current_price=price_charting_price,
        source="stored_product_price_snapshot",
        available_provider_count=max(provider_count, 1),
        captured_at=parse_capture_datetime(str(item.get("updatedAt") or "").strip() or None),
        price_charting_price=coerce_float(item.get("priceChartingPrice")) or price_charting_price,
        tcgplayer_price=coerce_float(item.get("tcgplayerPrice")),
        ebay_price=coerce_float(item.get("ebayPrice")),
        pokedata_price=coerce_float(item.get("pokedataPrice")),
        pokedata_best_price=coerce_float(item.get("bestPrice")) if primary_provider == "pokedata" else None,
    )


def load_stored_product_histories(
    table,
    lookup_items: list[dict[str, Any]],
) -> dict[str, list[ProductMonthlySnapshot]]:
    histories: dict[str, list[ProductMonthlySnapshot]] = {}
    lookup_meta_by_product = {
        str(item.get("pokedataId")): {
            "set_id": str(item.get("setId") or "").strip(),
            "name": str(item.get("name") or "").strip(),
            "product_type": str(item.get("productType") or "Unknown").strip(),
        }
        for item in lookup_items
        if item.get("pokedataId")
    }

    for pokedata_id, meta in sorted(lookup_meta_by_product.items()):
        snapshot_items = query_partition_items(
            table,
            f"PRODUCT#{pokedata_id}",
            "PRICE#",
        )
        snapshots = [
            snapshot
            for snapshot in (
                build_stored_product_snapshot(
                    item,
                    pokedata_id,
                    set_id=meta["set_id"],
                    name=meta["name"],
                    product_type=meta["product_type"],
                )
                for item in snapshot_items
            )
            if snapshot is not None
        ]
        if snapshots:
            histories[pokedata_id] = sorted(snapshots, key=lambda snapshot: snapshot.snapshot_date)

    return histories


def find_target_snapshot(
    snapshots: list[ProductMonthlySnapshot],
    lookup_created_at: datetime,
    horizon: str,
) -> ProductMonthlySnapshot | None:
    months_forward = HORIZON_MONTHS[horizon]
    tolerance = HORIZON_TOLERANCE_MONTHS[horizon]
    lookup_month = month_start(lookup_created_at)
    best_match: ProductMonthlySnapshot | None = None
    best_score: tuple[int, int, int] | None = None

    for snapshot in snapshots:
        offset = (
            (snapshot.snapshot_date.year - lookup_month.year) * 12
            + snapshot.snapshot_date.month
            - lookup_month.month
        )
        deviation = abs(offset - months_forward)
        if deviation > tolerance:
            continue

        prefer_past_target = 0 if offset <= months_forward else 1
        provider_penalty = max(8 - snapshot.available_provider_count, 0)
        candidate_score = (deviation, prefer_past_target, provider_penalty)
        if best_score is None or candidate_score < best_score:
            best_match = snapshot
            best_score = candidate_score

    return best_match


def build_captured_target_payload(
    snapshot: ProductMonthlySnapshot,
    *,
    captured_at: str,
    target_month: str,
    item: dict[str, Any],
) -> dict[str, Any]:
    payload = {
        "capturedAt": captured_at,
        "price": round(snapshot.current_price, 2),
        "source": snapshot.source,
        "targetMonth": target_month,
        "snapshotDate": snapshot.snapshot_date.date().isoformat(),
        "snapshotMonth": snapshot.snapshot_date.strftime("%Y-%m"),
        "availableProviderCount": snapshot.available_provider_count,
    }

    if item.get("pokedataId"):
        payload["pokedataId"] = str(item["pokedataId"])
    if item.get("priceChartingId"):
        payload["priceChartingId"] = str(item["priceChartingId"])
    if snapshot.provider_spread_pct is not None:
        payload["providerSpreadPct"] = snapshot.provider_spread_pct
    if snapshot.price_charting_price is not None:
        payload["priceChartingPrice"] = snapshot.price_charting_price
    if snapshot.price_charting_sales_volume is not None:
        payload["priceChartingSalesVolume"] = snapshot.price_charting_sales_volume
    if snapshot.tcgplayer_price is not None:
        payload["tcgplayerPrice"] = snapshot.tcgplayer_price
    if snapshot.ebay_price is not None:
        payload["ebayPrice"] = snapshot.ebay_price
    if snapshot.pokedata_price is not None:
        payload["pokedataPrice"] = snapshot.pokedata_price
    if snapshot.pokedata_best_price is not None:
        payload["pokedataBestPrice"] = snapshot.pokedata_best_price

    return payload


def build_missing_target_payload(
    *,
    reason: str,
    target_month: str,
    item: dict[str, Any],
) -> dict[str, Any]:
    payload = {
        "reason": reason,
        "targetMonth": target_month,
    }

    if item.get("setId"):
        payload["setId"] = str(item["setId"])
    if item.get("pokedataId"):
        payload["pokedataId"] = str(item["pokedataId"])

    return payload


def capture_due_targets(
    table,
    lookup_items: list[dict[str, Any]],
    now: datetime,
) -> dict[str, Any]:
    capture_counts = {horizon: 0 for horizon in TARGETS}
    missing_counts = {horizon: 0 for horizon in TARGETS}
    source_counts: Counter[str] = Counter()
    due_lookup_count = 0
    lookups_with_captured_targets = 0
    lookups_with_missing_targets = 0

    due_lookup_items = [item for item in lookup_items if get_due_horizons(item, now)]
    training_histories = load_stored_training_histories(
        table,
        {str(item.get("setId") or "").strip() for item in due_lookup_items},
    )
    product_histories = load_stored_product_histories(table, due_lookup_items)

    for item in due_lookup_items:
        due_lookup_count += 1
        due_horizons = get_due_horizons(item, now)
        if not due_horizons:
            continue

        updated_at = now.isoformat()
        expression_values: dict[str, Any] = {
            ":updatedAt": updated_at,
        }
        set_parts = ["lastOutcomeCaptureAttemptAt = :updatedAt"]
        remove_parts: list[str] = []
        new_payloads: dict[str, dict[str, Any]] = {}
        missing_payloads: dict[str, dict[str, Any]] = {}
        lookup_created_at = parse_iso_timestamp(str(item.get("createdAt") or "").strip() or None)
        training_history = training_histories.get(str(item.get("setId") or "").strip(), [])
        product_history = product_histories.get(str(item.get("pokedataId") or "").strip(), [])

        for horizon in due_horizons:
            field_name = CAPTURED_FIELDS[horizon]
            target_month = (
                add_months(month_start(lookup_created_at), HORIZON_MONTHS[horizon]).strftime("%Y-%m")
                if lookup_created_at
                else None
            )
            target_snapshot: ProductMonthlySnapshot | None = None
            if lookup_created_at:
                if training_history:
                    target_snapshot = find_target_snapshot(training_history, lookup_created_at, horizon)
                if target_snapshot is None and product_history:
                    target_snapshot = find_target_snapshot(product_history, lookup_created_at, horizon)

            if target_snapshot is None:
                missing_reason = (
                    "missing_lookup_created_at"
                    if lookup_created_at is None
                    else "no_stored_target_source"
                    if not training_history and not product_history
                    else "no_stored_snapshot_within_tolerance"
                )
                missing_payloads[horizon] = build_missing_target_payload(
                    reason=missing_reason,
                    target_month=target_month or "unknown",
                    item=item,
                )
                missing_counts[horizon] += 1
                continue

            value_token = f":{field_name}"
            new_payloads[field_name] = build_captured_target_payload(
                target_snapshot,
                captured_at=updated_at,
                target_month=target_month or target_snapshot.snapshot_date.strftime("%Y-%m"),
                item=item,
            )
            expression_values[value_token] = new_payloads[field_name]
            set_parts.append(f"{field_name} = {value_token}")
            source_counts[target_snapshot.source] += 1

        if new_payloads:
            set_parts.append("lastOutcomeCaptureAt = :updatedAt")

        if missing_payloads:
            expression_values[":missingTargets"] = missing_payloads
            set_parts.append("lastOutcomeCaptureMissingTargets = :missingTargets")
        else:
            remove_parts.append("lastOutcomeCaptureMissingTargets")

        update_expression = "SET " + ", ".join(set_parts)
        if remove_parts:
            update_expression += " REMOVE " + ", ".join(remove_parts)

        table.update_item(
            Key={"pk": item["pk"], "sk": item["sk"]},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_values,
        )

        for field_name, payload in new_payloads.items():
            item[field_name] = payload
        if missing_payloads:
            item["lastOutcomeCaptureMissingTargets"] = missing_payloads
        else:
            item.pop("lastOutcomeCaptureMissingTargets", None)

        for horizon in due_horizons:
            if CAPTURED_FIELDS[horizon] in new_payloads:
                capture_counts[horizon] += 1

        if new_payloads:
            lookups_with_captured_targets += 1
        if missing_payloads:
            lookups_with_missing_targets += 1

    return {
        "capturedTargets": capture_counts,
        "missingStoredTargets": missing_counts,
        "captureSources": dict(source_counts),
        "dueLookupCount": due_lookup_count,
        "lookupsWithCapturedTargets": lookups_with_captured_targets,
        "lookupsWithMissingTargets": lookups_with_missing_targets,
    }


def lookup_items_to_rows(lookup_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for item in lookup_items:
        feature_snapshot = item.get("featureSnapshot") or {}
        features = feature_snapshot.get("features") or {}
        if not isinstance(features, dict) or not features:
            continue

        row = {
            "row_id": f"{item.get('setId', 'lookup')}:{item.get('sk', 'unknown')}",
            "set_id": item.get("setId") or str(item.get("pk", "")).replace("SEALED_FORECAST#", ""),
            "name": item.get("name") or "",
            "product_type": item.get("productType") or "Unknown",
            "snapshot_date": str(item.get("createdAt") or "")[:10],
            **{feature: features.get(feature, np.nan) for feature in FEATURE_NAMES},
            "price_1yr_later": (item.get(CAPTURED_FIELDS["1yr"]) or {}).get("price"),
            "price_3yr_later": (item.get(CAPTURED_FIELDS["3yr"]) or {}).get("price"),
            "price_5yr_later": (item.get(CAPTURED_FIELDS["5yr"]) or {}).get("price"),
        }

        if not any(
            row[target_column] is not None for target_column in TARGETS.values()
        ):
            continue

        rows.append(row)

    return rows


def merge_training_rows(
    base_frame: pd.DataFrame,
    lookup_rows: list[dict[str, Any]],
) -> pd.DataFrame:
    if not lookup_rows:
        return base_frame

    lookup_frame = pd.DataFrame(lookup_rows)
    for column in base_frame.columns:
        if column not in lookup_frame.columns:
            lookup_frame[column] = np.nan

    merged = pd.concat([base_frame, lookup_frame[base_frame.columns]], ignore_index=True, sort=False)
    merged.sort_values(["snapshot_date", "name"], inplace=True)
    return merged


def chunk_payload(payload: str, chunk_size: int = MODEL_CHUNK_SIZE) -> list[str]:
    return [
        payload[index : index + chunk_size]
        for index in range(0, len(payload), chunk_size)
    ]


def publish_model_artifacts(
    table,
    output_dir: Path,
    training_summary: dict[str, Any],
    published_at: datetime,
) -> None:
    timestamp = published_at.isoformat()

    for horizon in TARGETS:
        artifact_path = output_dir / f"model-{horizon}.json"
        artifact_payload = artifact_path.read_text()
        artifact_json = json.loads(artifact_payload)
        chunks = chunk_payload(artifact_payload)

        table.put_item(
            Item={
                "pk": MODEL_PK,
                "sk": f"MODEL#{horizon}#META",
                "entityType": "SEALED_FORECAST_MODEL_META",
                "horizon": horizon,
                "chunkCount": len(chunks),
                "updatedAt": timestamp,
                "generatedAt": artifact_json.get("generatedAt"),
                "trainingRows": artifact_json.get("trainingRows"),
                "crossValidation": artifact_json.get("crossValidation"),
            }
        )

        for index, chunk in enumerate(chunks):
            table.put_item(
                Item={
                    "pk": MODEL_PK,
                    "sk": f"MODEL#{horizon}#CHUNK#{index:04d}",
                    "entityType": "SEALED_FORECAST_MODEL_CHUNK",
                    "horizon": horizon,
                    "chunkIndex": index,
                    "updatedAt": timestamp,
                    "chunkData": chunk,
                }
            )

    table.put_item(
        Item={
            "pk": MODEL_PK,
            "sk": "MODEL#SUMMARY",
            "entityType": "SEALED_FORECAST_MODEL_SUMMARY",
            "updatedAt": timestamp,
            "summary": training_summary,
        }
    )


def run_retraining() -> dict[str, Any]:
    lookup_table = get_lookup_table()
    now = datetime.now(tz=timezone.utc)

    products = load_manifest()
    try:
        base_frame, summary, history_summary = load_cached_training_artifacts()
    except FileNotFoundError:
        base_frame, summary, history_summary = build_training_rows(products)

    lookup_items: list[dict[str, Any]] = []
    capture_summary = {
        "capturedTargets": {horizon: 0 for horizon in TARGETS},
        "missingStoredTargets": {horizon: 0 for horizon in TARGETS},
        "captureSources": {},
        "dueLookupCount": 0,
        "lookupsWithCapturedTargets": 0,
        "lookupsWithMissingTargets": 0,
    }
    if lookup_table:
        lookup_items = scan_lookup_items(lookup_table)
        capture_summary = capture_due_targets(lookup_table, lookup_items, now)

    lookup_rows = lookup_items_to_rows(lookup_items)
    merged_frame = merge_training_rows(base_frame, lookup_rows)
    merged_frame, audit_summary = audit_training_frame(merged_frame)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_training_data_artifacts(merged_frame, history_summary, OUTPUT_DIR)
    model_summary = train_models(merged_frame, OUTPUT_DIR)

    summary = build_dataset_summary(
        merged_frame,
        len(products),
        panel_summary=extract_panel_summary(summary),
    )
    summary["generatedAt"] = now.isoformat()
    summary["lookupRows"] = len(lookup_rows)
    summary["capturedTargets"] = capture_summary["capturedTargets"]
    summary["missingStoredTargets"] = capture_summary["missingStoredTargets"]
    summary["captureSources"] = capture_summary["captureSources"]
    summary["dueLookupCount"] = capture_summary["dueLookupCount"]
    summary["lookupsWithCapturedTargets"] = capture_summary["lookupsWithCapturedTargets"]
    summary["lookupsWithMissingTargets"] = capture_summary["lookupsWithMissingTargets"]
    summary["audit"] = audit_summary
    summary["targetMode"] = "forward_log_return"
    summary["validationStrategy"] = "time_series_split"
    summary["models"] = model_summary
    summary["deploymentApproved"] = all(
        bool(model.get("deploymentApproved")) for model in model_summary.values()
    )
    summary["publishEnabled"] = env_flag("SEALED_ML_PUBLISH_ENABLED", True)
    summary["publishedToDynamo"] = False
    summary["publishedAt"] = None
    summary["publishSkippedReason"] = None

    if not lookup_table:
        summary["publishSkippedReason"] = "dynamodb_not_configured"
    elif not summary["publishEnabled"]:
        summary["publishSkippedReason"] = "disabled_by_env"
    elif not summary["deploymentApproved"]:
        summary["publishSkippedReason"] = "deployment_not_approved"
    else:
        summary["publishedToDynamo"] = True
        summary["publishedAt"] = now.isoformat()
        publish_model_artifacts(lookup_table, OUTPUT_DIR, summary, now)

    write_training_summary(summary, OUTPUT_DIR)

    return summary


def lambda_handler(_event: dict[str, Any], _context: Any) -> dict[str, Any]:
    summary = run_retraining()
    return {
        "statusCode": 200,
        "body": json.dumps(summary),
    }


def main() -> None:
    summary = run_retraining()
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (BotoCoreError, ClientError, requests.RequestException, RuntimeError) as error:
        raise SystemExit(str(error))
