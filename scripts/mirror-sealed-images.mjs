#!/usr/bin/env node
/**
 * Mirror sealed product images we currently load from third-party hosts
 * (notably pokemonproductimages.pokedata.io) into our own
 * public/sealed/ folder so the runtime never has to reach pokedata.io
 * for image rendering.
 *
 * Strategy:
 *   1. Read src/lib/data/sealed-sets.ts and extract every external imageUrl.
 *   2. Download each one to public/sealed/<slug>.webp (or original ext).
 *   3. Rewrite sealed-sets.ts so each imageUrl points to the local /sealed/<slug>.<ext> path.
 *
 * Run:  node scripts/mirror-sealed-images.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");
const SEALED_SETS_PATH = path.join(ROOT, "src", "lib", "data", "sealed-sets.ts");
const OUTPUT_DIR = path.join(ROOT, "public", "sealed");

const EXTERNAL_HOSTS = ["pokemonproductimages.pokedata.io", "pokedata.io"];

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  await pipeline(res.body, fs.createWriteStream(destPath));
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const source = fs.readFileSync(SEALED_SETS_PATH, "utf8");

  // Match every external imageUrl literal we want to mirror.
  const urlRegex = /imageUrl:\s*"(https:\/\/[^"]+)"/g;
  const matches = [];
  let m;
  while ((m = urlRegex.exec(source)) !== null) {
    const url = m[1];
    if (EXTERNAL_HOSTS.some((host) => url.includes(host))) {
      matches.push(url);
    }
  }
  const uniqueUrls = Array.from(new Set(matches));
  console.log(`Found ${uniqueUrls.length} external sealed image URLs to mirror.`);

  let updated = source;
  let downloaded = 0;
  let skipped = 0;

  for (const url of uniqueUrls) {
    const decoded = decodeURIComponent(url.split("/").pop() || "");
    const ext = path.extname(decoded) || ".webp";
    const base = path.basename(decoded, ext);
    const slug = slugify(base) || `image-${downloaded + skipped}`;
    const localFile = `${slug}${ext}`;
    const destPath = path.join(OUTPUT_DIR, localFile);
    const localUrl = `/sealed/${localFile}`;

    if (fs.existsSync(destPath)) {
      skipped += 1;
    } else {
      try {
        await downloadTo(url, destPath);
        downloaded += 1;
        console.log(`  ✓ ${url} → ${localUrl}`);
      } catch (err) {
        console.warn(`  ✗ ${url}: ${err.message}`);
        continue;
      }
    }

    // Replace every occurrence of the URL with the local path.
    updated = updated.split(`"${url}"`).join(`"${localUrl}"`);
  }

  if (updated !== source) {
    fs.writeFileSync(SEALED_SETS_PATH, updated);
    console.log(`Rewrote ${SEALED_SETS_PATH} to use local /sealed/ paths.`);
  }

  console.log(
    `Done. downloaded=${downloaded} skipped=${skipped} total=${uniqueUrls.length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
