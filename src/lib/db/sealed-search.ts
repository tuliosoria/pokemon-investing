import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import searchCatalog from "@/lib/data/sealed-ml/sealed-search-catalog.json";
import reviewCatalog from "@/lib/data/sealed-ml/sealed-catalog-review.json";
import { SEALED_SETS } from "@/lib/data/sealed-sets";
import {
  buildLocalSealedRuntimeId,
  buildSealedCatalogId,
  buildSealedCatalogKey,
  buildSealedDisplayName,
  buildSealedSearchAliases,
  buildSealedSearchText,
  coerceProductType,
  isLocalSealedRuntimeId,
} from "@/lib/domain/sealed-catalog-search";
import { pickProductImageUrl } from "@/lib/domain/sealed-image";
import type { ProductType } from "@/lib/types/sealed";
import { getDynamo, getTableName } from "./dynamo";

export { LOCAL_SEALED_PRODUCT_PREFIX } from "@/lib/domain/sealed-catalog-search";

export interface SealedSearchCatalogEntry {
  pokedataId: string;
  catalogId: string;
  catalogKey: string;
  name: string;
  releaseDate: string | null;
  imageUrl: string | null;
  currentPrice: number | null;
  priceChartingId?: string;
  productType: ProductType;
  searchAliases: string[];
  searchText: string;
}

interface OwnedSearchCatalogArtifactEntry {
  catalogId: string;
  catalogKey: string;
  runtimeId: string;
  setId?: string;
  name: string;
  displayName: string;
  productType: ProductType;
  releaseDate?: string | null;
  imageUrl?: string | null;
  pokedataId?: string | null;
  priceChartingId?: string | null;
  searchAliases?: string[];
  searchText?: string;
}

interface ReviewedCatalogEntry {
  catalogId?: string | null;
  setId: string;
  name: string;
  productType: ProductType;
  releaseDate?: string | null;
  imageUrl?: string | null;
  priceChartingId?: string | null;
  pokedataId?: string | null;
}

interface ReviewedExpansionCatalog {
  entries?: ReviewedCatalogEntry[];
}

interface ReviewCatalogEntry {
  normalizedKey?: string;
  name?: string;
  productType?: ProductType;
}

interface ReviewCatalogPayload {
  rejected?: ReviewCatalogEntry[];
}

const sealedSetById = new Map(SEALED_SETS.map((set) => [set.id, set]));
const rejectedExpansionKeys = new Set(
  ((reviewCatalog as ReviewCatalogPayload).rejected ?? []).flatMap((entry) => {
    if (entry.normalizedKey?.trim()) {
      return [entry.normalizedKey.trim()];
    }

    if (entry.name?.trim() && entry.productType) {
      return [buildSealedCatalogKey(entry.name.trim(), entry.productType)];
    }

    return [];
  })
);

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
      return parsed.filter(
        (entry) =>
          !rejectedExpansionKeys.has(
            buildSealedCatalogKey(entry.name, entry.productType)
          )
      );
    }

    return (parsed.entries ?? []).filter(
      (entry) =>
        !rejectedExpansionKeys.has(
          buildSealedCatalogKey(entry.name, entry.productType)
        )
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Failed to load optional sealed expansion catalog:", error);
    }
    return [];
  }
}

function buildBundledCatalogEntry(input: {
  catalogId?: string | null;
  setId?: string | null;
  runtimeId?: string | null;
  name: string;
  displayName?: string | null;
  productType: ProductType;
  releaseDate?: string | null;
  imageUrl?: string | null;
  priceChartingId?: string | null;
  searchAliases?: string[] | null;
  searchText?: string | null;
}): SealedSearchCatalogEntry {
  const catalogId = buildSealedCatalogId({
    setId: input.catalogId ?? input.setId,
    name: input.name,
    productType: input.productType,
  });
  const displayName =
    input.displayName?.trim() ||
    buildSealedDisplayName(input.name, input.productType);
  const searchAliases =
    input.searchAliases && input.searchAliases.length > 0
      ? input.searchAliases
      : input.displayName && input.displayName.trim()
        ? buildSealedSearchAliases({
            name: input.name,
            productType: input.productType,
            displayName: input.displayName,
          })
        : buildSealedSearchAliases({
            name: input.name,
            productType: input.productType,
          });
  const setData = sealedSetById.get(input.setId ?? catalogId);

  return {
    pokedataId: input.runtimeId?.trim() || buildLocalSealedRuntimeId(catalogId),
    catalogId,
    catalogKey: buildSealedCatalogKey(input.name, input.productType),
    name: displayName,
    releaseDate:
      input.releaseDate ??
      (Number.isFinite(setData?.releaseYear) ? `${setData?.releaseYear}-01-01` : null),
    imageUrl: pickProductImageUrl(input.imageUrl ?? null, setData?.imageUrl),
    currentPrice:
      typeof setData?.currentPrice === "number" && Number.isFinite(setData.currentPrice)
        ? setData.currentPrice
        : null,
    priceChartingId:
      input.priceChartingId?.trim() || setData?.priceChartingId || undefined,
    productType: input.productType,
    searchAliases,
    searchText: input.searchText?.trim() || buildSealedSearchText(searchAliases),
  };
}

function mergeCatalogEntries(
  base: SealedSearchCatalogEntry,
  incoming: SealedSearchCatalogEntry
): SealedSearchCatalogEntry {
  const searchAliases = Array.from(
    new Set([
      ...incoming.searchAliases.filter(Boolean),
      ...base.searchAliases.filter(Boolean),
    ])
  );

  return {
    ...base,
    ...incoming,
    pokedataId: incoming.pokedataId || base.pokedataId,
    catalogId: incoming.catalogId || base.catalogId,
    catalogKey: incoming.catalogKey || base.catalogKey,
    name: incoming.name || base.name,
    releaseDate: incoming.releaseDate ?? base.releaseDate,
    imageUrl: incoming.imageUrl ?? base.imageUrl,
    currentPrice: incoming.currentPrice ?? base.currentPrice,
    priceChartingId: incoming.priceChartingId ?? base.priceChartingId,
    productType: incoming.productType || base.productType,
    searchAliases,
    searchText: buildSealedSearchText(searchAliases),
  };
}

function dedupeCatalogEntries(
  entries: readonly SealedSearchCatalogEntry[]
): SealedSearchCatalogEntry[] {
  const mergedByKey = new Map<string, SealedSearchCatalogEntry>();

  for (const entry of entries) {
    const key =
      entry.catalogKey || buildSealedCatalogKey(entry.name, entry.productType);
    const existing = mergedByKey.get(key);
    mergedByKey.set(key, existing ? mergeCatalogEntries(existing, entry) : entry);
  }

  return Array.from(mergedByKey.values());
}

const bundledSearchCatalog = (searchCatalog as OwnedSearchCatalogArtifactEntry[]).map(
  (entry) =>
    buildBundledCatalogEntry({
      catalogId: entry.catalogId,
      setId: entry.setId,
      runtimeId: entry.runtimeId,
      name: entry.name,
      displayName: entry.displayName,
    productType: entry.productType,
    releaseDate: entry.releaseDate ?? null,
    imageUrl: entry.imageUrl ?? null,
    priceChartingId: entry.priceChartingId ?? null,
    searchAliases: entry.searchAliases ?? null,
    searchText: entry.searchText ?? null,
  })
);

const optionalExpansionCatalog = loadOptionalExpansionCatalog().map((entry) =>
  buildBundledCatalogEntry({
    catalogId: entry.catalogId,
    setId: entry.setId,
    name: entry.name,
    productType: entry.productType,
    releaseDate: entry.releaseDate ?? null,
    imageUrl: entry.imageUrl ?? null,
    priceChartingId: entry.priceChartingId ?? null,
  })
);

const localCatalog = dedupeCatalogEntries([
  ...bundledSearchCatalog,
  ...optionalExpansionCatalog,
]);
const localCatalogByRuntimeId = new Map(
  localCatalog.map((entry) => [entry.pokedataId, entry])
);

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
            "pk, sk, #name, productType, releaseDate, imgUrl, priceChartingId, #language, catalogId, catalogKey, catalogDisplayName, catalogProductType, catalogSearchAliases, catalogSearchText",
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
    const displayName =
      typeof item.catalogDisplayName === "string"
        ? item.catalogDisplayName.trim()
        : typeof item.name === "string"
          ? item.name.trim()
          : "";
    const productType = coerceProductType(
      typeof item.catalogProductType === "string"
        ? item.catalogProductType
        : typeof item.productType === "string"
          ? item.productType
          : null
    );
    const releaseDate =
      typeof item.releaseDate === "string" ? item.releaseDate : null;
    const catalogId =
      typeof item.catalogId === "string" && item.catalogId.trim()
        ? item.catalogId.trim()
        : buildSealedCatalogId({
            name: displayName,
            productType,
          });
    const catalogKey =
      typeof item.catalogKey === "string" && item.catalogKey.trim()
        ? item.catalogKey.trim()
        : buildSealedCatalogKey(displayName, productType);

    if (!pokedataId || !displayName) {
      return [];
    }

    const searchAliases = Array.isArray(item.catalogSearchAliases)
      ? item.catalogSearchAliases.flatMap((value) =>
          typeof value === "string" && value.trim() ? [value.trim()] : []
        )
      : buildSealedSearchAliases({
          name: displayName,
          productType,
          displayName,
        });

    return [
      {
        pokedataId,
        catalogId,
        catalogKey,
        name: displayName,
        releaseDate,
        imageUrl: pickProductImageUrl(
          typeof item.imgUrl === "string" ? item.imgUrl : null
        ),
        currentPrice: null,
        priceChartingId:
          typeof item.priceChartingId === "string" &&
          item.priceChartingId.trim().length > 0
            ? item.priceChartingId.trim()
            : undefined,
        productType,
        searchAliases,
        searchText:
          typeof item.catalogSearchText === "string" &&
          item.catalogSearchText.trim().length > 0
            ? item.catalogSearchText.trim()
            : buildSealedSearchText(searchAliases),
      } satisfies SealedSearchCatalogEntry,
    ];
  });

  return storedCatalogCache;
}

export async function loadSealedSearchCatalog(): Promise<SealedSearchCatalogEntry[]> {
  const storedCatalog = await loadStoredCatalog();
  if (storedCatalog.length === 0) {
    return localCatalog;
  }

  return dedupeCatalogEntries([...localCatalog, ...storedCatalog]);
}

export function isLocalSealedProductId(id: string): boolean {
  return isLocalSealedRuntimeId(id);
}

export function getLocalSealedCatalogEntry(
  id: string
): SealedSearchCatalogEntry | null {
  return localCatalogByRuntimeId.get(id) ?? null;
}
