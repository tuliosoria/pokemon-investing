/**
 * validate_against_tcgplayer.mjs
 *
 * Cross-validates our PriceCharting sealed-catalog prices against TCGPlayer.
 *
 * Execution flow:
 *  1. Scan sealed-catalog.json for any TCGPlayer identifiers
 *     (tcgPlayerProductId / tcgPlayerUrl / tcgPlayerSlug).
 *  2. For each entry with a TCGPlayer identifier, fetch the product page and
 *     parse the price from __NEXT_DATA__ or JSON-LD; compare against our PC price.
 *  3. If TCGPlayer blocks (403 / Cloudflare wall), document gracefully and fall
 *     back to a PC-internal consistency analysis:
 *     - Compare newPrice vs loosePrice divergence (flag > 20 % spread).
 *     - Surface entries where manualOnlyPrice diverges dramatically from the
 *       market price (those are the highest-risk rows).
 *  4. Write a report JSON to scripts/tcg-validation-report.json.
 *  5. Print a concise summary to stdout.
 *
 * Usage:
 *   node scripts/validate_against_tcgplayer.mjs
 *
 * Output file note: the report is written to scripts/tcg-validation-report.json
 * (not /tmp) so it lives inside the project and is git-ignorable.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// ── data loading ──────────────────────────────────────────────────────────────

const catalog = JSON.parse(
  readFileSync(resolve(projectRoot, 'src/lib/data/sealed-ml/sealed-catalog.json'), 'utf8')
);

const pcPrices = JSON.parse(
  readFileSync(resolve(projectRoot, 'src/lib/data/sealed-ml/pricecharting-current-prices.json'), 'utf8')
);

// ── helpers ───────────────────────────────────────────────────────────────────

/** Throttle: resolve after `ms` milliseconds. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Token-overlap similarity between two strings (Jaccard on word tokens).
 * Returns 0–1.
 */
function tokenOverlap(a, b) {
  const tokenise = (s) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
    );
  const setA = tokenise(a);
  const setB = tokenise(b);
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Try to extract a numeric price from a raw TCGPlayer HTML page.
 * Checks __NEXT_DATA__ JSON blob first, then JSON-LD, then a regex fallback.
 */
function parseTcgPlayerPrice(html) {
  // 1. __NEXT_DATA__
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      // Traverse to find a marketPrice / lowestListing / price field
      const str = JSON.stringify(data);
      const mktMatch = str.match(/"marketPrice"\s*:\s*([\d.]+)/);
      if (mktMatch) return parseFloat(mktMatch[1]);
      const lowestMatch = str.match(/"lowestListing"\s*:\s*([\d.]+)/);
      if (lowestMatch) return parseFloat(lowestMatch[1]);
    } catch {
      // continue to next strategy
    }
  }

  // 2. JSON-LD <script type="application/ld+json">
  const ldMatches = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const m of ldMatches) {
    try {
      const ld = JSON.parse(m[1]);
      // Could be an array or single object
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (item.offers?.price) return parseFloat(item.offers.price);
        if (item.price) return parseFloat(item.price);
      }
    } catch {
      // continue
    }
  }

  // 3. Regex fallback: "$123.45" style price in meta or visible text
  const priceMatch = html.match(/\$\s*([\d,]+\.\d{2})/);
  if (priceMatch) return parseFloat(priceMatch[1].replace(',', ''));

  return null;
}

/**
 * Extract product name from TCGPlayer page HTML.
 */
function parseTcgPlayerName(html) {
  // Try __NEXT_DATA__ first
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const str = JSON.stringify(data);
      const nameMatch = str.match(/"productName"\s*:\s*"([^"]+)"/);
      if (nameMatch) return nameMatch[1];
    } catch {
      // fall through
    }
  }
  // <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
  if (titleMatch) return titleMatch[1].replace(/\s*[-|].*$/, '').trim();
  return null;
}

/**
 * Fetch a TCGPlayer product page. Returns { ok, status, html, blocked }.
 * Rate-limited: caller is responsible for sleeping between calls.
 */
async function fetchTcgPage(productId) {
  const url = `https://www.tcgplayer.com/product/${productId}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });
    const html = await res.text();
    const blocked =
      res.status === 403 ||
      res.status === 429 ||
      html.includes('Just a moment') || // Cloudflare interstitial
      html.includes('cf-browser-verification') ||
      html.includes('cf_chl_');
    return { ok: res.ok && !blocked, status: res.status, html, blocked };
  } catch (err) {
    return { ok: false, status: 0, html: '', blocked: false, error: err.message };
  }
}

// ── PC-internal consistency analysis (fallback) ───────────────────────────────

/**
 * Analyse the PriceCharting data we already own for internal consistency
 * signals that indicate high-risk pricing rows.
 *
 * Flags:
 *  - NEW_LOOSE_DIVERGE: |newPrice - loosePrice| / loosePrice > 0.20
 *  - MANUAL_PRICE_HIGH: manualOnlyPrice > newPrice * 1.20 (manual well above market)
 *  - MANUAL_PRICE_LOW:  manualOnlyPrice < newPrice * 0.60 (manual well below market)
 */
function pcInternalConsistencyCheck(pcPrices) {
  const flags = [];

  for (const entry of Object.values(pcPrices)) {
    const { name, productType, setId, priceChartingId, newPrice, loosePrice, manualOnlyPrice } =
      entry;

    if (newPrice != null && loosePrice != null && loosePrice !== 0) {
      const spread = Math.abs(newPrice - loosePrice) / loosePrice;
      if (spread > 0.2) {
        flags.push({
          setId,
          name,
          productType,
          priceChartingId,
          flag: 'NEW_LOOSE_DIVERGE',
          newPrice,
          loosePrice,
          manualOnlyPrice,
          spreadPct: +(spread * 100).toFixed(2),
          detail: `newPrice (${newPrice}) vs loosePrice (${loosePrice}) spread ${(spread * 100).toFixed(1)}%`,
        });
      }
    }

    if (manualOnlyPrice != null && newPrice != null && newPrice !== 0) {
      const ratio = manualOnlyPrice / newPrice;
      if (ratio > 1.2) {
        flags.push({
          setId,
          name,
          productType,
          priceChartingId,
          flag: 'MANUAL_PRICE_HIGH',
          newPrice,
          loosePrice,
          manualOnlyPrice,
          spreadPct: +((ratio - 1) * 100).toFixed(2),
          detail: `manualOnlyPrice (${manualOnlyPrice}) is ${((ratio - 1) * 100).toFixed(1)}% above newPrice (${newPrice})`,
        });
      } else if (ratio < 0.6) {
        flags.push({
          setId,
          name,
          productType,
          priceChartingId,
          flag: 'MANUAL_PRICE_LOW',
          newPrice,
          loosePrice,
          manualOnlyPrice,
          spreadPct: +((1 - ratio) * 100).toFixed(2),
          detail: `manualOnlyPrice (${manualOnlyPrice}) is ${((1 - ratio) * 100).toFixed(1)}% below newPrice (${newPrice})`,
        });
      }
    }
  }

  return flags.sort((a, b) => b.spreadPct - a.spreadPct);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const generatedAt = new Date().toISOString();
  console.log('=== TCGPlayer / PriceCharting Validation ===');
  console.log(`Catalog entries: ${catalog.length}`);

  // 1. Identify entries with TCGPlayer identifiers
  const withTcgId = catalog.filter(
    (e) => e.tcgPlayerProductId || e.tcgPlayerUrl || e.tcgPlayerSlug
  );

  console.log(`Entries with TCGPlayer identifier: ${withTcgId.length}`);

  let tcgResults = [];
  let skipped = [];
  let globallyBlocked = false;

  if (withTcgId.length === 0) {
    // No TCGPlayer IDs in the catalog — document and skip to fallback
    console.log(
      '\n[INFO] No TCGPlayer product IDs found in sealed-catalog.json.\n' +
        '       Fields checked: tcgPlayerProductId, tcgPlayerUrl, tcgPlayerSlug.\n' +
        '       TCGPlayer cross-check skipped; proceeding with PC-internal analysis.\n'
    );
    skipped.push({
      reason: 'NO_TCG_IDS',
      detail:
        'sealed-catalog.json contains no tcgPlayerProductId / tcgPlayerUrl / tcgPlayerSlug fields. ' +
        'TCGPlayer cross-check cannot run without product identifiers.',
      entriesAffected: catalog.length,
    });
  } else {
    // 2. Attempt to fetch TCGPlayer pages
    console.log('\nFetching TCGPlayer pages (max 2 req/s)…');

    for (const entry of withTcgId) {
      const tcgId =
        entry.tcgPlayerProductId ||
        (entry.tcgPlayerUrl ? entry.tcgPlayerUrl.match(/\/product\/(\d+)/)?.[1] : null);

      if (!tcgId) {
        skipped.push({ setId: entry.setId, reason: 'UNPARSEABLE_TCG_ID', entry });
        continue;
      }

      const result = await fetchTcgPage(tcgId);
      await sleep(500); // 2 req/s throttle

      if (result.blocked) {
        console.log(`  [BLOCKED] ${entry.name} (${tcgId}) — status ${result.status}`);
        globallyBlocked = true;
        skipped.push({
          setId: entry.setId,
          name: entry.name,
          tcgId,
          reason: 'BLOCKED_BY_TCG',
          httpStatus: result.status,
        });
        // If first real request is blocked, bail out of the loop to avoid hammering
        break;
      }

      if (!result.ok) {
        skipped.push({
          setId: entry.setId,
          name: entry.name,
          tcgId,
          reason: 'HTTP_ERROR',
          httpStatus: result.status,
          error: result.error,
        });
        continue;
      }

      const tcgPrice = parseTcgPlayerPrice(result.html);
      const tcgName = parseTcgPlayerName(result.html);

      // Look up PC price
      const pcEntry = pcPrices[entry.setId] ?? Object.values(pcPrices).find((p) => p.priceChartingId === entry.priceChartingId);
      const pcPrice = pcEntry?.newPrice ?? pcEntry?.loosePrice;

      const nameOverlap = tcgName ? tokenOverlap(entry.name, tcgName) : null;
      const priceMismatch =
        tcgPrice != null && pcPrice != null
          ? Math.abs(tcgPrice - pcPrice) / pcPrice > 0.2
          : null;
      const nameMismatch = nameOverlap != null ? nameOverlap < 0.5 : null;

      const isMismatch = priceMismatch || nameMismatch;

      const row = {
        setId: entry.setId,
        name: entry.name,
        productType: entry.productType,
        priceChartingId: entry.priceChartingId,
        tcgId,
        tcgName,
        tcgPrice,
        pcPrice,
        nameOverlap: nameOverlap != null ? +nameOverlap.toFixed(3) : null,
        priceMismatch,
        nameMismatch,
        isMismatch,
      };

      tcgResults.push(row);
      const tag = isMismatch ? '⚠ MISMATCH' : '✓ OK';
      console.log(
        `  ${tag} ${entry.name} — TCG $${tcgPrice ?? 'n/a'} vs PC $${pcPrice ?? 'n/a'} (name overlap ${nameOverlap != null ? (nameOverlap * 100).toFixed(0) : 'n/a'}%)`
      );
    }

    if (globallyBlocked) {
      console.log('\n[WARN] TCGPlayer is blocking requests (Cloudflare / 403).');
      console.log('       Falling back to PC-internal consistency analysis.\n');
    }
  }

  // 3. PC-internal fallback analysis
  const pcFlags = pcInternalConsistencyCheck(pcPrices);

  console.log(`\n── PC-Internal Consistency Check ────────────────────────────`);
  console.log(`Flagged entries: ${pcFlags.length}`);
  if (pcFlags.length > 0) {
    console.log('\nTop flags (sorted by spread):');
    pcFlags.slice(0, 10).forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.flag}] ${f.name} (${f.productType}) — ${f.detail}`);
    });
  } else {
    console.log('  No internal consistency issues found.');
  }

  // 4. Compose report
  const mismatches = tcgResults.filter((r) => r.isMismatch);
  const report = {
    generatedAt,
    totalCatalogEntries: catalog.length,
    tcgIdsFound: withTcgId.length,
    totalChecked: tcgResults.length,
    mismatchCount: mismatches.length,
    globallyBlocked,
    mismatches,
    tcgResults: tcgResults.filter((r) => !r.isMismatch),
    skipped,
    pcInternalConsistency: {
      totalFlagged: pcFlags.length,
      flags: pcFlags,
      note:
        'PC newPrice equals loosePrice for all 156 entries (PriceCharting does not distinguish ' +
        'new vs loose for sealed products). manualOnlyPrice flags below indicate entries where ' +
        'a manual override differs materially from the market price.',
    },
  };

  // 5. Write report
  const reportPath = resolve(__dirname, 'tcg-validation-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to: ${reportPath}`);

  // 6. Summary
  console.log('\n=== SUMMARY ===');
  if (withTcgId.length === 0) {
    console.log('TCGPlayer check: SKIPPED — no TCGPlayer IDs in catalog');
  } else if (globallyBlocked) {
    console.log('TCGPlayer check: BLOCKED — Cloudflare/403');
  } else {
    console.log(
      `TCGPlayer check: ${tcgResults.length} checked, ${mismatches.length} mismatches`
    );
  }
  console.log(
    `PC-internal flags: ${pcFlags.length} total` +
      (pcFlags.length > 0
        ? ` (top: ${pcFlags[0].name} — ${pcFlags[0].flag} ${pcFlags[0].spreadPct}%)`
        : '')
  );
  if (skipped.length > 0) {
    console.log(`Skipped: ${skipped.length} entries`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
