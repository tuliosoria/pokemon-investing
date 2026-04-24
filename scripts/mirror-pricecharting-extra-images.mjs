#!/usr/bin/env node
/**
 * Supplemental scraper for sealed products that are NOT in
 * pricecharting-current-prices.json (typically curated entries like
 * "Neo Genesis Booster Box" sourced from PokeData/manifest).
 *
 * Reads scripts/data/pricecharting-extra-sets.json which lists
 * { setId, consoleSlug, productSlug } triples, fetches each product
 * page on PriceCharting, extracts the product image, and merges into
 * src/lib/data/sealed-ml/pricecharting-product-images-by-setid.json.
 *
 * Image binaries are written under public/sealed/pricecharting/<slug>.jpg
 * where <slug> is the setId (so we don't need a numeric PC id).
 *
 * Run:  node scripts/mirror-pricecharting-extra-images.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const EXTRAS = path.join(ROOT, "scripts", "data", "pricecharting-extra-sets.json");
const MAPPING_PATH = path.join(
  ROOT,
  "src",
  "lib",
  "data",
  "sealed-ml",
  "pricecharting-product-images-by-setid.json"
);
const OUTPUT_DIR = path.join(ROOT, "public", "sealed", "pricecharting");
const PUBLIC_PREFIX = "/sealed/pricecharting";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function downloadTo(url, destPath) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(res.body, fs.createWriteStream(destPath));
}

function extractImageKey(html) {
  const m = html.match(
    /storage\.googleapis\.com\/images\.pricecharting\.com\/([a-z0-9]+)\/1600\.(jpg|jpeg|png|webp)/i
  );
  return m ? { key: m[1], ext: m[2].toLowerCase() } : null;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const extras = JSON.parse(fs.readFileSync(EXTRAS, "utf8"));
  const mapping = fs.existsSync(MAPPING_PATH)
    ? JSON.parse(fs.readFileSync(MAPPING_PATH, "utf8"))
    : {};

  let downloaded = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of extras) {
    if (mapping[item.setId]) {
      skipped++;
      continue;
    }
    const pageUrl = `https://www.pricecharting.com/game/${item.consoleSlug}/${item.productSlug}`;
    try {
      const html = await fetchText(pageUrl);
      const img = extractImageKey(html);
      if (!img) {
        console.warn(`  no image: ${pageUrl}`);
        failed++;
        continue;
      }
      const destFile = path.join(OUTPUT_DIR, `${item.setId}.jpg`);
      const publicPath = `${PUBLIC_PREFIX}/${item.setId}.jpg`;
      await downloadTo(
        `https://storage.googleapis.com/images.pricecharting.com/${img.key}/1600.${img.ext}`,
        destFile
      );
      mapping[item.setId] = publicPath;
      downloaded++;
      console.log(`  ok ${item.setId} -> ${publicPath}`);
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      console.warn(`  fail ${item.setId} (${pageUrl}): ${err.message}`);
      failed++;
    }
  }

  fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2) + "\n");
  console.log(
    `Done. downloaded=${downloaded} skipped=${skipped} failed=${failed}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
