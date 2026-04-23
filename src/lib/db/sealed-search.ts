import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import coreCatalog from "@/lib/data/sealed-ml/products.json";
import { SEALED_SETS } from "@/lib/data/sealed-sets";
import { pickProductImageUrl } from "@/lib/domain/sealed-image";
import type { ProductType } from "@/lib/types/sealed";
import { getDynamo, getTableName } from "./dynamo";

export const LOCAL_SEALED_PRODUCT_PREFIX = "local-sealed:";

export interface SealedSearchCatalogEntry {
  pokedataId: string;
  name: string;
  releaseDate: string | null;
  imageUrl: string | null;
  currentPrice: number | null;
  priceChartingId?: string;
}

interface ReviewedCatalogEntry {
  setId: string;
  name: string;
  productType: ProductType;
  releaseDate?: string | null;
  priceChartingId?: string | null;
}

interface ReviewedExpansionCatalog {
  entries?: ReviewedCatalogEntry[];
}

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  "Booster Box": "Booster Box",
  ETB: "Elite Trainer Box",
  "Booster Bundle": "Booster Bundle",
  UPC: "Ultra Premium Collection",
  "Special Collection": "Special Collection",
  Case: "Case",
  "Booster Pack": "Booster Pack",
  Tin: "Tin",
  "Collection Box": "Collection Box",
  Unknown: "",
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/&/g, "and")
    .toLowerCase()
    .trim();
}

function buildLocalProductName(name: string, productType: ProductType): string {
  const suffix = PRODUCT_TYPE_LABELS[productType];
  if (!suffix) {
    return name;
  }

  if (normalize(name).includes(normalize(suffix))) {
    return name;
  }

  return `${name} ${suffix}`;
}

function loadOptionalExpansionCatalog(): ReviewedCatalogEntry[] {
  const filePath = path.join(
    process.cwd(),
    "src/lib/data/sealed-ml/products-expansion.json"
  );

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as
      | ReviewedCatalogEntry[]
      | ReviewedExpansionCatalog;

    if (Array.isArray(parsed)) {
      return parsed;
    }

    return parsed.entries ?? [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Failed to load optional sealed expansion catalog:", error);
    }
    return [];
  }
}

function buildReviewedCatalogBySetId(): Map<string, ReviewedCatalogEntry> {
  const expansionEntries = loadOptionalExpansionCatalog();
  const entries = [
    ...(coreCatalog as ReviewedCatalogEntry[]),
    ...expansionEntries,
  ];

  return new Map(entries.map((entry) => [entry.setId, entry]));
}

const reviewedCatalogBySetId = buildReviewedCatalogBySetId();

const localCatalog = SEALED_SETS.map((set) => {
  const reviewedEntry = reviewedCatalogBySetId.get(set.id);
  const releaseDate =
    reviewedEntry?.releaseDate ??
    (Number.isFinite(set.releaseYear) ? `${set.releaseYear}-01-01` : null);
  const name = buildLocalProductName(
    reviewedEntry?.name ?? set.name,
    reviewedEntry?.productType ?? set.productType
  );

  return {
    pokedataId: `${LOCAL_SEALED_PRODUCT_PREFIX}${set.id}`,
    name,
    releaseDate,
    imageUrl: pickProductImageUrl(set.imageUrl),
    currentPrice:
      typeof set.currentPrice === "number" && Number.isFinite(set.currentPrice)
        ? set.currentPrice
        : null,
    priceChartingId:
      reviewedEntry?.priceChartingId?.trim() || set.priceChartingId || undefined,
  } satisfies SealedSearchCatalogEntry;
});

let storedCatalogCache: SealedSearchCatalogEntry[] | null = null;

async function loadStoredCatalog(): Promise<SealedSearchCatalogEntry[]> {
  if (storedCatalogCache) {
    return storedCatalogCache;
  }

  const dynamo = getDynamo();
  const table = getTableName();
  if (!dynamo || !table) {
    return [];
  }

  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  try {
    do {
      const response = await dynamo.send(
        new ScanCommand({
          TableName: table,
          ProjectionExpression:
            "pk, sk, #name, releaseDate, imgUrl, priceChartingId, #language",
          ExpressionAttributeNames: {
            "#name": "name",
            "#language": "language",
          },
          FilterExpression:
            "sk = :meta AND begins_with(pk, :productPrefix) AND (attribute_not_exists(#language) OR #language = :english)",
          ExpressionAttributeValues: {
            ":meta": "META",
            ":productPrefix": "PRODUCT#",
            ":english": "ENGLISH",
          },
          ExclusiveStartKey: exclusiveStartKey,
        })
      );

      items.push(...((response.Items as Record<string, unknown>[] | undefined) ?? []));
      exclusiveStartKey = response.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);
  } catch (error) {
    console.warn("DynamoDB sealed search catalog scan failed, using local fallback:", error);
    return [];
  }

  storedCatalogCache = items.flatMap((item) => {
    const pk = typeof item.pk === "string" ? item.pk : "";
    const pokedataId = pk.replace(/^PRODUCT#/, "");
    const name = typeof item.name === "string" ? item.name.trim() : "";

    if (!pokedataId || !name) {
      return [];
    }

    return [
      {
        pokedataId,
        name,
        releaseDate:
          typeof item.releaseDate === "string" ? item.releaseDate : null,
        imageUrl: pickProductImageUrl(
          typeof item.imgUrl === "string" ? item.imgUrl : null
        ),
        currentPrice: null,
        priceChartingId:
          typeof item.priceChartingId === "string" &&
          item.priceChartingId.trim().length > 0
            ? item.priceChartingId.trim()
            : undefined,
      } satisfies SealedSearchCatalogEntry,
    ];
  });

  return storedCatalogCache;
}

export async function loadSealedSearchCatalog(): Promise<SealedSearchCatalogEntry[]> {
  const storedCatalog = await loadStoredCatalog();
  return storedCatalog.length > 0 ? storedCatalog : localCatalog;
}

export function isLocalSealedProductId(id: string): boolean {
  return id.startsWith(LOCAL_SEALED_PRODUCT_PREFIX);
}

export function getLocalSealedCatalogEntry(
  id: string
): SealedSearchCatalogEntry | null {
  return localCatalog.find((entry) => entry.pokedataId === id) ?? null;
}
