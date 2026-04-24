#!/usr/bin/env node
/**
 * Pre-fetch the top chase cards for every Pokemon TCG set we know about.
 *
 * Output: src/lib/data/sealed-ml/top-chase-cards.json keyed by TCG API setId.
 *
 *   {
 *     "sv8pt5": {
 *       "setId": "sv8pt5",
 *       "setName": "Prismatic Evolutions",
 *       "fetchedAt": "...",
 *       "cards": [{ "name": "Umbreon ex", "marketPrice": 1471.16, "rarity": "..." }, ...]
 *     }
 *   }
 *
 * Source: https://api.pokemontcg.io/v2 (free, no auth required for low rate).
 *
 * Run with: node scripts/fetch-top-chase-cards.mjs
 *           node scripts/fetch-top-chase-cards.mjs --setId sv8pt5  (single set)
 *           node scripts/fetch-top-chase-cards.mjs --refresh       (ignore cached)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const EXPANSION_PATH = path.join(
  REPO_ROOT,
  "src/lib/data/sealed-ml/products-expansion.json"
);
const PRICECHARTING_PATH = path.join(
  REPO_ROOT,
  "src/lib/data/sealed-ml/pricecharting-current-prices.json"
);
const OUTPUT_PATH = path.join(
  REPO_ROOT,
  "src/lib/data/sealed-ml/top-chase-cards.json"
);

const TCG_API = "https://api.pokemontcg.io/v2";
const TOP_N = 4;
const PAGE_SIZE = 250;
const REQUEST_DELAY_MS = 250;

const args = process.argv.slice(2);
const onlySetId = (() => {
  const idx = args.indexOf("--setId");
  return idx >= 0 ? args[idx + 1] : null;
})();
const refreshAll = args.includes("--refresh");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bestVariantMarket(prices) {
  if (!prices || typeof prices !== "object") return 0;
  let best = 0;
  for (const variant of Object.values(prices)) {
    if (!variant || typeof variant !== "object") continue;
    const market = Number(variant.market) || Number(variant.mid) || 0;
    if (market > best) best = market;
  }
  return best;
}

async function fetchSetTopCards(setId, setName) {
  // Pull every card in the set (paginated) so we can compute both the
  // top chase list and the full set-singles total value. PokemonTCG.io
  // caps pageSize at 250; most Pokemon sets fit in 1-2 pages.
  const collected = [];
  let page = 1;
  while (true) {
    const url =
      `${TCG_API}/cards?q=set.id:${setId}` +
      `&pageSize=${PAGE_SIZE}&page=${page}` +
      `&select=id,name,number,rarity,tcgplayer`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      if (res.status === 404) {
        return {
          setId,
          setName,
          fetchedAt: new Date().toISOString(),
          cards: [],
          cardCount: 0,
          setTotalSinglesValue: 0,
          skipped: "not-found",
        };
      }
      throw new Error(`TCG API ${res.status} for ${setId}: ${await res.text()}`);
    }
    const body = await res.json();
    const data = Array.isArray(body?.data) ? body.data : [];
    collected.push(...data);
    if (data.length < PAGE_SIZE) break;
    page += 1;
    if (page > 8) break; // safety: no Pokemon set is >2000 cards
    await sleep(REQUEST_DELAY_MS);
  }

  const ranked = collected
    .map((card) => ({
      name: card?.name ?? "",
      number: card?.number ?? "",
      rarity: card?.rarity ?? null,
      marketPrice: bestVariantMarket(card?.tcgplayer?.prices),
    }))
    .filter((card) => card.name && card.marketPrice > 0)
    .sort((a, b) => b.marketPrice - a.marketPrice);

  const setTotalSinglesValue = ranked.reduce(
    (sum, c) => sum + c.marketPrice,
    0
  );
  const top10SinglesValue = ranked
    .slice(0, 10)
    .reduce((sum, c) => sum + c.marketPrice, 0);

  // Deduplicate by card name for the top chase list (keep highest variant)
  const seen = new Set();
  const uniqueTop = [];
  for (const card of ranked) {
    const key = card.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueTop.push(card);
    if (uniqueTop.length >= TOP_N) break;
  }

  return {
    setId,
    setName,
    fetchedAt: new Date().toISOString(),
    cards: uniqueTop,
    cardCount: ranked.length,
    setTotalSinglesValue: Math.round(setTotalSinglesValue * 100) / 100,
    top10SinglesValue: Math.round(top10SinglesValue * 100) / 100,
  };
}

async function loadExisting() {
  try {
    const raw = await fs.readFile(OUTPUT_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function loadSetUniverse() {
  const expansion = JSON.parse(await fs.readFile(EXPANSION_PATH, "utf8"));
  const pricecharting = JSON.parse(
    await fs.readFile(PRICECHARTING_PATH, "utf8")
  );
  const map = new Map();
  for (const entry of expansion) {
    if (!entry?.setId) continue;
    if (!map.has(entry.setId)) {
      map.set(entry.setId, { setId: entry.setId, setName: entry.name });
    }
  }
  for (const entry of pricecharting) {
    if (!entry?.setId) continue;
    // Strip product-type suffix: "gym1-booster-box" -> "gym1"
    const baseId = entry.setId.replace(
      /-(booster-box|booster-bundle|booster-pack|etb|elite-trainer-box|tin|upc|case|collection|special-collection)(-.+)?$/,
      ""
    );
    if (!map.has(baseId)) {
      map.set(baseId, {
        setId: baseId,
        setName: (entry.consoleName ?? "").replace(/^Pokemon\s+/i, "").trim(),
      });
    }
  }
  return Array.from(map.values());
}

async function main() {
  const universe = await loadSetUniverse();
  const existing = await loadExisting();
  const targets = onlySetId
    ? universe.filter((u) => u.setId === onlySetId)
    : universe;

  console.log(`Set universe: ${universe.length}; targeting ${targets.length}`);

  let done = 0;
  let failed = 0;
  let skipped = 0;

  for (const target of targets) {
    if (
      !refreshAll &&
      !onlySetId &&
      existing[target.setId] &&
      Array.isArray(existing[target.setId].cards) &&
      existing[target.setId].cards.length > 0 &&
      typeof existing[target.setId].setTotalSinglesValue === "number"
    ) {
      skipped += 1;
      continue;
    }
    try {
      const result = await fetchSetTopCards(target.setId, target.setName);
      existing[target.setId] = result;
      done += 1;
      if (done % 10 === 0) {
        console.log(`  ${done}/${targets.length} fetched`);
        await fs.writeFile(
          OUTPUT_PATH,
          JSON.stringify(existing, null, 2) + "\n"
        );
      }
    } catch (err) {
      failed += 1;
      console.warn(`  ! ${target.setId} (${target.setName}): ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(existing, null, 2) + "\n");
  console.log(
    `Done. fetched=${done} skipped=${skipped} failed=${failed} total-keys=${Object.keys(existing).length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
