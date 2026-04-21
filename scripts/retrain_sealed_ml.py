from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import boto3
import numpy as np
import pandas as pd
import requests
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import BotoCoreError, ClientError

try:
    from scripts.train_sealed_ml import (
        FEATURE_NAMES,
        TARGETS,
        audit_training_frame,
        build_dataset_summary,
        build_training_rows,
        load_cached_training_artifacts,
        load_manifest,
        train_models,
        write_training_data_artifacts,
        write_training_summary,
    )
except ModuleNotFoundError:
    from train_sealed_ml import (
        FEATURE_NAMES,
        TARGETS,
        audit_training_frame,
        build_dataset_summary,
        build_training_rows,
        load_cached_training_artifacts,
        load_manifest,
        train_models,
        write_training_data_artifacts,
        write_training_summary,
    )

OUTPUT_DIR = Path(os.environ.get("SEALED_ML_OUTPUT_DIR", "/tmp/sealed-ml-artifacts"))
MODEL_PK = "SEALED_MODEL#sealed-forecast"
LOOKUP_ENTITY_TYPE = "SEALED_FORECAST_LOOKUP"
MODEL_CHUNK_SIZE = 240_000
POKEDATA_BASE = "https://www.pokedata.io/v0"

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


def parse_iso_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized).astimezone(UTC)


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


def extract_best_price(pricing_payload: dict[str, Any]) -> float | None:
    pricing = pricing_payload.get("pricing") or {}
    tcg = pricing.get("TCGPlayer", {}).get("value")
    ebay = pricing.get("eBay Sealed", {}).get("value")
    pokedata = pricing.get("Pokedata Sealed", {}).get("value")

    for candidate in (tcg, pokedata, ebay):
        if isinstance(candidate, (int, float)) and candidate > 0:
            return round(float(candidate), 2)

    return None


def fetch_current_price(session: requests.Session, pokedata_id: str, api_key: str) -> float | None:
    url = f"{POKEDATA_BASE}/pricing"
    response = session.get(
        url,
        params={"id": pokedata_id, "asset_type": "PRODUCT"},
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    return extract_best_price(payload)


def get_due_horizons(item: dict[str, Any], now: datetime) -> list[str]:
    due: list[str] = []
    for horizon, ready_field in READY_FIELDS.items():
        ready_at = parse_iso_timestamp(item.get(ready_field))
        if not ready_at:
            continue
        if ready_at <= now and not item.get(CAPTURED_FIELDS[horizon]):
            due.append(horizon)
    return due


def capture_due_targets(
    table,
    lookup_items: list[dict[str, Any]],
    now: datetime,
    api_key: str,
) -> dict[str, int]:
    capture_counts = {horizon: 0 for horizon in TARGETS}
    session = requests.Session()

    for item in lookup_items:
        due_horizons = get_due_horizons(item, now)
        pokedata_id = item.get("pokedataId")
        if not due_horizons:
            continue
        if not pokedata_id:
            raise RuntimeError(f"Lookup {item.get('pk')} / {item.get('sk')} is missing pokedataId")

        current_price = fetch_current_price(session, str(pokedata_id), api_key)
        if current_price is None:
            continue

        updated_at = now.isoformat()
        expression_values: dict[str, Any] = {
            ":updatedAt": updated_at,
        }
        update_parts = ["lastOutcomeCaptureAt = :updatedAt"]
        new_payloads: dict[str, dict[str, Any]] = {}

        for horizon in due_horizons:
            field_name = CAPTURED_FIELDS[horizon]
            value_token = f":{field_name}"
            new_payloads[field_name] = {
                "capturedAt": updated_at,
                "price": current_price,
                "pokedataId": str(pokedata_id),
            }
            expression_values[value_token] = new_payloads[field_name]
            update_parts.append(f"{field_name} = {value_token}")

        table.update_item(
            Key={"pk": item["pk"], "sk": item["sk"]},
            UpdateExpression="SET " + ", ".join(update_parts),
            ExpressionAttributeValues=expression_values,
        )

        for field_name, payload in new_payloads.items():
            item[field_name] = payload

        for horizon in due_horizons:
            capture_counts[horizon] += 1

    return capture_counts


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
    api_key = os.environ.get("POKEDATA_API_KEY")
    now = datetime.now(tz=UTC)

    if lookup_table and not api_key:
        raise RuntimeError("POKEDATA_API_KEY is required when DYNAMODB_TABLE is configured")

    products = load_manifest()
    try:
        base_frame, summary, history_summary = load_cached_training_artifacts()
    except FileNotFoundError:
        base_frame, summary, history_summary = build_training_rows(products)

    lookup_items: list[dict[str, Any]] = []
    capture_counts = {horizon: 0 for horizon in TARGETS}
    if lookup_table:
        lookup_items = scan_lookup_items(lookup_table)
        capture_counts = capture_due_targets(lookup_table, lookup_items, now, api_key or "")

    lookup_rows = lookup_items_to_rows(lookup_items)
    merged_frame = merge_training_rows(base_frame, lookup_rows)
    merged_frame, audit_summary = audit_training_frame(merged_frame)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_training_data_artifacts(merged_frame, history_summary, OUTPUT_DIR)
    model_summary = train_models(merged_frame, OUTPUT_DIR)

    summary = build_dataset_summary(merged_frame, len(products))
    summary["generatedAt"] = now.isoformat()
    summary["lookupRows"] = len(lookup_rows)
    summary["capturedTargets"] = capture_counts
    summary["audit"] = audit_summary
    summary["models"] = model_summary
    summary["deploymentApproved"] = all(
        bool(model.get("deploymentApproved")) for model in model_summary.values()
    )
    summary["publishedToDynamo"] = False

    if lookup_table and summary["deploymentApproved"]:
        publish_model_artifacts(lookup_table, OUTPUT_DIR, summary, now)
        summary["publishedToDynamo"] = True

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
