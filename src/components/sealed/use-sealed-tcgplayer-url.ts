"use client";

import { useEffect, useMemo, useState } from "react";

const resolvedUrlCache = new Map<string, string | null>();
const pendingRequests = new Map<string, Promise<string | null>>();

function normalizeCacheKey(name: string, productType: string): string {
  return `${name}|${productType}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function fetchSealedTcgplayerUrl(name: string, productType: string): Promise<string | null> {
  const params = new URLSearchParams({ name });
  if (productType) {
    params.set("productType", productType);
  }

  const res = await fetch(`/api/sealed/tcgplayer?${params.toString()}`);
  if (!res.ok) return null;

  const data = (await res.json()) as { tcgplayerUrl?: string | null };
  return data.tcgplayerUrl ?? null;
}

export function useSealedTcgplayerUrl({
  name,
  productType,
  initialUrl,
}: {
  name: string;
  productType: string;
  initialUrl?: string | null;
}) {
  const cacheKey = useMemo(
    () => normalizeCacheKey(name, productType),
    [name, productType]
  );
  const [, forceRender] = useState(0);
  const tcgplayerUrl = initialUrl ?? resolvedUrlCache.get(cacheKey) ?? null;
  const isLoading = Boolean(name) && !tcgplayerUrl && pendingRequests.has(cacheKey);

  useEffect(() => {
    if (initialUrl) {
      resolvedUrlCache.set(cacheKey, initialUrl);
    }
  }, [cacheKey, initialUrl]);

  useEffect(() => {
    if (!name || initialUrl || resolvedUrlCache.has(cacheKey) || pendingRequests.has(cacheKey)) {
      return;
    }

    let cancelled = false;

    const request =
      fetchSealedTcgplayerUrl(name, productType)
        .then((resolvedUrl) => {
          resolvedUrlCache.set(cacheKey, resolvedUrl);
          return resolvedUrl;
        })
        .catch(() => {
          resolvedUrlCache.set(cacheKey, null);
          return null;
        })
        .finally(() => {
          pendingRequests.delete(cacheKey);
          if (!cancelled) {
            forceRender((count) => count + 1);
          }
        });

    pendingRequests.set(cacheKey, request);
    Promise.resolve().then(() => {
      if (!cancelled) {
        forceRender((count) => count + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, initialUrl, name, productType]);

  return { tcgplayerUrl, isLoading };
}
