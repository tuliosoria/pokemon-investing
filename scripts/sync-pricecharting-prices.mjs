import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "src", "lib", "data", "sealed-ml", "products.json");
const OUTPUT_PATH = path.join(
  ROOT,
  "src",
  "lib",
  "data",
  "sealed-ml",
  "pricecharting-current-prices.json"
);
const TRAINING_SNAPSHOT_OUTPUT_PATH = path.join(
  ROOT,
  "src",
  "lib",
  "data",
  "sealed-ml",
  "dual-provider-monthly-snapshots.json"
);
const PRICECHARTING_BASE_URL = "https://www.pricecharting.com/api/";
const POKEDATA_BASE_URL = "https://www.pokedata.io/v0";
const MIN_REQUEST_INTERVAL_MS = 1100;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || "";
const TOKEN = (process.env.PRICECHARTING_API_TOKEN || "").trim();
const POKEDATA_API_KEY = (process.env.POKEDATA_API_KEY || "").trim();

let lastRequestStartedAt = 0;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/&/g, "and")
    .toLowerCase()
    .trim();
}

function releaseYear(value) {
  const parsed = Number.parseInt(String(value || "").slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundPrice(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const pennies = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(pennies) || pennies <= 0) {
    return null;
  }

  return Math.round(pennies) / 100;
}

function buildSearchQuery(product) {
  const typeAliases = {
    ETB: "elite trainer box",
    UPC: "ultra premium collection",
  };
  const normalizedType = typeAliases[product.productType] || product.productType;
  return `${product.name} ${normalizedType} pokemon`;
}

function pickPokeDataBestPrice(pricing) {
  const tcg = pricing?.TCGPlayer?.value ?? null;
  const ebay = pricing?.["eBay Sealed"]?.value ?? null;
  const poke = pricing?.["Pokedata Sealed"]?.value ?? null;

  for (const candidate of [tcg, poke, ebay]) {
    const rounded = roundPrice(candidate);
    if (rounded) {
      return rounded;
    }
  }

  return null;
}

function computeSpreadPct(priceChartingPrice, fallbackPrice) {
  if (!priceChartingPrice || !fallbackPrice) {
    return null;
  }

  return Math.round(((priceChartingPrice - fallbackPrice) / fallbackPrice) * 100000) / 1000;
}

async function throttle() {
  const elapsed = Date.now() - lastRequestStartedAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed)
    );
  }
  lastRequestStartedAt = Date.now();
}

async function requestPriceCharting(query) {
  const url = new URL("product", PRICECHARTING_BASE_URL);
  url.searchParams.set("t", TOKEN);
  url.searchParams.set("q", query);

  await throttle();

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "PokeAlpha/1.0 PriceCharting sync",
    },
  });

  if (!response.ok) {
    throw new Error(`PriceCharting request failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status === "error") {
    throw new Error(payload["error-message"] || "PriceCharting request failed");
  }

  return payload;
}

async function requestPokeDataPricing(pokedataId) {
  if (!POKEDATA_API_KEY || !pokedataId) {
    return null;
  }

  const url = new URL(`${POKEDATA_BASE_URL}/pricing`);
  url.searchParams.set("id", pokedataId);
  url.searchParams.set("asset_type", "PRODUCT");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${POKEDATA_API_KEY}`,
      "User-Agent": "PokeAlpha/1.0 dual-provider sync",
    },
  });

  if (!response.ok) {
    throw new Error(`PokeData pricing request failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  const pricing = payload.pricing || {};

  return {
    tcgplayerPrice: roundPrice(pricing.TCGPlayer?.value),
    ebayPrice: roundPrice(pricing["eBay Sealed"]?.value),
    pokedataPrice: roundPrice(pricing["Pokedata Sealed"]?.value),
    bestPrice: pickPokeDataBestPrice(pricing),
  };
}

function createDynamo() {
  if (!DYNAMODB_TABLE) {
    return null;
  }

  const raw = new DynamoDBClient({ region: AWS_REGION });
  return DynamoDBDocumentClient.from(raw, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

async function loadPokeDataMetaIndex(ddb) {
  if (!ddb) {
    return [];
  }

  const items = [];
  let exclusiveStartKey;

  do {
    const response = await ddb.send(
      new ScanCommand({
        TableName: DYNAMODB_TABLE,
        ProjectionExpression:
          "pk, sk, #name, productType, releaseDate, imgUrl, priceChartingId",
        ExpressionAttributeNames: {
          "#name": "name",
        },
        FilterExpression: "sk = :meta AND begins_with(pk, :productPrefix)",
        ExpressionAttributeValues: {
          ":meta": "META",
          ":productPrefix": "PRODUCT#",
        },
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    items.push(...(response.Items || []));
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items.map((item) => ({
    pokedataId: String(item.pk).replace(/^PRODUCT#/, ""),
    name: item.name || "",
    productType: item.productType || "Unknown",
    releaseDate: item.releaseDate || null,
    imgUrl: item.imgUrl || null,
    priceChartingId: item.priceChartingId || null,
  }));
}

function scorePokeDataMatch(product, candidate) {
  const normalizedProduct = normalize(product.name);
  const normalizedCandidate = normalize(candidate.name);
  let score = 0;

  if (normalizedProduct === normalizedCandidate) {
    score += 400;
  } else if (
    normalizedProduct.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedProduct)
  ) {
    score += 220;
  }

  if (product.productType === candidate.productType) {
    score += 90;
  }

  const productYear = releaseYear(product.releaseDate);
  const candidateYear = releaseYear(candidate.releaseDate);
  if (productYear && candidateYear) {
    if (productYear === candidateYear) {
      score += 50;
    } else if (Math.abs(productYear - candidateYear) === 1) {
      score += 20;
    } else {
      score -= 60;
    }
  }

  return score;
}

function findBestPokeDataMatch(product, candidates) {
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const score = scorePokeDataMatch(product, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= 220 ? best : null;
}

async function persistSnapshot(ddb, syncedEntry, matchedPokeDataProduct) {
  if (!ddb) {
    return;
  }

  const snapshotDate = syncedEntry.capturedAt.slice(0, 10);
  const updatedAt = new Date().toISOString();

  if (matchedPokeDataProduct) {
    await ddb.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: {
          pk: `PRODUCT#${matchedPokeDataProduct.pokedataId}`,
          sk: `PRICE#${snapshotDate}`,
          priceChartingPrice: syncedEntry.newPrice,
          bestPrice: syncedEntry.newPrice,
          primaryProvider: "pricecharting",
          snapshotDate,
          updatedAt,
        },
      })
    );

    await ddb.send(
      new UpdateCommand({
        TableName: DYNAMODB_TABLE,
        Key: { pk: `PRODUCT#${matchedPokeDataProduct.pokedataId}`, sk: "META" },
        UpdateExpression:
          "SET priceChartingId = :priceChartingId, priceChartingProductName = :productName, priceChartingConsoleName = :consoleName, priceChartingReleaseDate = :releaseDate, priceChartingLastSyncedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":priceChartingId": syncedEntry.priceChartingId,
          ":productName": syncedEntry.productName,
          ":consoleName": syncedEntry.consoleName,
          ":releaseDate": syncedEntry.releaseDate,
          ":updatedAt": updatedAt,
        },
      })
    );
  }
}

async function persistTrainingSnapshot(ddb, snapshot) {
  if (!ddb) {
    return;
  }

  await ddb.send(
    new PutCommand({
      TableName: DYNAMODB_TABLE,
      Item: {
        pk: `SEALED_TRAINING#${snapshot.setId}`,
        sk: `SNAPSHOT#${snapshot.snapshotMonth}`,
        entityType: "SEALED_TRAINING_SNAPSHOT",
        ...snapshot,
      },
    })
  );
}

function buildTrainingSnapshot(product, syncedEntry, matchedPokeDataProduct, pokedataPricing) {
  const snapshotMonth = syncedEntry.capturedAt.slice(0, 7);
  const providerCount = [
    syncedEntry.newPrice,
    pokedataPricing?.bestPrice,
    pokedataPricing?.tcgplayerPrice,
    pokedataPricing?.ebayPrice,
    pokedataPricing?.pokedataPrice,
  ].filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0).length;

  return {
    setId: product.setId,
    name: product.name,
    productType: product.productType,
    releaseDate: syncedEntry.releaseDate || product.releaseDate,
    snapshotMonth,
    capturedAt: syncedEntry.capturedAt,
    pokedataId: matchedPokeDataProduct?.pokedataId || null,
    priceChartingId: syncedEntry.priceChartingId,
    priceChartingPrice: syncedEntry.newPrice,
    priceChartingManualOnlyPrice: syncedEntry.manualOnlyPrice,
    priceChartingSalesVolume: syncedEntry.salesVolume,
    tcgplayerPrice: pokedataPricing?.tcgplayerPrice ?? null,
    ebayPrice: pokedataPricing?.ebayPrice ?? null,
    pokedataPrice: pokedataPricing?.pokedataPrice ?? null,
    pokedataBestPrice: pokedataPricing?.bestPrice ?? null,
    providerSpreadPct: computeSpreadPct(
      syncedEntry.newPrice,
      pokedataPricing?.bestPrice ?? null
    ),
    availableProviderCount: providerCount,
    primaryProvider: "pricecharting",
    snapshotSource: "sync-pricecharting-prices",
  };
}

async function main() {
  if (!TOKEN) {
    throw new Error("PRICECHARTING_API_TOKEN is required");
  }

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const dynamo = createDynamo();
  const pokeDataMeta = await loadPokeDataMetaIndex(dynamo);
  const capturedAt = new Date().toISOString();
  const syncedEntries = [];
  const trainingSnapshots = [];
  const failures = [];

  for (const product of manifest) {
    try {
      const payload = await requestPriceCharting(buildSearchQuery(product));
      const newPrice = roundPrice(payload["new-price"]);
      if (!payload.id || !newPrice) {
        throw new Error("Missing PriceCharting product id or sealed price");
      }

      const syncedEntry = {
        setId: product.setId,
        name: product.name,
        productType: product.productType,
        releaseDate: payload["release-date"] || product.releaseDate,
        priceChartingId: String(payload.id),
        productName: payload["product-name"] || product.name,
        consoleName: payload["console-name"] || null,
        newPrice,
        manualOnlyPrice: roundPrice(payload["manual-only-price"]),
        salesVolume:
          Number.parseInt(String(payload["sales-volume"] || ""), 10) || null,
        capturedAt,
      };

      syncedEntries.push(syncedEntry);

      const matchedPokeDataProduct = findBestPokeDataMatch(product, pokeDataMeta);
      const pokedataPricing = await requestPokeDataPricing(
        matchedPokeDataProduct?.pokedataId || ""
      );
      const trainingSnapshot = buildTrainingSnapshot(
        product,
        syncedEntry,
        matchedPokeDataProduct,
        pokedataPricing
      );
      trainingSnapshots.push(trainingSnapshot);
      await persistSnapshot(dynamo, syncedEntry, matchedPokeDataProduct);
      await persistTrainingSnapshot(dynamo, trainingSnapshot);

      console.log(
        `synced ${product.name} -> PriceCharting ${syncedEntry.priceChartingId} ($${syncedEntry.newPrice})`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ setId: product.setId, name: product.name, error: message });
      console.warn(`failed ${product.name}: ${message}`);
    }
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(syncedEntries, null, 2)}\n`);
  await writeFile(
    TRAINING_SNAPSHOT_OUTPUT_PATH,
    `${JSON.stringify(trainingSnapshots, null, 2)}\n`
  );

  console.log(
    JSON.stringify(
      {
        synced: syncedEntries.length,
        trainingSnapshots: trainingSnapshots.length,
        failed: failures.length,
        outputPath: path.relative(ROOT, OUTPUT_PATH),
        trainingSnapshotOutputPath: path.relative(ROOT, TRAINING_SNAPSHOT_OUTPUT_PATH),
        dynamoSnapshotsUpdated: Boolean(dynamo),
        failures,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
