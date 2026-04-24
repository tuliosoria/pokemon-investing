#!/usr/bin/env python3
"""Backfill missing priceChartingId values in sealed-catalog.json.

For every catalog entry without a priceChartingId, search the
PriceCharting CSV for a row whose `console-name` ("Pokemon <set>")
matches the catalog `name` and whose `product-name` matches the
catalog `productType`. When a single unambiguous match is found,
write it back to the catalog.

Run:
    python3 scripts/backfill_pricecharting_ids.py \
        --csv .copilot-files/pricecharting-pokemon-cards.csv

After this completes, re-run scripts/import_pricecharting_csv.py
to refresh pricecharting-current-prices.json with the new entries.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = ROOT / "src/lib/data/sealed-ml/sealed-catalog.json"

# Map catalog productType -> CSV product-name patterns (case-insensitive
# regex). First match wins; a second match makes the row ambiguous and
# we skip it for safety.
PRODUCT_TYPE_PATTERNS = {
    "Booster Box": [r"^booster\s*box$"],
    "ETB": [r"^elite\s*trainer\s*box$"],
    "Booster Bundle": [r"^booster\s*bundle$"],
    "Booster Pack": [r"^booster\s*pack$"],
    "UPC": [r"^ultra\s*premium\s*collection", r"^upc$"],
    "Tin": [r"^.*tin$"],
    "Collection Box": [r"^.*collection\s*box$", r"^.*collection$"],
    "Case": [r"^booster\s*box\s*case$", r"^.*case$"],
    "Special Collection": [r"^.*special\s*collection.*$"],
}

# Catalog name -> CSV console-name alias (after the "Pokemon " prefix is
# stripped). Add entries here when the catalog uses a marketing name
# that PriceCharting catalogs differently.
NAME_ALIASES = {
    "base set unlimited": "base set",
    "xy evolutions": "evolutions",
    "pokemon 151": "scarlet & violet 151",
    "pokémon 151": "scarlet & violet 151",
    "ex firered & leafgreen": "fire red & leaf green",
}

# Explicit (catalog setId -> PriceCharting CSV id) overrides for products
# whose names don't follow the console + product-type convention. Use
# this when the CSV labels the product-name with a set qualifier
# (e.g. "Base Set Booster Box" under console "Pokemon Scarlet & Violet").
EXPLICIT_ID_OVERRIDES = {
    "scarlet-violet-base": "4998474",  # SV Base Booster Box
}

# CSV consoles to skip entirely when matching English catalog entries.
NON_ENGLISH_CONSOLE_TOKENS = (
    "japanese", "korean", "chinese", "german", "french", "spanish",
    "italian", "portuguese",
)


def normalize_console(console: str) -> str:
    """'Pokemon Lost Origin' -> 'lost origin'. Strips optional trailing
    qualifiers like '[Pokemon Center]' so they don't pollute matching."""
    s = re.sub(r"^pokemon\s+", "", console.strip(), flags=re.IGNORECASE)
    s = re.sub(r"\s*\[.*?\]\s*", " ", s).strip()
    return s.lower()


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip()).lower()


def match_product_type(product_name: str, product_type: str) -> bool:
    patterns = PRODUCT_TYPE_PATTERNS.get(product_type, [])
    pn = product_name.strip().lower()
    return any(re.match(pat, pn, flags=re.IGNORECASE) for pat in patterns)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, required=True,
                        help="PriceCharting CSV download path")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print proposed changes without writing")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    catalog = json.loads(CATALOG_PATH.read_text())

    # Index CSV rows by (console_normalized, product_type_bucket) -> [rows]
    rows_by_console: dict[str, list[dict[str, str]]] = {}
    with args.csv.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            console = row.get("console-name", "")
            if not console.lower().startswith("pokemon"):
                continue
            # Skip non-English language consoles; they collide with the
            # main set names (e.g. "Pokemon Japanese Scarlet & Violet 151"
            # vs the English "Scarlet & Violet 151").
            console_lower = console.lower()
            if any(tok in console_lower for tok in NON_ENGLISH_CONSOLE_TOKENS):
                continue
            key = normalize_console(console)
            rows_by_console.setdefault(key, []).append(row)

    backfilled = 0
    ambiguous = 0
    not_found = 0
    proposals: list[tuple[str, str, str, str]] = []

    for entry in catalog:
        if entry.get("priceChartingId"):
            continue

        # Explicit override path: skip the auto-match logic entirely.
        override_id = EXPLICIT_ID_OVERRIDES.get(entry.get("setId", ""))
        if override_id:
            row = next(
                (
                    r
                    for rows in rows_by_console.values()
                    for r in rows
                    if (r.get("id") or "").strip() == override_id
                ),
                None,
            )
            if row:
                proposals.append(
                    (entry.get("setId", ""), entry.get("name", ""),
                     entry.get("productType", ""), override_id)
                )
                if not args.dry_run:
                    entry["priceChartingId"] = override_id
                    entry["priceChartingProductName"] = row.get("product-name")
                    entry["priceChartingConsoleName"] = row.get("console-name")
                    entry["mappingConfidence"] = entry.get("mappingConfidence") or "high"
                backfilled += 1
                continue

        name_key = normalize_name(entry.get("name", ""))
        name_key = NAME_ALIASES.get(name_key, name_key)
        product_type = entry.get("productType", "")
        if not name_key or not product_type:
            continue
        candidate_rows = rows_by_console.get(name_key, [])
        matches = [
            r for r in candidate_rows
            if match_product_type(r.get("product-name", ""), product_type)
            and (r.get("id") or "").strip()
        ]
        # Filter out variant rows (Pokemon Center, Heavy, etc.) — they have
        # bracketed qualifiers in product-name we don't want for the
        # vanilla product-type entry.
        matches = [
            r for r in matches
            if "[" not in (r.get("product-name") or "")
        ]
        if not matches:
            not_found += 1
            print(f"  ! no match: {entry.get('setId')} | {entry.get('name')} | {product_type}")
            continue
        if len(matches) > 1:
            ambiguous += 1
            ids = [r.get("id") for r in matches]
            print(f"  ? ambiguous ({len(matches)}): {entry.get('setId')} | {entry.get('name')} | {product_type} -> {ids}")
            continue
        row = matches[0]
        pc_id = (row.get("id") or "").strip()
        proposals.append((entry.get("setId", ""), entry.get("name", ""),
                          product_type, pc_id))
        if not args.dry_run:
            entry["priceChartingId"] = pc_id
            entry["priceChartingProductName"] = row.get("product-name")
            entry["priceChartingConsoleName"] = row.get("console-name")
            entry["mappingConfidence"] = entry.get("mappingConfidence") or "high"
        backfilled += 1

    print()
    print(f"Backfilled: {backfilled}")
    print(f"Ambiguous:  {ambiguous}")
    print(f"Not found:  {not_found}")

    if not args.dry_run and backfilled:
        CATALOG_PATH.write_text(json.dumps(catalog, indent=2) + "\n")
        print(f"Wrote {CATALOG_PATH.relative_to(ROOT)}")
    elif args.dry_run:
        print("(dry-run; not written)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
