import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { CardPrices, CardSearchResult } from "@/lib/types/card";
import { getDynamo, getTableName } from "./dynamo";

export interface CardCatalogEntry extends CardSearchResult {
  lastPriceFetched: string | null;
  catalogSource: "bundled" | "dynamodb" | "runtime";
  updatedAt: string | null;
}

interface BundledCardCatalogFile {
  generatedAt?: string;
  entries?: unknown[];
}

interface StoredCardCatalogAccumulator {
  meta?: Partial<CardCatalogEntry>;
  prices?: CardPrices;
  lastPriceFetched?: string | null;
}

const CARD_CATALOG_PATH = path.join(
  process.cwd(),
  "src/lib/data/cards/card-catalog.json"
);

let bundledCatalogCache: CardCatalogEntry[] | null = null;
let storedCatalogCache: CardCatalogEntry[] | null = null;
let mergedCatalogCache: CardCatalogEntry[] | null = null;

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeCardPrices(value: unknown): CardPrices {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<CardPrices>(
    (acc, [variant, rawVariant]) => {
      if (!variant || !rawVariant || typeof rawVariant !== "object") {
        return acc;
      }

      const candidate = rawVariant as Record<string, unknown>;
      acc[variant] = {
        low: asFiniteNumber(candidate.low),
        mid: asFiniteNumber(candidate.mid),
        high: asFiniteNumber(candidate.high),
        market: asFiniteNumber(candidate.market),
        directLow: asFiniteNumber(candidate.directLow),
      };

      return acc;
    },
    {}
  );
}

function sanitizeCardCatalogEntry(
  value: unknown,
  catalogSource: CardCatalogEntry["catalogSource"]
): CardCatalogEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const set = typeof candidate.set === "string" ? candidate.set.trim() : "";
  const imageSmall =
    typeof candidate.imageSmall === "string" ? candidate.imageSmall.trim() : "";
  const imageLarge =
    typeof candidate.imageLarge === "string" && candidate.imageLarge.trim().length > 0
      ? candidate.imageLarge.trim()
      : imageSmall;

  if (!id || !name || !set) {
    return null;
  }

  return {
    id,
    pokedataId:
      typeof candidate.pokedataId === "string" && candidate.pokedataId.trim().length > 0
        ? candidate.pokedataId.trim()
        : null,
    name,
    set,
    setId: typeof candidate.setId === "string" ? candidate.setId.trim() : "",
    number: typeof candidate.number === "string" ? candidate.number.trim() : "",
    rarity:
      typeof candidate.rarity === "string" && candidate.rarity.trim().length > 0
        ? candidate.rarity.trim()
        : null,
    imageSmall,
    imageLarge,
    prices: sanitizeCardPrices(candidate.prices),
    tcgplayerUrl:
      typeof candidate.tcgplayerUrl === "string" &&
      candidate.tcgplayerUrl.trim().length > 0
        ? candidate.tcgplayerUrl.trim()
        : null,
    lastPriceFetched:
      typeof candidate.lastPriceFetched === "string" &&
      candidate.lastPriceFetched.trim().length > 0
        ? candidate.lastPriceFetched.trim()
        : null,
    catalogSource,
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt.trim().length > 0
        ? candidate.updatedAt.trim()
        : null,
  };
}

function loadBundledCardCatalog(): CardCatalogEntry[] {
  if (bundledCatalogCache) {
    return bundledCatalogCache;
  }

  try {
    const parsed = JSON.parse(readFileSync(CARD_CATALOG_PATH, "utf8")) as
      | unknown[]
      | BundledCardCatalogFile;
    const entries = Array.isArray(parsed) ? parsed : parsed.entries ?? [];

    bundledCatalogCache = entries.flatMap((entry) => {
      const sanitized = sanitizeCardCatalogEntry(entry, "bundled");
      return sanitized ? [sanitized] : [];
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Failed to load bundled card catalog:", error);
    }
    bundledCatalogCache = [];
  }

  return bundledCatalogCache;
}

function mergeCardPrices(base: CardPrices, incoming: CardPrices): CardPrices {
  const merged: CardPrices = { ...base };

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

function mergeCatalogEntries(
  base: CardCatalogEntry,
  incoming: CardCatalogEntry
): CardCatalogEntry {
  return {
    id: incoming.id || base.id,
    pokedataId: incoming.pokedataId ?? base.pokedataId ?? null,
    name: incoming.name || base.name,
    set: incoming.set || base.set,
    setId: incoming.setId || base.setId,
    number: incoming.number || base.number,
    rarity: incoming.rarity ?? base.rarity,
    imageSmall: incoming.imageSmall || base.imageSmall,
    imageLarge: incoming.imageLarge || base.imageLarge || incoming.imageSmall,
    prices: mergeCardPrices(base.prices, incoming.prices),
    tcgplayerUrl: incoming.tcgplayerUrl ?? base.tcgplayerUrl,
    lastPriceFetched: incoming.lastPriceFetched ?? base.lastPriceFetched,
    catalogSource: incoming.catalogSource,
    updatedAt: incoming.updatedAt ?? base.updatedAt,
  };
}

function dedupeCatalog(entries: CardCatalogEntry[]): CardCatalogEntry[] {
  const merged = new Map<string, CardCatalogEntry>();

  for (const entry of entries) {
    const existing = merged.get(entry.id);
    merged.set(entry.id, existing ? mergeCatalogEntries(existing, entry) : entry);
  }

  return [...merged.values()];
}

async function loadStoredCardCatalog(): Promise<CardCatalogEntry[]> {
  if (storedCatalogCache) {
    return storedCatalogCache;
  }

  const dynamo = getDynamo();
  const table = getTableName();
  if (!dynamo || !table) {
    storedCatalogCache = [];
    return storedCatalogCache;
  }

  const byCardId = new Map<string, StoredCardCatalogAccumulator>();
  let exclusiveStartKey: Record<string, unknown> | undefined;

  try {
    do {
      const response = await dynamo.send(
        new ScanCommand({
          TableName: table,
          ProjectionExpression:
            "pk, sk, #name, #set, setId, #number, rarity, imageSmall, imageLarge, tcgplayerUrl, pokedataId, data, lastPriceFetched, updatedAt",
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

      for (const item of (response.Items as Record<string, unknown>[] | undefined) ?? []) {
        const pk = typeof item.pk === "string" ? item.pk : "";
        const sk = typeof item.sk === "string" ? item.sk : "";
        const cardId = pk.replace(/^CARD#/, "");

        if (!cardId || !sk) {
          continue;
        }

        const current = byCardId.get(cardId) ?? {};

        if (sk === "META") {
          current.meta = {
            id: cardId,
            pokedataId:
              typeof item.pokedataId === "string" ? item.pokedataId : null,
            name: typeof item.name === "string" ? item.name : "",
            set: typeof item.set === "string" ? item.set : "",
            setId: typeof item.setId === "string" ? item.setId : "",
            number: typeof item.number === "string" ? item.number : "",
            rarity: typeof item.rarity === "string" ? item.rarity : null,
            imageSmall:
              typeof item.imageSmall === "string" ? item.imageSmall : "",
            imageLarge:
              typeof item.imageLarge === "string" ? item.imageLarge : "",
            tcgplayerUrl:
              typeof item.tcgplayerUrl === "string" ? item.tcgplayerUrl : null,
            updatedAt:
              typeof item.updatedAt === "string" ? item.updatedAt : null,
          };
        } else if (sk === "TCG_PRICES") {
          try {
            current.prices = sanitizeCardPrices(
              typeof item.data === "string" ? JSON.parse(item.data) : item.data
            );
          } catch (error) {
            console.warn("Failed to parse stored card prices:", error);
            current.prices = {};
          }

          current.lastPriceFetched =
            typeof item.lastPriceFetched === "string" ? item.lastPriceFetched : null;
        }

        byCardId.set(cardId, current);
      }

      exclusiveStartKey = response.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);
  } catch (error) {
    console.warn("DynamoDB card catalog scan failed, using local fallback:", error);
    storedCatalogCache = [];
    return storedCatalogCache;
  }

  storedCatalogCache = [...byCardId.values()].flatMap((entry) => {
    if (!entry.meta?.id || !entry.meta.name || !entry.meta.set) {
      return [];
    }

    const sanitized = sanitizeCardCatalogEntry(
      {
        ...entry.meta,
        prices: entry.prices ?? {},
        lastPriceFetched: entry.lastPriceFetched ?? null,
      },
      "dynamodb"
    );

    return sanitized ? [sanitized] : [];
  });

  return storedCatalogCache;
}

export async function loadCardCatalog(): Promise<CardCatalogEntry[]> {
  if (mergedCatalogCache) {
    return mergedCatalogCache;
  }

  const bundledCatalog = loadBundledCardCatalog();
  const storedCatalog = await loadStoredCardCatalog();

  mergedCatalogCache = dedupeCatalog([...bundledCatalog, ...storedCatalog]);
  return mergedCatalogCache;
}

export function warmCardCatalog(cards: CardSearchResult[]): void {
  if (cards.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const warmedEntries = cards.flatMap((card) => {
    const sanitized = sanitizeCardCatalogEntry(
      {
        ...card,
        lastPriceFetched: now,
        updatedAt: now,
      },
      "runtime"
    );

    return sanitized ? [sanitized] : [];
  });

  if (warmedEntries.length === 0) {
    return;
  }

  storedCatalogCache = dedupeCatalog([...(storedCatalogCache ?? []), ...warmedEntries]);
  mergedCatalogCache = dedupeCatalog([
    ...(mergedCatalogCache ?? loadBundledCardCatalog()),
    ...warmedEntries,
  ]);
}
