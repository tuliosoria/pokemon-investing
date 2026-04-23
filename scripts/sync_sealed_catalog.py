#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "src" / "lib" / "data" / "sealed-ml"
MANIFEST_PATH = DATA_DIR / "products.json"
OVERRIDES_PATH = DATA_DIR / "sealed-catalog-overrides.json"
APPROVED_OUTPUT_PATH = DATA_DIR / "sealed-catalog.json"
REVIEW_OUTPUT_PATH = DATA_DIR / "sealed-catalog-review.json"

PRICECHARTING_BASE_URL = "https://www.pricecharting.com/api/product"
POKEDATA_CATALOG_URL = "https://www.pokedata.io/api/products"
MIN_PRICECHARTING_REQUEST_INTERVAL_SECONDS = 1.1

TYPE_ALIASES = {
    "ETB": "elite trainer box",
    "UPC": "ultra premium collection",
}

POKEDATA_TYPE_MAP = {
    "BOOSTERBOX": "Booster Box",
    "ELITETRAINERBOX": "ETB",
    "BOOSTERBUNDLE": "Booster Bundle",
    "BOOSTERPACK": "Booster Pack",
    "BLISTERPACK": "Booster Pack",
    "TIN": "Tin",
    "COLLECTIONBOX": "Collection Box",
    "SPECIALBOX": "Special Collection",
    "SPECIALSET": "Special Collection",
    "SPECIALPACK": "Special Collection",
    "PREMIUMTRAINERBOX": "UPC",
    "ULTRAPREMIUMCOLLECTION": "UPC",
    "CASE": "Case",
}

TYPE_SUFFIX_MAP = {
    "Booster Box": "booster-box",
    "ETB": "etb",
    "Booster Bundle": "booster-bundle",
    "UPC": "upc",
    "Special Collection": "special-collection",
    "Case": "case",
    "Booster Pack": "booster-pack",
    "Tin": "tin",
    "Collection Box": "collection-box",
    "Unknown": "unknown",
}

VARIANT_PENALTY_WORDS = (
    "costco",
    "walmart",
    "target",
    "pokemon center",
    "display",
    "case",
    "2-pack",
    "3-pack",
    "blister",
)

last_pricecharting_request_started_at = 0.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build an approved sealed catalog plus a review artifact from curated "
            "manifest entries and provider discovery candidates."
        )
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Skip live provider discovery and only emit the curated baseline catalog.",
    )
    parser.add_argument(
        "--pokedata-catalog",
        type=Path,
        help="Optional local PokeData catalog JSON fixture for dry runs or tests.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional max number of provider candidates to process after filtering.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the summary without writing approved/review artifacts.",
    )
    return parser.parse_args()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text())


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n")


def normalize_text(value: str | None) -> str:
    cleaned = unicodedata.normalize("NFD", value or "")
    cleaned = "".join(ch for ch in cleaned if not unicodedata.combining(ch))
    cleaned = cleaned.replace("&", " and ")
    cleaned = re.sub(r"[’'`]", "", cleaned)
    cleaned = re.sub(r"[^a-zA-Z0-9]+", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip().lower()


def slugify(value: str) -> str:
    return normalize_text(value).replace(" ", "-")


def build_catalog_key(name: str, product_type: str) -> str:
    return f"{normalize_text(name)}|{normalize_text(product_type)}"


def release_year(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(str(value)[:4])
    except ValueError:
        return None


def parse_pricecharting_price(value: Any) -> float | None:
    if value in (None, "", 0, "0"):
        return None
    try:
        pennies = float(value)
    except (TypeError, ValueError):
        return None
    if pennies <= 0:
        return None
    return round(pennies) / 100


def infer_product_type_from_name(name: str | None) -> str | None:
    normalized = normalize_text(name)
    if not normalized:
        return None
    if "elite trainer box" in normalized or normalized.endswith(" etb"):
        return "ETB"
    if "booster box" in normalized:
        return "Booster Box"
    if "booster bundle" in normalized:
        return "Booster Bundle"
    if "ultra premium collection" in normalized or re.search(r"\bupc\b", normalized):
        return "UPC"
    if "collection box" in normalized:
        return "Collection Box"
    if "special collection" in normalized:
        return "Special Collection"
    if re.search(r"\btin\b", normalized):
        return "Tin"
    if "booster pack" in normalized or "blister" in normalized:
        return "Booster Pack"
    if re.search(r"\bcase\b", normalized):
        return "Case"
    return None


def build_search_query(name: str, product_type: str, override_query: str | None = None) -> str:
    if override_query:
        return override_query.strip()
    normalized_type = TYPE_ALIASES.get(product_type, product_type)
    return f"{name} {normalized_type} pokemon".strip()


def build_generated_set_id(name: str, product_type: str) -> str:
    name_slug = slugify(name)
    type_suffix = TYPE_SUFFIX_MAP.get(product_type, slugify(product_type))
    if not name_slug:
        return type_suffix
    if name_slug.endswith(type_suffix):
        return name_slug
    return f"{name_slug}-{type_suffix}"


def fetch_json(url: str, *, headers: dict[str, str] | None = None) -> Any:
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as error:
        message = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"{url} returned HTTP {error.code}: {message}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"{url} failed: {error.reason}") from error


def throttle_pricecharting() -> None:
    global last_pricecharting_request_started_at
    elapsed = time.monotonic() - last_pricecharting_request_started_at
    if elapsed < MIN_PRICECHARTING_REQUEST_INTERVAL_SECONDS:
        time.sleep(MIN_PRICECHARTING_REQUEST_INTERVAL_SECONDS - elapsed)
    last_pricecharting_request_started_at = time.monotonic()


def request_pricecharting_product(*, token: str, query: str | None = None, product_id: str | None = None) -> dict[str, Any] | None:
    if not token:
        raise RuntimeError("PRICECHARTING_API_TOKEN is required for live catalog sync")
    if not query and not product_id:
        return None

    params = {"t": token}
    if product_id:
        params["id"] = product_id
    if query:
        params["q"] = query

    throttle_pricecharting()
    url = f"{PRICECHARTING_BASE_URL}?{urllib.parse.urlencode(params)}"
    payload = fetch_json(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "PokeAlpha/1.0 sealed catalog sync",
        },
    )
    if payload.get("status") == "error":
        raise RuntimeError(payload.get("error-message") or "PriceCharting request failed")
    return payload


def build_curated_entry(item: dict[str, Any]) -> dict[str, Any]:
    product_type = item["productType"]
    query = build_search_query(item["name"], product_type)
    return {
        "setId": item["setId"],
        "name": item["name"],
        "productType": product_type,
        "releaseDate": item["releaseDate"],
        "priceChartingQuery": query,
        "priceChartingId": item.get("priceChartingId"),
        "pokedataId": item.get("pokedataId"),
        "catalogStatus": "approved",
        "catalogSource": "curated-manifest",
        "mappingConfidence": "curated",
        "mappingScore": 999,
        "notes": "Seeded from curated ML manifest.",
    }


def dedupe_pokedata_products(raw_products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for item in raw_products:
        product_type = POKEDATA_TYPE_MAP.get(str(item.get("type") or "").upper())
        language = str(item.get("language") or "").upper()
        name = str(item.get("name") or "").strip()
        if not product_type or not name or (language and language != "ENGLISH"):
            continue
        key = build_catalog_key(name, product_type)
        current = deduped.get(key)
        candidate = {
            "pokedataId": str(item.get("id") or "").strip(),
            "name": name,
            "productType": product_type,
            "releaseDate": item.get("release_date") or None,
            "rawType": str(item.get("type") or "").upper(),
            "imgUrl": item.get("img_url") or None,
            "tcgplayerId": item.get("tcgplayer_id") or None,
        }
        if not current:
            deduped[key] = candidate
            continue
        current_year = release_year(current.get("releaseDate"))
        candidate_year = release_year(candidate.get("releaseDate"))
        if candidate_year and (not current_year or candidate_year > current_year):
            deduped[key] = candidate
    return sorted(
        deduped.values(),
        key=lambda item: (
            item.get("releaseDate") or "9999-99-99",
            normalize_text(item["name"]),
            normalize_text(item["productType"]),
        ),
    )


def load_pokedata_candidates(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.pokedata_catalog:
        return dedupe_pokedata_products(load_json(args.pokedata_catalog, []))
    if args.offline:
        return []

    api_key = (os.environ.get("POKEDATA_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("POKEDATA_API_KEY is required unless --offline is used")

    payload = fetch_json(
        POKEDATA_CATALOG_URL,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "PokeAlpha/1.0 sealed catalog sync",
        },
    )
    if not isinstance(payload, list):
        raise RuntimeError("Unexpected PokeData catalog payload")
    return dedupe_pokedata_products(payload)


def build_override_indexes(payload: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_id: dict[str, dict[str, Any]] = {}
    by_key: dict[str, dict[str, Any]] = {}
    for item in payload.get("entries", []):
        if not isinstance(item, dict):
            continue
        override = {
            "decision": str(item.get("decision") or "").strip().lower(),
            "pokedataId": str(item.get("pokedataId") or "").strip() or None,
            "key": str(item.get("key") or "").strip() or None,
            "setId": str(item.get("setId") or "").strip() or None,
            "priceChartingId": str(item.get("priceChartingId") or "").strip() or None,
            "priceChartingQuery": str(item.get("priceChartingQuery") or "").strip() or None,
            "name": str(item.get("name") or "").strip() or None,
            "productType": str(item.get("productType") or "").strip() or None,
            "releaseDate": str(item.get("releaseDate") or "").strip() or None,
            "notes": str(item.get("notes") or "").strip() or None,
        }
        if override["pokedataId"]:
            by_id[override["pokedataId"]] = override
        if override["key"]:
            by_key[override["key"]] = override
        elif override["name"] and override["productType"]:
            by_key[build_catalog_key(override["name"], override["productType"])] = override
    return by_id, by_key


def score_pricecharting_match(candidate: dict[str, Any], pricecharting: dict[str, Any] | None) -> tuple[int, list[str]]:
    if not pricecharting or not pricecharting.get("id"):
        return -999, ["missing-pricecharting-result"]

    reasons: list[str] = []
    score = 0
    candidate_name = normalize_text(candidate["name"])
    result_name = normalize_text(
        str(pricecharting.get("product-name") or pricecharting.get("name") or "")
    )

    if candidate_name == result_name:
        score += 400
        reasons.append("exact-name-match")
    elif candidate_name in result_name or result_name in candidate_name:
        score += 220
        reasons.append("partial-name-match")
    else:
        score -= 160
        reasons.append("name-mismatch")

    candidate_type = candidate["productType"]
    inferred_type = infer_product_type_from_name(
        str(pricecharting.get("product-name") or pricecharting.get("name") or "")
    )
    if inferred_type == candidate_type:
        score += 120
        reasons.append("product-type-match")
    elif inferred_type:
        score -= 120
        reasons.append(f"product-type-mismatch:{inferred_type}")
    else:
        reasons.append("product-type-unknown")

    candidate_year = release_year(candidate.get("releaseDate"))
    result_year = release_year(pricecharting.get("release-date"))
    if candidate_year and result_year:
        delta = abs(candidate_year - result_year)
        if delta == 0:
            score += 60
            reasons.append("release-year-match")
        elif delta == 1:
            score += 25
            reasons.append("release-year-near")
        else:
            score -= 60
            reasons.append(f"release-year-mismatch:{candidate_year}:{result_year}")
    else:
        reasons.append("release-year-unknown")

    candidate_variants = {
        word
        for word in VARIANT_PENALTY_WORDS
        if word in normalize_text(candidate["name"])
    }
    result_variants = {
        word
        for word in VARIANT_PENALTY_WORDS
        if word in normalize_text(str(pricecharting.get("product-name") or ""))
    }
    if result_variants - candidate_variants:
        score -= 180
        reasons.append("variant-penalty")

    if parse_pricecharting_price(pricecharting.get("new-price")) is not None:
        score += 20
        reasons.append("has-price")

    return score, reasons


def classify_mapping_confidence(score: int, reasons: list[str], override_decision: str | None) -> str:
    if override_decision == "approved":
        return "manual"
    if "exact-name-match" in reasons and "product-type-match" in reasons and "variant-penalty" not in reasons and score >= 520:
        return "high"
    if "partial-name-match" in reasons and "product-type-match" in reasons and "variant-penalty" not in reasons and score >= 320:
        return "medium"
    return "low"


def build_candidate_review_entry(
    *,
    candidate: dict[str, Any],
    override: dict[str, Any] | None,
    pricecharting: dict[str, Any] | None,
    score: int,
    reasons: list[str],
) -> dict[str, Any]:
    override_decision = override.get("decision") if override else None
    confidence = classify_mapping_confidence(score, reasons, override_decision)
    decision = "review_required"

    if override_decision == "rejected":
        decision = "rejected"
    elif override_decision == "approved":
        decision = "approved"
    elif confidence == "high":
        decision = "approved"
    elif score < 220:
        decision = "rejected"

    effective_name = override.get("name") if override and override.get("name") else candidate["name"]
    effective_type = (
        override.get("productType") if override and override.get("productType") else candidate["productType"]
    )
    effective_release_date = (
        override.get("releaseDate") if override and override.get("releaseDate") else candidate.get("releaseDate")
    )
    query = build_search_query(
        effective_name,
        effective_type,
        override.get("priceChartingQuery") if override else None,
    )

    return {
        "decision": decision,
        "setId": (
            override.get("setId")
            if override and override.get("setId")
            else build_generated_set_id(effective_name, effective_type)
        ),
        "name": effective_name,
        "productType": effective_type,
        "releaseDate": effective_release_date,
        "normalizedKey": build_catalog_key(effective_name, effective_type),
        "catalogSource": "pokedata",
        "priceChartingQuery": query,
        "mappingConfidence": confidence,
        "mappingScore": score,
        "matchReasons": reasons,
        "notes": override.get("notes") if override else None,
        "providers": {
            "pokedata": {
                "pokedataId": candidate.get("pokedataId"),
                "rawType": candidate.get("rawType"),
                "imgUrl": candidate.get("imgUrl"),
                "tcgplayerId": candidate.get("tcgplayerId"),
            },
            "priceCharting": (
                {
                    "priceChartingId": str(pricecharting.get("id")),
                    "productName": pricecharting.get("product-name"),
                    "consoleName": pricecharting.get("console-name"),
                    "releaseDate": pricecharting.get("release-date"),
                    "newPrice": parse_pricecharting_price(pricecharting.get("new-price")),
                    "salesVolume": pricecharting.get("sales-volume"),
                }
                if pricecharting and pricecharting.get("id")
                else None
            ),
        },
    }


def build_approved_catalog_entry(review_entry: dict[str, Any]) -> dict[str, Any]:
    pricecharting = review_entry["providers"]["priceCharting"] or {}
    pokedata = review_entry["providers"]["pokedata"] or {}
    return {
        "setId": review_entry["setId"],
        "name": review_entry["name"],
        "productType": review_entry["productType"],
        "releaseDate": review_entry["releaseDate"],
        "priceChartingQuery": review_entry["priceChartingQuery"],
        "priceChartingId": pricecharting.get("priceChartingId"),
        "priceChartingProductName": pricecharting.get("productName"),
        "priceChartingConsoleName": pricecharting.get("consoleName"),
        "pokedataId": pokedata.get("pokedataId"),
        "catalogStatus": "approved",
        "catalogSource": review_entry["catalogSource"],
        "mappingConfidence": review_entry["mappingConfidence"],
        "mappingScore": review_entry["mappingScore"],
        "notes": review_entry.get("notes"),
    }


def sort_catalog_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        entries,
        key=lambda item: (
            item.get("releaseDate") or "9999-99-99",
            normalize_text(item["name"]),
            normalize_text(item["productType"]),
        ),
    )


def run() -> int:
    args = parse_args()
    manifest = load_json(MANIFEST_PATH, [])
    overrides_payload = load_json(OVERRIDES_PATH, {"entries": []})
    override_by_id, override_by_key = build_override_indexes(overrides_payload)

    approved_entries = [build_curated_entry(item) for item in manifest]
    approved_keys = {build_catalog_key(item["name"], item["productType"]) for item in approved_entries}

    provider_candidates = load_pokedata_candidates(args)
    if args.limit > 0:
        provider_candidates = provider_candidates[: args.limit]

    review_required_entries: list[dict[str, Any]] = []
    auto_approved_entries: list[dict[str, Any]] = []
    rejected_entries: list[dict[str, Any]] = []

    token = (os.environ.get("PRICECHARTING_API_TOKEN") or "").strip()
    live_provider_mode = not args.offline and bool(token) and bool(provider_candidates)

    for candidate in provider_candidates:
        candidate_key = build_catalog_key(candidate["name"], candidate["productType"])
        if candidate_key in approved_keys:
            continue

        override = override_by_id.get(candidate.get("pokedataId") or "") or override_by_key.get(candidate_key)
        override_decision = override.get("decision") if override else None
        query = build_search_query(
            override.get("name") if override and override.get("name") else candidate["name"],
            override.get("productType") if override and override.get("productType") else candidate["productType"],
            override.get("priceChartingQuery") if override else None,
        )

        pricecharting_result = None
        if args.offline or not token:
            pricecharting_result = None
        elif override and override.get("priceChartingId"):
            pricecharting_result = request_pricecharting_product(
                token=token,
                product_id=override["priceChartingId"],
            )
        else:
            pricecharting_result = request_pricecharting_product(token=token, query=query)

        score, reasons = score_pricecharting_match(candidate, pricecharting_result)
        review_entry = build_candidate_review_entry(
            candidate=candidate,
            override=override,
            pricecharting=pricecharting_result,
            score=score,
            reasons=reasons,
        )

        if review_entry["decision"] == "approved":
            approved_entry = build_approved_catalog_entry(review_entry)
            if build_catalog_key(approved_entry["name"], approved_entry["productType"]) not in approved_keys:
                approved_entries.append(approved_entry)
                approved_keys.add(build_catalog_key(approved_entry["name"], approved_entry["productType"]))
                auto_approved_entries.append(review_entry)
        elif review_entry["decision"] == "review_required":
            review_required_entries.append(review_entry)
        else:
            rejected_entries.append(review_entry)

    approved_entries = sort_catalog_entries(approved_entries)
    review_required_entries = sort_catalog_entries(review_required_entries)
    auto_approved_entries = sort_catalog_entries(auto_approved_entries)
    rejected_entries = sort_catalog_entries(rejected_entries)

    review_payload = {
        "generatedAt": now_iso(),
        "mode": "provider-sync" if live_provider_mode else ("fixture" if args.pokedata_catalog else "offline"),
        "approvedCatalogPath": str(APPROVED_OUTPUT_PATH.relative_to(ROOT)),
        "summary": {
            "curatedApproved": len(manifest),
            "autoApproved": len(auto_approved_entries),
            "reviewRequired": len(review_required_entries),
            "rejected": len(rejected_entries),
            "pokedataCandidatesProcessed": len(provider_candidates),
            "approvedCatalogSize": len(approved_entries),
        },
        "autoApproved": auto_approved_entries,
        "reviewRequired": review_required_entries,
        "rejected": rejected_entries,
    }

    if not args.dry_run:
        write_json(APPROVED_OUTPUT_PATH, approved_entries)
        write_json(REVIEW_OUTPUT_PATH, review_payload)

    print(json.dumps(review_payload["summary"], indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(run())
    except Exception as error:  # noqa: BLE001
        print(f"sync_sealed_catalog.py failed: {error}", file=sys.stderr)
        raise SystemExit(1)
