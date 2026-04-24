#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "src" / "lib" / "data" / "sealed-ml"
CATALOG_PATH = DATA_DIR / "sealed-catalog.json"
OUTPUT_PATH = DATA_DIR / "pricecharting-current-prices.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import PriceCharting custom CSV export into the sealed current-prices artifact."
    )
    parser.add_argument(
        "--csv",
        type=Path,
        required=True,
        help="Path to the downloaded PriceCharting Pokemon Cards CSV export.",
    )
    return parser.parse_args()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_currency(value: str | None) -> float | None:
    if not value:
        return None
    cleaned = str(value).strip().replace("$", "").replace(",", "")
    if not cleaned:
        return None
    try:
        return round(float(cleaned), 2)
    except ValueError:
        return None


def parse_int(value: str | None) -> int | None:
    if not value:
        return None
    cleaned = str(value).strip().replace(",", "")
    if not cleaned:
        return None
    try:
        return int(cleaned)
    except ValueError:
        return None


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def main() -> int:
    args = parse_args()
    catalog = load_json(CATALOG_PATH)
    rows_by_id: dict[str, dict[str, str]] = {}

    with args.csv.open(newline="", encoding="utf-8") as handle:
      reader = csv.DictReader(handle)
      for row in reader:
          row_id = str(row.get("id") or "").strip()
          if row_id:
              rows_by_id[row_id] = row

    captured_at = now_iso()
    synced_entries: list[dict[str, Any]] = []

    for product in catalog:
        pricecharting_id = str(product.get("priceChartingId") or "").strip()
        if not pricecharting_id:
            continue

        row = rows_by_id.get(pricecharting_id)
        if not row:
            continue

        new_price = parse_currency(row.get("new-price"))
        manual_only_price = parse_currency(row.get("manual-only-price"))

        synced_entries.append(
            {
                "setId": product["setId"],
                "name": product["name"],
                "productType": product["productType"],
                "releaseDate": row.get("release-date") or product.get("releaseDate"),
                "pokedataId": product.get("pokedataId"),
                "priceChartingId": pricecharting_id,
                "productName": row.get("product-name") or product.get("name"),
                "consoleName": row.get("console-name") or product.get("priceChartingConsoleName"),
                "newPrice": new_price,
                "manualOnlyPrice": manual_only_price,
                "salesVolume": parse_int(row.get("sales-volume")),
                "catalogSource": product.get("catalogSource") or "curated-manifest",
                "mappingConfidence": product.get("mappingConfidence") or "unknown",
                "capturedAt": captured_at,
            }
        )

    synced_entries.sort(
        key=lambda item: (
            item.get("releaseDate") or "9999-99-99",
            str(item.get("name") or "").lower(),
            str(item.get("productType") or "").lower(),
        )
    )
    OUTPUT_PATH.write_text(json.dumps(synced_entries, indent=2) + "\n")
    print(
        json.dumps(
            {
                "csvRowsIndexed": len(rows_by_id),
                "catalogEntries": len(catalog),
                "syncedEntries": len(synced_entries),
                "outputPath": str(OUTPUT_PATH.relative_to(ROOT)),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
