import type { ProductType } from "@/lib/types/sealed";

export const LOCAL_SEALED_PRODUCT_PREFIX = "local-sealed:";

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

const PRODUCT_TYPE_SEARCH_ALIASES: Record<ProductType, readonly string[]> = {
  "Booster Box": ["booster box", "bb"],
  ETB: ["elite trainer box", "etb"],
  "Booster Bundle": ["booster bundle", "bundle"],
  UPC: ["ultra premium collection", "upc"],
  "Special Collection": ["special collection"],
  Case: ["case"],
  "Booster Pack": ["booster pack", "pack", "blister"],
  Tin: ["tin"],
  "Collection Box": ["collection box"],
  Unknown: [],
};

const PRODUCT_TYPES: ProductType[] = [
  "Booster Box",
  "ETB",
  "Booster Bundle",
  "UPC",
  "Special Collection",
  "Case",
  "Booster Pack",
  "Tin",
  "Collection Box",
  "Unknown",
];

function slugify(value: string): string {
  return (
    normalizeSealedSearchText(value)
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "") || "sealed-product"
  );
}

export function normalizeSealedSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function coerceProductType(
  value: string | null | undefined
): ProductType {
  return PRODUCT_TYPES.find((productType) => productType === value) ?? "Unknown";
}

export function buildSealedCatalogKey(
  name: string,
  productType: ProductType
): string {
  return `${normalizeSealedSearchText(name)}|${normalizeSealedSearchText(productType)}`;
}

export function buildSealedCatalogId(input: {
  setId?: string | null;
  name: string;
  productType: ProductType;
}): string {
  if (input.setId?.trim()) {
    return input.setId.trim();
  }

  return slugify(`${input.name} ${input.productType}`);
}

export function buildLocalSealedRuntimeId(catalogId: string): string {
  return `${LOCAL_SEALED_PRODUCT_PREFIX}${catalogId.trim()}`;
}

export function isLocalSealedRuntimeId(id: string): boolean {
  return id.startsWith(LOCAL_SEALED_PRODUCT_PREFIX);
}

export function buildSealedDisplayName(
  name: string,
  productType: ProductType
): string {
  const suffix = PRODUCT_TYPE_LABELS[productType];
  if (!suffix) {
    return name.trim();
  }

  const normalizedName = normalizeSealedSearchText(name);
  const normalizedSuffix = normalizeSealedSearchText(suffix);
  if (normalizedName.includes(normalizedSuffix)) {
    return name.trim();
  }

  return `${name.trim()} ${suffix}`.trim();
}

export function buildSealedSearchAliases(input: {
  name: string;
  productType: ProductType;
  displayName?: string | null;
}): string[] {
  const name = input.name.trim();
  const displayName =
    input.displayName?.trim() || buildSealedDisplayName(name, input.productType);
  const aliases = new Set<string>();

  const addAlias = (value: string | null | undefined) => {
    const normalized = normalizeSealedSearchText(value ?? "");
    if (normalized) {
      aliases.add(normalized);
    }
  };
  const combineAlias = (left: string, right: string): string => {
    const normalizedLeft = normalizeSealedSearchText(left);
    const normalizedRight = normalizeSealedSearchText(right);
    if (!normalizedRight || normalizedLeft.includes(normalizedRight)) {
      return left;
    }
    return `${left} ${right}`;
  };

  addAlias(name);
  addAlias(displayName);

  for (const variant of PRODUCT_TYPE_SEARCH_ALIASES[input.productType]) {
    addAlias(combineAlias(name, variant));
    addAlias(combineAlias(displayName, variant));
    addAlias(`${variant} ${name}`);
  }

  return Array.from(aliases);
}

export function buildSealedSearchText(searchAliases: readonly string[]): string {
  return searchAliases.join(" | ");
}
