#!/usr/bin/env node
/**
 * Mirror PriceCharting product images locally so the sealed dashboard
 * shows actual product photos (ETB, Booster Box, etc.) instead of the
 * generic Pokemon TCG API set logo.
 *
 * Source:
 *   - src/lib/data/sealed-ml/pricecharting-current-prices.json
 *
 * For each entry with a priceChartingId we:
 *   1. Build the product page URL from consoleName + productName slugs.
 *   2. Fetch the HTML and extract
 *      `storage.googleapis.com/images.pricecharting.com/<key>/1600.jpg`.
 *   3. Download the image to
 *      public/sealed/pricecharting/<priceChartingId>.jpg.
 *   4. Append to a mapping file
 *      src/lib/data/sealed-ml/pricecharting-product-images.json:
 *      { "<priceChartingId>": "/sealed/pricecharting/<id>.jpg" }
 *
 * Run:
 *   node scripts/mirror-pricecharting-product-images.mjs
 *   node scripts/mirror-pricecharting-product-images.mjs --refresh   # re-download
 *   node scripts/mirror-pricecharting-product-images.mjs --id <pcId> # one item
 */

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const SOURCE = path.join(
  ROOT,
  "src",
  "lib",
  "data",
  "sealed-ml",
  "pricecharting-current-prices.json"
);
const MAPPING_PATH = path.join(
  ROOT,
  "src",
  "lib",
  "data",
  "sealed-ml",
  "pricecharting-product-images.json"
);
const OUTPUT_DIR = path.join(ROOT, "public", "sealed", "pricecharting");
const PUBLIC_PREFIX = "/sealed/pricecharting";

const args = new Set(process.argv.slice(2));
const REFRESH = args.has("--refresh");
const onlyIdIdx = process.argv.indexOf("--id");
const ONLY_ID = onlyIdIdx > -1 ? process.argv[onlyIdIdx + 1] : null;

function slugify(input) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

async function downloadTo(url, destPath) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15" },
  });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  await pipeline(res.body, fs.createWriteStream(destPath));
}

function extractImageKey(html) {
  const m = html.match(
    /storage\.googleapis\.com\/images\.pricecharting\.com\/([a-z0-9]+)\/1600\.(jpg|jpeg|png|webp)/i
  );
  if (!m) return null;
  return { key: m[1], ext: m[2].toLowerCase() };
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const entries = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  const mapping = fs.existsSync(MAPPING_PATH)
    ? JSON.parse(fs.readFileSync(MAPPING_PATH, "utf8"))
    : {};

  let processed = 0;
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of entries) {
    if (!entry?.priceChartingId) continue;
    if (ONLY_ID && entry.priceChartingId !== ONLY_ID) continue;
    processed++;

    const pcId = entry.priceChartingId;
    const destExt = "jpg";
    const destFile = path.join(OUTPUT_DIR, `${pcId}.${destExt}`);
    const publicPath = `${PUBLIC_PREFIX}/${pcId}.${destExt}`;

    if (!REFRESH && mapping[pcId] && fs.existsSync(destFile)) {
      skipped++;
      continue;
    }

    const consoleSlug = slugify(entry.consoleName);
    const productSlug = slugify(entry.productName ?? entry.productType);
    if (!consoleSlug || !productSlug) {
      console.warn(`  skip ${pcId}: missing console/product slug`);
      failed++;
      continue;
    }
    const pageUrl = `https://www.pricecharting.com/game/${consoleSlug}/${productSlug}`;

    try {
      const html = await fetchText(pageUrl);
      const img = extractImageKey(html);
      if (!img) {
        console.warn(`  no image found on ${pageUrl}`);
        failed++;
        continue;
      }
      const imgUrl = `https://storage.googleapis.com/images.pricecharting.com/${img.key}/1600.${img.ext}`;
      await downloadTo(imgUrl, destFile);
      mapping[pcId] = publicPath;
      downloaded++;
      if (downloaded % 10 === 0) {
        fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2) + "\n");
        console.log(`  checkpoint: ${downloaded} downloaded`);
      }
      // Rate limit
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      console.warn(`  fail ${pcId} (${pageUrl}): ${err.message}`);
      failed++;
    }
  }

  fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2) + "\n");
  console.log(
    `Done. processed=${processed} downloaded=${downloaded} skipped=${skipped} failed=${failed}`
  );
  console.log(`Mapping: ${MAPPING_PATH}`);
  console.log(`Images:  ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
