#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const DEFAULT_OUTPUT = path.join(
  process.cwd(),
  "src/lib/data/cards/card-catalog.json"
);

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    replace: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--output") {
      args.output = path.resolve(argv[index + 1] ?? DEFAULT_OUTPUT);
      index += 1;
      continue;
    }

    if (arg === "--replace") {
      args.replace = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function asFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizePrices(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value).reduce((acc, [variant, rawVariant]) => {
    if (!variant || !rawVariant || typeof rawVariant !== "object") {
      return acc;
    }

    acc[variant] = {
      low: asFiniteNumber(rawVariant.low),
      mid: asFiniteNumber(rawVariant.mid),
      high: asFiniteNumber(rawVariant.high),
      market: asFiniteNumber(rawVariant.market),
      directLow: asFiniteNumber(rawVariant.directLow),
    };

    return acc;
  }, {});
}

function sanitizeEntry(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value;
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  const set = typeof entry.set === "string" ? entry.set.trim() : "";
  const imageSmall =
    typeof entry.imageSmall === "string" ? entry.imageSmall.trim() : "";
  const imageLarge =
    typeof entry.imageLarge === "string" && entry.imageLarge.trim().length > 0
      ? entry.imageLarge.trim()
      : imageSmall;

  if (!id || !name || !set) {
    return null;
  }

  return {
    id,
    name,
    set,
    setId: typeof entry.setId === "string" ? entry.setId.trim() : "",
    number: typeof entry.number === "string" ? entry.number.trim() : "",
    rarity:
      typeof entry.rarity === "string" && entry.rarity.trim().length > 0
        ? entry.rarity.trim()
        : null,
    imageSmall,
    imageLarge,
    prices: sanitizePrices(entry.prices),
    tcgplayerUrl:
      typeof entry.tcgplayerUrl === "string" && entry.tcgplayerUrl.trim().length > 0
        ? entry.tcgplayerUrl.trim()
        : null,
    lastPriceFetched:
      typeof entry.lastPriceFetched === "string" &&
      entry.lastPriceFetched.trim().length > 0
        ? entry.lastPriceFetched.trim()
        : null,
    updatedAt:
      typeof entry.updatedAt === "string" && entry.updatedAt.trim().length > 0
        ? entry.updatedAt.trim()
        : null,
  };
}

function mergePrices(base, incoming) {
  const merged = { ...base };

  for (const [variant, price] of Object.entries(incoming)) {
    merged[variant] = {
      ...(merged[variant] ?? {
        low: null,
        mid: null,
        high: null,
        market: null,
        directLow: null,
      }),
      ...price,
    };
  }

  return merged;
}

function mergeEntries(base, incoming) {
  return {
    id: incoming.id || base.id,
    name: incoming.name || base.name,
    set: incoming.set || base.set,
    setId: incoming.setId || base.setId,
    number: incoming.number || base.number,
    rarity: incoming.rarity ?? base.rarity,
    imageSmall: incoming.imageSmall || base.imageSmall,
    imageLarge: incoming.imageLarge || base.imageLarge || incoming.imageSmall,
    prices: mergePrices(base.prices, incoming.prices),
    tcgplayerUrl: incoming.tcgplayerUrl ?? base.tcgplayerUrl,
    lastPriceFetched: incoming.lastPriceFetched ?? base.lastPriceFetched,
    updatedAt: incoming.updatedAt ?? base.updatedAt,
  };
}

async function loadExistingEntries(outputPath) {
  try {
    const parsed = JSON.parse(await readFile(outputPath, "utf8"));
    const entries = Array.isArray(parsed) ? parsed : parsed.entries ?? [];

    return entries.flatMap((entry) => {
      const sanitized = sanitizeEntry(entry);
      return sanitized ? [sanitized] : [];
    });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(`Failed to read existing card catalog at ${outputPath}:`, error);
    }
    return [];
  }
}

async function scanStoredCards(documentClient, tableName) {
  const byId = new Map();
  let exclusiveStartKey;

  do {
    const response = await documentClient.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression:
          "pk, sk, #name, #set, setId, #number, rarity, imageSmall, imageLarge, tcgplayerUrl, data, lastPriceFetched, updatedAt",
        ExpressionAttributeNames: {
          "#name": "name",
          "#set": "set",
          "#number": "number",
        },
        FilterExpression:
          "begins_with(pk, :cardPrefix) AND (sk = :meta OR sk = :prices)",
        ExpressionAttributeValues: {
          ":cardPrefix": "CARD#",
          ":meta": "META",
          ":prices": "TCG_PRICES",
        },
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    for (const item of response.Items ?? []) {
      const pk = typeof item.pk === "string" ? item.pk : "";
      const sk = typeof item.sk === "string" ? item.sk : "";
      const cardId = pk.replace(/^CARD#/, "");

      if (!cardId || !sk) {
        continue;
      }

      const current = byId.get(cardId) ?? {};

      if (sk === "META") {
        current.meta = {
          id: cardId,
          name: typeof item.name === "string" ? item.name : "",
          set: typeof item.set === "string" ? item.set : "",
          setId: typeof item.setId === "string" ? item.setId : "",
          number: typeof item.number === "string" ? item.number : "",
          rarity: typeof item.rarity === "string" ? item.rarity : null,
          imageSmall: typeof item.imageSmall === "string" ? item.imageSmall : "",
          imageLarge: typeof item.imageLarge === "string" ? item.imageLarge : "",
          tcgplayerUrl:
            typeof item.tcgplayerUrl === "string" ? item.tcgplayerUrl : null,
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null,
        };
      } else if (sk === "TCG_PRICES") {
        try {
          current.prices = sanitizePrices(
            typeof item.data === "string" ? JSON.parse(item.data) : item.data
          );
        } catch (error) {
          console.warn(`Failed to parse prices for ${cardId}:`, error);
          current.prices = {};
        }

        current.lastPriceFetched =
          typeof item.lastPriceFetched === "string" ? item.lastPriceFetched : null;
      }

      byId.set(cardId, current);
    }

    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return [...byId.values()].flatMap((entry) => {
    const sanitized = sanitizeEntry({
      ...entry.meta,
      prices: entry.prices ?? {},
      lastPriceFetched: entry.lastPriceFetched ?? null,
    });

    return sanitized ? [sanitized] : [];
  });
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    return (
      left.name.localeCompare(right.name) ||
      left.set.localeCompare(right.set) ||
      left.number.localeCompare(right.number) ||
      left.id.localeCompare(right.id)
    );
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tableName = process.env.DYNAMODB_TABLE?.trim();

  if (!tableName) {
    throw new Error("DYNAMODB_TABLE is required to backfill the local card catalog");
  }

  const rawClient = new DynamoDBClient({
    region: process.env.AWS_REGION || "us-east-1",
  });
  const documentClient = DynamoDBDocumentClient.from(rawClient, {
    marshallOptions: { removeUndefinedValues: true },
  });

  const [existingEntries, scannedEntries] = await Promise.all([
    args.replace ? Promise.resolve([]) : loadExistingEntries(args.output),
    scanStoredCards(documentClient, tableName),
  ]);

  const merged = new Map(existingEntries.map((entry) => [entry.id, entry]));
  for (const entry of scannedEntries) {
    const existing = merged.get(entry.id);
    merged.set(entry.id, existing ? mergeEntries(existing, entry) : entry);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: "dynamodb-card-cache",
    entries: sortEntries([...merged.values()]),
  };

  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    `Wrote ${output.entries.length} card catalog entries to ${path.relative(process.cwd(), args.output)}`
  );
}

main().catch((error) => {
  console.error("backfill-card-catalog.mjs failed:", error);
  process.exitCode = 1;
});
