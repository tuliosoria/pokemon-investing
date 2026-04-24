import "server-only";

const PRICECHARTING_BASE_URL = "https://www.pricecharting.com/api/";
const MIN_REQUEST_INTERVAL_MS = 1100;

let lastRequestStartedAt = 0;

export interface PriceChartingProductResponse {
  status?: "success" | "error";
  "error-message"?: string;
  id?: string;
  "product-name"?: string;
  "console-name"?: string;
  "release-date"?: string;
  "loose-price"?: number | string;
  "cib-price"?: number | string;
  "new-price"?: number | string;
  "graded-price"?: number | string;
  "manual-only-price"?: number | string;
  "box-only-price"?: number | string;
  "bgs-10-price"?: number | string;
  "condition-17-price"?: number | string;
  "condition-18-price"?: number | string;
  "sales-volume"?: number | string;
}

export interface PriceChartingProductSummary {
  id?: string;
  "product-name"?: string;
  "console-name"?: string;
  "release-date"?: string;
}

interface PriceChartingProductsResponse {
  status?: "success" | "error";
  "error-message"?: string;
  products?: PriceChartingProductSummary[];
}

function getToken(): string | null {
  const token = process.env.PRICECHARTING_API_TOKEN?.trim();
  return token ? token : null;
}

function parsePennies(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const pennies = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(pennies) || pennies <= 0) {
    return null;
  }

  return Math.round(pennies) / 100;
}

async function throttlePriceCharting(): Promise<void> {
  const elapsed = Date.now() - lastRequestStartedAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed)
    );
  }
  lastRequestStartedAt = Date.now();
}

async function requestPriceCharting<
  T extends { status?: "success" | "error"; "error-message"?: string },
>(
  path: string,
  params: Record<string, string>
): Promise<T | null> {
  const token = getToken();
  if (!token) {
    return null;
  }

  const url = new URL(path.replace(/^\//, ""), PRICECHARTING_BASE_URL);
  url.searchParams.set("t", token);
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  await throttlePriceCharting();

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "PokeAlpha/1.0 PriceCharting integration",
    },
  });

  if (!response.ok) {
    throw new Error(`PriceCharting request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as T;
  if (payload.status === "error") {
    throw new Error(payload["error-message"] || "PriceCharting request failed");
  }

  return payload;
}

export function hasPriceChartingToken(): boolean {
  return Boolean(getToken());
}

export async function fetchPriceChartingProductById(
  priceChartingId: string
): Promise<PriceChartingProductResponse | null> {
  if (!priceChartingId) {
    return null;
  }

  return requestPriceCharting<PriceChartingProductResponse>("/product", {
    id: priceChartingId,
  });
}

export async function searchPriceChartingProduct(
  query: string
): Promise<PriceChartingProductResponse | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  return requestPriceCharting<PriceChartingProductResponse>("/product", {
    q: trimmed,
  });
}

export async function searchPriceChartingProducts(
  query: string
): Promise<PriceChartingProductSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const payload = await requestPriceCharting<PriceChartingProductsResponse>(
    "/products",
    { q: trimmed }
  );

  return Array.isArray(payload?.products) ? payload.products : [];
}

export function getPriceChartingSealedPrice(
  product: PriceChartingProductResponse | null | undefined
): number | null {
  return (
    parsePennies(product?.["loose-price"]) ??
    parsePennies(product?.["new-price"]) ??
    parsePennies(product?.["manual-only-price"])
  );
}

export function getPriceChartingLoosePrice(
  product: PriceChartingProductResponse | null | undefined
): number | null {
  return parsePennies(product?.["loose-price"]);
}

export function getPriceChartingSalesVolume(
  product: PriceChartingProductResponse | null | undefined
): number | null {
  const raw = product?.["sales-volume"];
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }

  const parsed = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getPriceChartingManualOnlyPrice(
  product: PriceChartingProductResponse | null | undefined
): number | null {
  return parsePennies(product?.["manual-only-price"]);
}

export function getPriceChartingCardGradedPrices(
  product: PriceChartingProductResponse | null | undefined
): Record<string, number> {
  const gradedPrices: Record<string, number> = {};
  const entries: Array<[string, number | string | undefined]> = [
    ["PSA 10.0", product?.["manual-only-price"]],
    ["PSA 9.0", product?.["graded-price"]],
    ["PSA 8.0", product?.["new-price"]],
    ["PSA 7.0", product?.["cib-price"]],
    ["PSA 9.5", product?.["box-only-price"]],
    ["BGS 10.0", product?.["bgs-10-price"]],
    ["CGC 10.0", product?.["condition-17-price"]],
    ["SGC 10.0", product?.["condition-18-price"]],
  ];

  for (const [grade, value] of entries) {
    const parsed = parsePennies(value);
    if (parsed !== null) {
      gradedPrices[grade] = parsed;
    }
  }

  return gradedPrices;
}
