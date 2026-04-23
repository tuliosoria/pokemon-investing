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
  "new-price"?: number | string;
  "manual-only-price"?: number | string;
  "sales-volume"?: number | string;
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

async function requestPriceCharting(
  path: string,
  params: Record<string, string>
): Promise<PriceChartingProductResponse | null> {
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

  const payload = (await response.json()) as PriceChartingProductResponse;
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

  return requestPriceCharting("/product", { id: priceChartingId });
}

export async function searchPriceChartingProduct(
  query: string
): Promise<PriceChartingProductResponse | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  return requestPriceCharting("/product", { q: trimmed });
}

export function getPriceChartingSealedPrice(
  product: PriceChartingProductResponse | null | undefined
): number | null {
  return parsePennies(product?.["new-price"]);
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
