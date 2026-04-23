import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const POKEDATA_BASE = "https://www.pokedata.io/v0";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const TABLE_NAME = process.env.DYNAMODB_TABLE || "";
const API_KEY = (process.env.POKEDATA_API_KEY || "").trim();

function parseArgs(argv) {
  const args = {
    limit: null,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token === "--limit") {
      const value = Number.parseInt(argv[index + 1] || "", 10);
      if (Number.isFinite(value) && value > 0) {
        args.limit = value;
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

function normalizePrice(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function calculatePsa10Probability(population) {
  const psaGrades = Object.entries(population)
    .filter(
      ([key, count]) =>
        key.startsWith("PSA ") && typeof count === "number" && count > 0
    )
    .map(([key, count]) => ({
      grade: Number.parseFloat(key.replace("PSA ", "")),
      count,
    }));

  if (psaGrades.length === 0) return null;

  const total = psaGrades.reduce((sum, grade) => sum + grade.count, 0);
  if (total < 10) return null;

  const psa10Count = psaGrades.find((grade) => grade.grade === 10)?.count ?? 0;
  return Math.round((psa10Count / total) * 100);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`PokeData request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function scanMappedCards(client, limit) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const response = await client.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: "pk, #sk, #name, pokedataId, #set, #number",
        ExpressionAttributeNames: {
          "#sk": "sk",
          "#name": "name",
          "#set": "set",
          "#number": "number",
        },
        FilterExpression:
          "begins_with(pk, :cardPrefix) AND #sk = :meta AND attribute_exists(pokedataId)",
        ExpressionAttributeValues: {
          ":cardPrefix": "CARD#",
          ":meta": "META",
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    items.push(...(response.Items || []));
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey && (!limit || items.length < limit));

  return limit ? items.slice(0, limit) : items;
}

function buildGradePayload(cardMeta, pricingPayload, populationPayload, fetchedAt) {
  const pricing = pricingPayload?.pricing || {};
  const gradedPrices = {};
  for (const [key, value] of Object.entries(pricing)) {
    const normalized = normalizePrice(value?.value);
    if (normalized) {
      gradedPrices[key] = normalized;
    }
  }

  const population = {};
  const rawPopulation = populationPayload?.population || {};
  for (const [key, value] of Object.entries(rawPopulation)) {
    const count = typeof value?.count === "number" ? value.count : null;
    if (count && count > 0) {
      population[key] = count;
    }
  }

  return {
    pokedataId: String(cardMeta.pokedataId),
    rawPrice: gradedPrices["Pokedata Raw"] ?? gradedPrices["TCGPlayer"] ?? null,
    tcgplayerPrice: gradedPrices["TCGPlayer"] ?? null,
    ebayRawPrice: gradedPrices["eBay Raw"] ?? null,
    gradedPrices,
    population,
    psa10Probability: calculatePsa10Probability(population),
    lastGradeFetched: fetchedAt,
  };
}

async function persistGradePayload(client, cardId, payload, fetchedAt) {
  const snapshotDate = fetchedAt.slice(0, 10);

  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `CARD#${cardId}`,
        sk: "GRADE_DATA",
        data: JSON.stringify(payload),
        lastGradeFetched: payload.lastGradeFetched,
        source: "pokedata-backfill",
      },
    })
  );

  await client.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `CARD#${cardId}`,
        sk: `GRADE_SNAPSHOT#${snapshotDate}`,
        data: JSON.stringify(payload),
        capturedAt: fetchedAt,
        source: "pokedata-backfill",
      },
    })
  );
}

async function main() {
  if (!TABLE_NAME) {
    throw new Error("DYNAMODB_TABLE is required");
  }
  if (!API_KEY) {
    throw new Error("POKEDATA_API_KEY is required");
  }

  const args = parseArgs(process.argv.slice(2));
  const client = createClient();
  const cards = await scanMappedCards(client, args.limit);

  console.log(`Found ${cards.length} mapped cards with PokeData IDs`);

  let successCount = 0;
  let failureCount = 0;

  for (const card of cards) {
    const cardId = String(card.pk || "").replace(/^CARD#/, "");
    const fetchedAt = new Date().toISOString();

    try {
      const [pricingPayload, populationPayload] = await Promise.all([
        fetchJson(`${POKEDATA_BASE}/pricing?id=${card.pokedataId}&asset_type=CARD`),
        fetchJson(`${POKEDATA_BASE}/population?id=${card.pokedataId}&asset_type=CARD`),
      ]);

      const payload = buildGradePayload(
        card,
        pricingPayload,
        populationPayload,
        fetchedAt
      );
      if (!args.dryRun) {
        await persistGradePayload(client, cardId, payload, fetchedAt);
      }

      successCount += 1;
      console.log(`Backfilled grade cache for ${cardId} (${card.name || "unknown"})`);
    } catch (error) {
      failureCount += 1;
      console.warn(`Failed grade backfill for ${cardId}:`, error);
    }
  }

  console.log(
    JSON.stringify(
      {
        scannedCards: cards.length,
        successCount,
        failureCount,
        dryRun: args.dryRun,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
