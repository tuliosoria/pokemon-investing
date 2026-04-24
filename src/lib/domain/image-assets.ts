export type ImageAssetKind = "sealed-product" | "card-small" | "card-large";

export type ImageMirrorProvider =
  | "pokedata"
  | "pokemontcg"
  | "tcgapi"
  | "pricecharting"
  | "unknown";

export interface ImageMirrorSource {
  provider: ImageMirrorProvider;
  url: string;
  mirroredAt?: string | null;
}

export interface OwnedImageAssetReference {
  ownership: "owned";
  kind: ImageAssetKind;
  storage: "public-app" | "immutable-assets";
  path: string;
  url: string;
  mirroredFrom?: ImageMirrorSource | null;
}

export interface ExternalImageAssetReference {
  ownership: "external";
  kind: ImageAssetKind;
  provider: ImageMirrorProvider;
  url: string;
  hotlinked: true;
}

export interface ResolvedImageAsset {
  kind: ImageAssetKind;
  selectedUrl: string | null;
  owned: OwnedImageAssetReference | null;
  fallback: ExternalImageAssetReference | null;
  mirrorSource: ImageMirrorSource | null;
  isOwnedPreferred: boolean;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function extractOwnedPathCandidate(
  value: string | null | undefined
): string | null {
  const normalized = normalizeOwnedImagePath(value);
  if (!normalized || isHttpUrl(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeOwnedImagePath(path: string | null | undefined): string {
  const trimmed = path?.trim() ?? "";
  if (!trimmed) {
    return "";
  }

  if (isHttpUrl(trimmed)) {
    return trimmed;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed.replace(/^\/+/, "")}`;
}

export function inferImageMirrorProvider(
  url: string | null | undefined
): ImageMirrorProvider | null {
  const trimmed = url?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const hostname = new URL(trimmed).hostname.toLowerCase();

    if (
      hostname.includes("pokemonproductimages.pokedata.io") ||
      hostname.includes("pokedata.io")
    ) {
      return "pokedata";
    }

    if (
      hostname.includes("images.pokemontcg.io") ||
      hostname.includes("pokemontcg.io")
    ) {
      return "pokemontcg";
    }

    if (hostname.includes("tcgapi.dev")) {
      return "tcgapi";
    }

    if (hostname.includes("pricecharting.com")) {
      return "pricecharting";
    }
  } catch {
    return null;
  }

  return "unknown";
}

export function buildImageMirrorSource(input?: {
  provider?: ImageMirrorProvider | null;
  url?: string | null;
  mirroredAt?: string | null;
}): ImageMirrorSource | null {
  const url = input?.url?.trim();
  if (!url) {
    return null;
  }

  return {
    provider: input?.provider ?? inferImageMirrorProvider(url) ?? "unknown",
    url,
    mirroredAt: input?.mirroredAt ?? null,
  };
}

export function buildOwnedImageReference(input: {
  kind: ImageAssetKind;
  path?: string | null;
  storage?: OwnedImageAssetReference["storage"];
  mirroredFrom?: ImageMirrorSource | null;
}): OwnedImageAssetReference | null {
  const path = normalizeOwnedImagePath(input.path);
  if (!path) {
    return null;
  }

  return {
    ownership: "owned",
    kind: input.kind,
    storage: input.storage ?? "public-app",
    path,
    url: path,
    mirroredFrom: input.mirroredFrom ?? null,
  };
}

export function buildExternalImageReference(
  kind: ImageAssetKind,
  url: string | null | undefined
): ExternalImageAssetReference | null {
  const trimmed = url?.trim();
  if (!trimmed || !isHttpUrl(trimmed)) {
    return null;
  }

  return {
    ownership: "external",
    kind,
    provider: inferImageMirrorProvider(trimmed) ?? "unknown",
    url: trimmed,
    hotlinked: true,
  };
}

export function resolveImageAsset(input: {
  kind: ImageAssetKind;
  ownedPath?: string | null;
  ownedStorage?: OwnedImageAssetReference["storage"];
  fallbackCandidates?: Array<string | null | undefined>;
  mirrorSource?: ImageMirrorSource | null;
}): ResolvedImageAsset {
  const ownedPath =
    normalizeOwnedImagePath(input.ownedPath) ||
    (input.fallbackCandidates ?? [])
      .map((candidate) => extractOwnedPathCandidate(candidate))
      .find((candidate): candidate is string => Boolean(candidate)) ||
    null;
  const fallback =
    (input.fallbackCandidates ?? [])
      .map((candidate) => buildExternalImageReference(input.kind, candidate))
      .find((candidate): candidate is ExternalImageAssetReference =>
        Boolean(candidate)
      ) ?? null;
  const mirrorSource =
    input.mirrorSource ??
    buildImageMirrorSource({
      provider: fallback?.provider ?? null,
      url: fallback?.url ?? null,
    });
  const owned = buildOwnedImageReference({
    kind: input.kind,
    path: ownedPath,
    storage: input.ownedStorage,
    mirroredFrom: mirrorSource,
  });

  return {
    kind: input.kind,
    selectedUrl: owned?.url ?? fallback?.url ?? null,
    owned,
    fallback,
    mirrorSource,
    isOwnedPreferred: Boolean(owned),
  };
}
