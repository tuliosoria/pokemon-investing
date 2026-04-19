#!/usr/bin/env npx tsx
/**
 * PokeData → DynamoDB Ingestion Pipeline
 *
 * Fetches all sealed Pokémon TCG products from PokeData, retrieves pricing
 * and transaction history for each, and writes everything to DynamoDB.
 *
 * Two-phase approach:
 *   Phase 1: Write META for ALL English products (catalog discovery)
 *   Phase 2: Fetch pricing + transactions only for investment-relevant types
 *
 * Usage:
 *   npx tsx scripts/seed-products.ts                # full run
 *   npx tsx scripts/seed-products.ts --resume       # resume from checkpoint
 *   npx tsx scripts/seed-products.ts --dry-run      # preview without writing
 *   npx tsx scripts/seed-products.ts --meta-only    # only write product catalog
 *   npx tsx scripts/seed-products.ts --concurrency 5 --delay 300
 *
 * Environment:
 *   POKEDATA_API_KEY   — required
 *   DYNAMODB_TABLE     — defaults to pokeinvest-cache
 *   AWS_REGION         — defaults to us-east-1
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";

// ---------------------------------------------------------------------------
// Configuration (overridable via CLI args)
// ---------------------------------------------------------------------------
const CONFIG = {
  CONCURRENCY: 3,        // max parallel API requests
  DELAY_MS: 500,         // delay between batches
  MAX_RETRIES: 3,        // retry count for failed requests
  DRY_RUN: false,
  RESUME: false,
  META_ONLY: false,      // only write product catalog, skip pricing/txns
  TABLE: process.env.DYNAMODB_TABLE || "pokeinvest-cache",
  POKEDATA_KEY: process.env.POKEDATA_API_KEY || "",
  POKEDATA_BASE: "https://www.pokedata.io",
};

// Product types worth fetching pricing + transactions for
const PRICE_WORTHY_TYPES = new Set([
  "BOOSTERBOX",
  "ELITETRAINERBOX",
  "SPECIALBOX",
  "COLLECTIONBOX",
  "TIN",
  "BLISTERPACK",
  "BOOSTERPACK",
  "COLLECTIONCHEST",
  "LIMITEDSET",
  "SPECIALSET",
  "PREMIUMTRAINERBOX",
  "JUMBOPACK",
  "SPECIALPACK",
  "PINCOLLECTION",
]);

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--resume":
        CONFIG.RESUME = true;
        break;
      case "--dry-run":
        CONFIG.DRY_RUN = true;
        break;
      case "--meta-only":
        CONFIG.META_ONLY = true;
        break;
      case "--concurrency":
        CONFIG.CONCURRENCY = parseInt(args[++i]) || 3;
        break;
      case "--delay":
        CONFIG.DELAY_MS = parseInt(args[++i]) || 500;
        break;
      case "--table":
        CONFIG.TABLE = args[++i] || CONFIG.TABLE;
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// DynamoDB client
// ---------------------------------------------------------------------------
function createDdbClient(): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
  });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function log(level: string, msg: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const extra = data ? " " + JSON.stringify(data) : "";
  console.log(`[${ts}] [${level}] ${msg}${extra}`);
}

// ---------------------------------------------------------------------------
// HTTP fetch with exponential backoff
// ---------------------------------------------------------------------------
async function fetchWithRetry(
  url: string,
  opts: { retries?: number; label?: string } = {}
): Promise<unknown> {
  const { retries = CONFIG.MAX_RETRIES, label = url } = opts;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${CONFIG.POKEDATA_KEY}` },
      });
      if (res.status === 429 || res.status >= 500) {
        const backoff = Math.pow(2, attempt) * 1000;
        log("WARN", `${label} → ${res.status}, retry ${attempt + 1}/${retries} in ${backoff}ms`);
        if (attempt < retries) {
          await sleep(backoff);
          continue;
        }
        throw new Error(`${label}: ${res.status} after ${retries} retries`);
      }
      if (!res.ok) {
        throw new Error(`${label}: ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt < retries && (err as Error).message?.includes("fetch failed")) {
        const backoff = Math.pow(2, attempt) * 1000;
        log("WARN", `${label} → network error, retry ${attempt + 1}/${retries} in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// PokeData API wrappers
// ---------------------------------------------------------------------------
interface RawProduct {
  id: number;
  name: string;
  type: string;
  language: string;
  set_id: number;
  series: string;
  release_date: string;
  year: number;
  img_url: string;
  tcgplayer_id?: string | null;
  live: boolean;
  market_value?: number;
}

interface RawSetInfo {
  id: number;
  name: string;
  series: string;
  release_date: string;
}

interface RawTransaction {
  id: number;
  product_id: number;
  date_sold: string;
  sold_price: number;
  ebay_handle: string;
  ebay_item_id: string;
  num_bids: number;
}

interface RawPricing {
  id: number;
  name: string;
  pricing: Record<string, { currency: string; value: number }>;
  release_date: string;
  set_id: number;
}

// In-memory set name cache (set_id → set name)
const setNameCache = new Map<number, string>();

async function fetchAllProducts(): Promise<RawProduct[]> {
  log("INFO", "Fetching full product catalog...");
  const data = (await fetchWithRetry(
    `${CONFIG.POKEDATA_BASE}/api/products`,
    { label: "GET /api/products" }
  )) as RawProduct[];
  log("INFO", `Fetched ${data.length} total products`);
  return data;
}

async function fetchSetName(setId: number): Promise<string> {
  if (setNameCache.has(setId)) return setNameCache.get(setId)!;
  try {
    const data = (await fetchWithRetry(
      `${CONFIG.POKEDATA_BASE}/api/sets?set_id=${setId}`,
      { label: `set(${setId})` }
    )) as RawSetInfo[];
    const name = data?.[0]?.name || `Set ${setId}`;
    setNameCache.set(setId, name);
    return name;
  } catch {
    return `Set ${setId}`;
  }
}

async function prefetchSetNames(_products: RawProduct[]): Promise<void> {
  log("INFO", "Fetching all set names...");
  try {
    const data = (await fetchWithRetry(
      `${CONFIG.POKEDATA_BASE}/api/sets`,
      { label: "GET /api/sets" }
    )) as RawSetInfo[];
    for (const s of data) {
      setNameCache.set(s.id, s.name);
    }
    log("INFO", `Loaded ${setNameCache.size} set names`);
  } catch (err) {
    log("WARN", `Failed to fetch sets: ${(err as Error).message}`);
  }
}

async function fetchPricing(productId: number): Promise<RawPricing | null> {
  try {
    return (await fetchWithRetry(
      `${CONFIG.POKEDATA_BASE}/v0/pricing?id=${productId}&asset_type=PRODUCT`,
      { label: `pricing(${productId})` }
    )) as RawPricing;
  } catch {
    return null;
  }
}

async function fetchTransactions(
  productId: number
): Promise<{ ebay_avg: RawTransaction[]; tcgplayer: RawTransaction[] } | null> {
  try {
    return (await fetchWithRetry(
      `${CONFIG.POKEDATA_BASE}/api/product_transactions?product_id=${productId}`,
      { label: `txns(${productId})` }
    )) as { ebay_avg: RawTransaction[]; tcgplayer: RawTransaction[] };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// DynamoDB writers
// ---------------------------------------------------------------------------
let ddb: DynamoDBDocumentClient;

function getDdb(): DynamoDBDocumentClient {
  if (!ddb) ddb = createDdbClient();
  return ddb;
}

async function writeProductMeta(product: RawProduct) {
  const releaseDate = product.release_date || "1970-01-01";
  const setName = setNameCache.get(product.set_id) || `Set ${product.set_id}`;
  await getDdb().send(
    new PutCommand({
      TableName: CONFIG.TABLE,
      Item: {
        pk: `PRODUCT#${product.id}`,
        sk: "META",
        gsi1pk: `SET#${product.set_id}#${product.type}`,
        gsi1sk: `RELEASE#${releaseDate}#PRODUCT#${product.id}`,
        name: product.name,
        productType: product.type,
        setId: product.set_id,
        setName,
        series: product.series,
        releaseDate,
        year: product.year,
        imgUrl: product.img_url,
        tcgplayerId: product.tcgplayer_id,
        language: product.language,
        marketValue: product.market_value,
        updatedAt: new Date().toISOString(),
      },
    })
  );
}

async function writePriceSnapshot(productId: number, pricing: RawPricing) {
  const today = new Date().toISOString().slice(0, 10);
  const tcg = pricing.pricing?.["TCGPlayer"]?.value ?? null;
  const ebay = pricing.pricing?.["eBay Sealed"]?.value ?? null;
  const poke = pricing.pricing?.["Pokedata Sealed"]?.value ?? null;
  const best =
    tcg && tcg > 0 ? tcg : poke && poke > 0 ? poke : ebay && ebay > 0 ? ebay : null;

  await getDdb().send(
    new PutCommand({
      TableName: CONFIG.TABLE,
      Item: {
        pk: `PRODUCT#${productId}`,
        sk: `PRICE#${today}`,
        tcgplayerPrice: tcg,
        ebayPrice: ebay,
        pokedataPrice: poke,
        bestPrice: best ? Math.round(best * 100) / 100 : null,
        snapshotDate: today,
        updatedAt: new Date().toISOString(),
      },
    })
  );
}

async function writeTransactions(
  productId: number,
  transactions: RawTransaction[]
) {
  // DynamoDB BatchWrite max 25 items per call
  const BATCH_SIZE = 25;
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const items = batch.map((txn) => {
      const dateStr = txn.date_sold
        ? new Date(txn.date_sold).toISOString().slice(0, 10)
        : "unknown";
      return {
        PutRequest: {
          Item: {
            pk: `PRODUCT#${productId}`,
            sk: `TXN#${dateStr}#${txn.ebay_item_id || txn.id}`,
            soldPrice: txn.sold_price,
            dateSold: dateStr,
            ebayHandle: txn.ebay_handle,
            ebayItemId: txn.ebay_item_id,
            numBids: txn.num_bids,
          },
        },
      };
    });

    let unprocessed = items;
    let retries = 0;
    while (unprocessed.length > 0 && retries < CONFIG.MAX_RETRIES) {
      const res = await getDdb().send(
        new BatchWriteCommand({
          RequestItems: { [CONFIG.TABLE]: unprocessed },
        })
      );
      const leftover = res.UnprocessedItems?.[CONFIG.TABLE] || [];
      if (leftover.length > 0) {
        retries++;
        const backoff = Math.pow(2, retries) * 500;
        log("WARN", `${leftover.length} unprocessed items, retry ${retries} in ${backoff}ms`);
        await sleep(backoff);
        unprocessed = leftover as typeof items;
      } else {
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Run lock — prevents concurrent pipeline runs
// ---------------------------------------------------------------------------
const LOCK_TTL_MINUTES = 120;

async function acquireLock(): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MINUTES * 60_000).toISOString();
  try {
    await getDdb().send(
      new PutCommand({
        TableName: CONFIG.TABLE,
        Item: {
          pk: "PIPELINE#seed",
          sk: "LOCK",
          status: "running",
          acquiredAt: now.toISOString(),
          expiresAt,
          ttl: Math.floor(now.getTime() / 1000) + LOCK_TTL_MINUTES * 60,
        },
        ConditionExpression:
          "attribute_not_exists(pk) OR #s <> :running OR expiresAt < :now",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":running": "running", ":now": now.toISOString() },
      })
    );
    return true;
  } catch (err) {
    if ((err as Error).name === "ConditionalCheckFailedException") {
      return false;
    }
    throw err;
  }
}

async function releaseLock() {
  await getDdb().send(
    new DeleteCommand({
      TableName: CONFIG.TABLE,
      Key: { pk: "PIPELINE#seed", sk: "LOCK" },
    })
  );
}

// ---------------------------------------------------------------------------
// Checkpoint management — stable product-ID based
// ---------------------------------------------------------------------------
interface Checkpoint {
  lastProcessedId: number; // product ID, not array index
  totalProducts: number;
  completedCount: number;
  failedCount: number;
  startedAt: string;
  lastUpdatedAt: string;
}

async function loadCheckpoint(): Promise<Checkpoint | null> {
  try {
    const res = await getDdb().send(
      new GetCommand({
        TableName: CONFIG.TABLE,
        Key: { pk: "PIPELINE#seed", sk: "STATUS" },
      })
    );
    return res.Item as Checkpoint | null;
  } catch {
    return null;
  }
}

async function saveCheckpoint(cp: Checkpoint) {
  await getDdb().send(
    new PutCommand({
      TableName: CONFIG.TABLE,
      Item: {
        pk: "PIPELINE#seed",
        sk: "STATUS",
        ...cp,
      },
    })
  );
}

async function recordFailure(productId: number, error: string) {
  await getDdb().send(
    new PutCommand({
      TableName: CONFIG.TABLE,
      Item: {
        pk: "PIPELINE#seed",
        sk: `FAIL#${productId}`,
        error,
        failedAt: new Date().toISOString(),
      },
    })
  );
}

// ---------------------------------------------------------------------------
// Process a single product (pricing + transactions)
// ---------------------------------------------------------------------------
async function processProduct(product: RawProduct, metaOnly: boolean): Promise<boolean> {
  const label = `[${product.id}] ${product.name}`;

  try {
    if (CONFIG.DRY_RUN && metaOnly) {
      log("DRY", `${label} (META)`, { type: product.type, set: product.set_name });
      return true;
    }

    // Always write META
    if (!CONFIG.DRY_RUN) {
      await writeProductMeta(product);
    }

    // Skip pricing/txns if meta-only or not a price-worthy type
    if (metaOnly || !PRICE_WORTHY_TYPES.has(product.type)) {
      if (!metaOnly) {
        log("OK", `${label} (META only — type: ${product.type})`);
      }
      return true;
    }

    // Fetch pricing and transactions in parallel
    const [pricing, txnData] = await Promise.all([
      fetchPricing(product.id),
      fetchTransactions(product.id),
    ]);

    if (CONFIG.DRY_RUN) {
      const txnCount =
        (txnData?.ebay_avg?.length ?? 0) + (txnData?.tcgplayer?.length ?? 0);
      log("DRY", label, {
        hasPrice: !!pricing,
        txnCount,
        bestPrice: pricing?.pricing?.["TCGPlayer"]?.value ?? null,
      });
      return true;
    }

    // Write price snapshot
    if (pricing) {
      await writePriceSnapshot(product.id, pricing);
    }

    // Write transaction history
    const allTxns = [
      ...(txnData?.ebay_avg || []),
      ...(txnData?.tcgplayer || []),
    ];
    if (allTxns.length > 0) {
      await writeTransactions(product.id, allTxns);
    }

    log("OK", label, {
      price: pricing?.pricing?.["TCGPlayer"]?.value ?? null,
      txns: allTxns.length,
    });

    return true;
  } catch (err) {
    log("ERR", `${label}: ${(err as Error).message}`);
    if (!CONFIG.DRY_RUN) {
      await recordFailure(product.id, (err as Error).message).catch(() => {});
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Process products with controlled concurrency
// ---------------------------------------------------------------------------
async function processInBatches(
  products: RawProduct[],
  startFromId: number,
  metaOnly: boolean
) {
  // Find resume index based on product ID (products are sorted by id)
  let startIndex = 0;
  if (startFromId > 0) {
    startIndex = products.findIndex((p) => p.id > startFromId);
    if (startIndex === -1) startIndex = products.length; // all done
  }

  const checkpoint: Checkpoint = {
    lastProcessedId: startFromId,
    totalProducts: products.length,
    completedCount: 0,
    failedCount: 0,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  };

  let completed = 0;
  let failed = 0;

  for (let i = startIndex; i < products.length; i += CONFIG.CONCURRENCY) {
    const batch = products.slice(i, i + CONFIG.CONCURRENCY);

    const results = await Promise.all(
      batch.map((p) => processProduct(p, metaOnly))
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j]) {
        completed++;
      } else {
        failed++;
      }
    }

    // Update checkpoint with last product ID in this batch
    const lastProduct = batch[batch.length - 1];
    checkpoint.lastProcessedId = lastProduct.id;
    checkpoint.completedCount = completed;
    checkpoint.failedCount = failed;
    checkpoint.lastUpdatedAt = new Date().toISOString();

    // Save checkpoint every 10 batches or at the end
    if (
      !CONFIG.DRY_RUN &&
      (i % (CONFIG.CONCURRENCY * 10) === 0 ||
        i + CONFIG.CONCURRENCY >= products.length)
    ) {
      await saveCheckpoint(checkpoint);
    }

    // Progress log every 5 batches
    const processed = i + batch.length - startIndex;
    const total = products.length - startIndex;
    const pct = ((processed / total) * 100).toFixed(1);
    if (i % (CONFIG.CONCURRENCY * 5) === 0 || i + CONFIG.CONCURRENCY >= products.length) {
      log(
        "PROGRESS",
        `${processed}/${total} (${pct}%) — ${completed} ok, ${failed} failed`
      );
    }

    // Delay between batches (skip for meta-only since no API calls needed)
    if (!metaOnly && i + CONFIG.CONCURRENCY < products.length) {
      await sleep(CONFIG.DELAY_MS);
    }
  }

  return { completed, failed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  parseArgs();

  if (!CONFIG.POKEDATA_KEY) {
    console.error("ERROR: POKEDATA_API_KEY environment variable is required");
    console.error("  export POKEDATA_API_KEY=your_key_here");
    process.exit(1);
  }

  log("INFO", "=== PokeData → DynamoDB Ingestion Pipeline ===");
  log("INFO", `Table: ${CONFIG.TABLE}`);
  log("INFO", `Concurrency: ${CONFIG.CONCURRENCY}, Delay: ${CONFIG.DELAY_MS}ms`);
  log("INFO", `Mode: ${CONFIG.DRY_RUN ? "DRY RUN" : CONFIG.META_ONLY ? "META ONLY" : CONFIG.RESUME ? "RESUME" : "FULL RUN"}`);

  // Acquire run lock (skip for dry-run)
  if (!CONFIG.DRY_RUN) {
    const locked = await acquireLock();
    if (!locked) {
      log("ERR", "Another pipeline run is in progress. Use --resume after it finishes.");
      process.exit(1);
    }
    log("INFO", "Run lock acquired");
  }

  try {
    // Step 1: Fetch product catalog
    const allProducts = await fetchAllProducts();
    const english = allProducts.filter((p) => p.language === "ENGLISH");

    // Sort by product ID for stable checkpoint ordering
    english.sort((a, b) => a.id - b.id);

    const priceWorthy = english.filter((p) => PRICE_WORTHY_TYPES.has(p.type));

    log("INFO", `Catalog: ${allProducts.length} total → ${english.length} English → ${priceWorthy.length} price-worthy types`);

    // Prefetch set names (one-time bulk lookup)
    await prefetchSetNames(english);

    // Step 2: Check checkpoint for resume
    let startFromId = 0;
    if (CONFIG.RESUME) {
      const cp = await loadCheckpoint();
      if (cp && cp.lastProcessedId > 0) {
        startFromId = cp.lastProcessedId;
        log("INFO", `Resuming after product ID ${startFromId} (${cp.completedCount} previously completed)`);
      } else {
        log("INFO", "No checkpoint found, starting from beginning");
      }
    }

    // Step 3: Phase 1 — META for ALL English products
    if (CONFIG.META_ONLY || !CONFIG.RESUME) {
      log("INFO", "=== Phase 1: Writing product catalog (META for all English products) ===");
      const metaStart = Date.now();
      const metaResult = await processInBatches(english, CONFIG.RESUME ? startFromId : 0, true);
      const metaElapsed = ((Date.now() - metaStart) / 1000).toFixed(1);
      log("INFO", `Phase 1 complete: ${metaResult.completed} META records in ${metaElapsed}s`);
    }

    if (CONFIG.META_ONLY) {
      log("INFO", "=== META-ONLY mode complete ===");
      return;
    }

    // Step 4: Phase 2 — Pricing + transactions for investment-relevant products
    log("INFO", `=== Phase 2: Fetching pricing + transactions for ${priceWorthy.length} products ===`);
    const startTime = Date.now();
    const { completed, failed } = await processInBatches(priceWorthy, startFromId, false);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    // Step 5: Summary
    log("INFO", "=== COMPLETE ===");
    log("INFO", `Processed: ${completed + failed} products in ${elapsed} minutes`);
    log("INFO", `Success: ${completed}, Failed: ${failed}`);

    // Estimated DynamoDB records: META + 1 PRICE + ~50 TXN per product
    const estimatedRecords = english.length + completed * 52;
    log("INFO", `Estimated DynamoDB records written: ~${estimatedRecords.toLocaleString()}`);
  } finally {
    // Release lock
    if (!CONFIG.DRY_RUN) {
      await releaseLock().catch(() => {});
      log("INFO", "Run lock released");
    }
  }
}

main().catch((err) => {
  log("FATAL", (err as Error).message);
  // Try to release lock on crash
  releaseLock().catch(() => {});
  process.exit(1);
});
