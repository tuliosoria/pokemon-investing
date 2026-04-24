import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const EXISTING_CATALOG_PATH = path.join(
  ROOT,
  "src",
  "lib",
  "data",
  "sealed-ml",
  "sealed-search-catalog.json"
);
const OUTPUT_PATH = path.join(
  ROOT,
  "src",
  "lib",
  "data",
  "sealed-ml",
  "products-expansion.json"
);
const POKEMON_TCG_SETS_URL = "https://api.pokemontcg.io/v2/sets?pageSize=250";

const GLOBAL_EXCLUDE_PATTERNS = [
  /\bpromo(s)?\b/i,
  /black star/i,
  /trainer kit/i,
  /world collection/i,
  /mcdonald/i,
  /best of game/i,
  /sample/i,
  /futsal/i,
  /classic collection/i,
  /gallery/i,
  /trading card game classic/i,
  /jumbo/i,
  /demo pack/i,
];

const BOOSTER_BOX_EXACT_EXCLUDES = new Set([
  "call of legends",
  "dragon vault",
  "double crisis",
  "generations",
  "detective pikachu",
  "hidden fates",
  "champion's path",
  "shining fates",
  "celebrations",
  "pokemon go",
  "pokémon go",
  "crown zenith",
  "151",
  "pokemon 151",
  "pokémon 151",
  "paldean fates",
  "shrouded fable",
  "prismatic evolutions",
]);

const ETB_EXACT_EXCLUDES = new Set([
  "detective pikachu",
  "call of legends",
]);

const NAME_OVERRIDES = new Map([
  ["base", "Base Set Unlimited"],
  ["scarlet and violet", "Scarlet & Violet Base"],
  ["151", "Pokémon 151"],
  ["pokemon 151", "Pokémon 151"],
  ["pokemon go", "Pokémon GO"],
]);

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-") || "sealed-product";
}

function toIsoDate(value) {
  const normalized = String(value || "").trim().replace(/\//g, "-");
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function releaseYear(value) {
  const year = Number.parseInt(String(value || "").slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function loadExistingCatalogEntries(rawCatalog) {
  return new Set(
    rawCatalog.flatMap((entry) => {
      const normalizedName = normalize(entry.name);
      const normalizedDisplayName = normalize(entry.displayName);
      const releaseDate = toIsoDate(entry.releaseDate);
      const productType = String(entry.productType || "").trim();
      const keys = [];

      if (normalizedName && productType) {
        keys.push(`name:${normalizedName}|${productType}`);
      }
      if (normalizedDisplayName && productType) {
        keys.push(`name:${normalizedDisplayName}|${productType}`);
      }
      if (releaseDate && productType) {
        keys.push(`date:${releaseDate}|${productType}`);
      }

      return keys;
    })
  );
}

function shouldExcludeSet(name) {
  return GLOBAL_EXCLUDE_PATTERNS.some((pattern) => pattern.test(name));
}

function hasEnoughCards(set) {
  const printedTotal = Number.parseInt(String(set.printedTotal || set.total || 0), 10);
  return Number.isFinite(printedTotal) && printedTotal >= 50;
}

function canonicalSetName(name) {
  return NAME_OVERRIDES.get(normalize(name)) || String(name || "").trim();
}

function shouldIncludeBoosterBox(set) {
  const name = canonicalSetName(set.name);
  const normalizedName = normalize(name);
  if (!name || shouldExcludeSet(name) || BOOSTER_BOX_EXACT_EXCLUDES.has(normalizedName)) {
    return false;
  }
  if (!hasEnoughCards(set)) {
    return false;
  }

  return true;
}

function shouldIncludeEtb(set) {
  const name = canonicalSetName(set.name);
  const normalizedName = normalize(name);
  const year = releaseYear(toIsoDate(set.releaseDate));

  if (!name || shouldExcludeSet(name) || ETB_EXACT_EXCLUDES.has(normalizedName)) {
    return false;
  }
  if (!year || year < 2014) {
    return false;
  }
  if (!hasEnoughCards(set)) {
    return false;
  }

  return true;
}

function buildEntry(set, productType) {
  const releaseDate = toIsoDate(set.releaseDate);
  const name = canonicalSetName(set.name);
  const normalizedType =
    productType === "ETB" ? "etb" : slugify(productType);

  return {
    catalogId: `${slugify(set.id)}-${normalizedType}`,
    setId: String(set.id || "").trim() || null,
    name,
    productType,
    releaseDate,
    catalogSource: "pokemon-tcg-api-set-universe",
    mappingConfidence: "candidate",
    notes:
      "Owned expansion candidate from the public Pokemon TCG set universe. Confirm with PriceCharting sync when a token is configured.",
  };
}

async function fetchSets() {
  const response = await fetch(POKEMON_TCG_SETS_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PokeAlpha/1.0 sealed expansion catalog",
    },
  });
  if (!response.ok) {
    throw new Error(`Pokemon TCG set fetch failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload.data)) {
    throw new Error("Unexpected Pokemon TCG sets payload");
  }

  return payload.data;
}

async function main() {
  const [existingCatalogRaw, sets] = await Promise.all([
    readFile(EXISTING_CATALOG_PATH, "utf8").then((contents) => JSON.parse(contents)),
    fetchSets(),
  ]);

  const existingCatalogKeys = loadExistingCatalogEntries(existingCatalogRaw);
  const expansionEntries = [];

  for (const set of sets) {
    const releaseDate = toIsoDate(set.releaseDate);
    if (!releaseDate) {
      continue;
    }

    for (const productType of ["Booster Box", "ETB"]) {
      const include =
        productType === "Booster Box"
          ? shouldIncludeBoosterBox(set)
          : shouldIncludeEtb(set);

      if (!include) {
        continue;
      }

      const entry = buildEntry(set, productType);
      const normalizedName = normalize(entry.name);
      const exactNameKey = `name:${normalizedName}|${productType}`;
      const dateKey = `date:${releaseDate}|${productType}`;

      if (existingCatalogKeys.has(exactNameKey) || existingCatalogKeys.has(dateKey)) {
        continue;
      }

      expansionEntries.push(entry);
    }
  }

  expansionEntries.sort((left, right) => {
    const dateCompare = String(left.releaseDate).localeCompare(String(right.releaseDate));
    if (dateCompare !== 0) {
      return dateCompare;
    }
    const nameCompare = left.name.localeCompare(right.name);
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return left.productType.localeCompare(right.productType);
  });

  await writeFile(OUTPUT_PATH, `${JSON.stringify(expansionEntries, null, 2)}\n`);
  console.log(`Wrote ${expansionEntries.length} expansion candidates to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
