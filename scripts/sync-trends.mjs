import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const require = createRequire(import.meta.url);
const googleTrends = require("google-trends-api");

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const TABLE_NAME = process.env.DYNAMODB_TABLE || "";
const MAX_KEYWORDS = 100;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function computePopularityScore(current, average) {
  if (average <= 0) return 50;
  const momentum = current / average;
  const momentumScore = clamp(momentum * 50, 10, 90);
  const score = current * 0.6 + momentumScore * 0.4;
  return clamp(Math.round(score), 5, 95);
}

function normalizeTrendKeyword(keyword) {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildTrendKeyword(name) {
  const cleaned = name.replace(/\b(Pokemon Center|Pokémon Center)\b/gi, "").trim();
  if (!/pokemon|pokémon/i.test(cleaned)) {
    return `Pokemon ${cleaned}`;
  }
  return cleaned;
}

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function loadTrendKeywords() {
  const baseDir = path.join(process.cwd(), "src/lib/data/sealed-ml");
  const keywords = [];

  const productsPath = path.join(baseDir, "products.json");
  if (existsSync(productsPath)) {
    const products = loadJson(productsPath);
    for (const product of products) {
      if (typeof product?.name === "string" && product.name.trim()) {
        keywords.push(buildTrendKeyword(product.name.trim()));
      }
    }
  }

  const expansionPath = path.join(baseDir, "products-expansion.json");
  if (existsSync(expansionPath)) {
    const expansion = loadJson(expansionPath);
    const entries = Array.isArray(expansion) ? expansion : expansion?.entries ?? [];
    for (const product of entries) {
      if (typeof product?.name === "string" && product.name.trim()) {
        keywords.push(buildTrendKeyword(product.name.trim()));
      }
    }
  }

  return [...new Set(keywords.map(normalizeTrendKeyword))]
    .slice(0, MAX_KEYWORDS)
    .map((keyword) => keyword.replace(/\bpokemon\b/i, "Pokemon"));
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    keyword: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token === "--keyword") {
      const value = argv[index + 1]?.trim();
      if (value) {
        args.keyword = value;
      }
      index += 1;
    }
  }

  return args;
}

function createClient() {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: AWS_REGION }),
    { marshallOptions: { removeUndefinedValues: true } }
  );
}

async function fetchTrendSnapshot(keyword) {
  const result = await googleTrends.interestOverTime({
    keyword,
    startTime: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    geo: "US",
  });

  const data = JSON.parse(result);
  const timeline = data?.default?.timelineData;

  if (!timeline || timeline.length === 0) {
    return {
      keyword,
      current: 0,
      average: 0,
      trendDirection: "stable",
      popularityScore: 50,
      capturedAt: new Date().toISOString(),
      source: "neutral-fallback",
    };
  }

  const values = timeline.map((point) => point.value[0]);
  const current = values[values.length - 1];
  const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  const trendDirection =
    current > average * 1.2
      ? "rising"
      : current < average * 0.8
        ? "declining"
        : "stable";

  return {
    keyword,
    current,
    average,
    trendDirection,
    popularityScore: computePopularityScore(current, average),
    capturedAt: new Date().toISOString(),
    source: "google-trends-api",
  };
}

async function putTrendSnapshot(client, snapshot) {
  const normalizedKeyword = normalizeTrendKeyword(snapshot.keyword);
  const snapshotDate = snapshot.capturedAt.slice(0, 10);

  await Promise.all([
    client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `TREND#${normalizedKeyword}`,
          sk: "LATEST",
          ...snapshot,
        },
      })
    ),
    client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `TREND#${normalizedKeyword}`,
          sk: `SNAPSHOT#${snapshotDate}`,
          ...snapshot,
        },
      })
    ),
  ]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!TABLE_NAME && !args.dryRun) {
    throw new Error("DYNAMODB_TABLE is required unless --dry-run is used");
  }

  const keywords = args.keyword ? [buildTrendKeyword(args.keyword)] : loadTrendKeywords();
  const client = args.dryRun ? null : createClient();

  const summary = {
    keywordCount: keywords.length,
    stored: 0,
    failed: 0,
    dryRun: args.dryRun,
  };

  for (const keyword of keywords) {
    try {
      const snapshot = await fetchTrendSnapshot(keyword);
      if (client) {
        await putTrendSnapshot(client, snapshot);
      }
      summary.stored += 1;
      console.log(`Synced trend snapshot for ${keyword}`);
    } catch (error) {
      summary.failed += 1;
      console.warn(`Failed trend snapshot for ${keyword}:`, error);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
