import type { ImageMirrorProvider, ResolvedImageAsset } from "./image-assets";
import { buildImageMirrorSource, resolveImageAsset } from "./image-assets";

const KNOWN_SEALED_OWNED_IMAGE_PATHS: Record<string, string> = {
  "crown-zenith": "/sealed/crown-zenith-etb.webp",
  "pokemon-151": "/sealed/151-etb.webp",
  "obsidian-flames": "/sealed/obsidian-flames-bb.webp",
  "surging-sparks": "/sealed/surging-sparks-bb.webp",
  "prismatic-evolutions": "/sealed/prismatic-booster-bundle.webp",
};

const KNOWN_SEALED_OWNED_IMAGE_PATHS_BY_NAME: Record<string, string> = {
  "crown zenith elite trainer box": "/sealed/crown-zenith-etb.webp",
  "pokemon 151 elite trainer box": "/sealed/151-etb.webp",
  "obsidian flames booster box": "/sealed/obsidian-flames-bb.webp",
  "surging sparks booster box": "/sealed/surging-sparks-bb.webp",
  "prismatic evolutions booster bundle": "/sealed/prismatic-booster-bundle.webp",
  "prismatic evolutions elite trainer box": "/sealed/prismatic-etb.webp",
  "temporal forces booster box": "/sealed/temporal-forces-bb.webp",
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

function normalizeCatalogId(value: string): string {
  return value.replace(/^local-sealed:/, "").trim();
}

export function getKnownSealedOwnedImagePath(input: {
  setId?: string | null;
  pokedataId?: string | null;
  name?: string | null;
}): string | null {
  const ids = [input.setId, input.pokedataId]
    .map((value) => (value ? normalizeCatalogId(value) : null))
    .filter((value): value is string => Boolean(value));

  for (const id of ids) {
    const match = KNOWN_SEALED_OWNED_IMAGE_PATHS[id];
    if (match) {
      return match;
    }
  }

  const normalizedName = normalize(input.name ?? "");
  return normalizedName
    ? KNOWN_SEALED_OWNED_IMAGE_PATHS_BY_NAME[normalizedName] ?? null
    : null;
}

export function resolveSealedProductImageAsset(input: {
  setId?: string | null;
  pokedataId?: string | null;
  name?: string | null;
  ownedImagePath?: string | null;
  fallbackCandidates?: Array<string | null | undefined>;
  mirrorSourceUrl?: string | null;
  mirrorSourceProvider?: ImageMirrorProvider | null;
  mirroredAt?: string | null;
}): ResolvedImageAsset {
  return resolveImageAsset({
    kind: "sealed-product",
    ownedPath:
      input.ownedImagePath ??
      getKnownSealedOwnedImagePath({
        setId: input.setId,
        pokedataId: input.pokedataId,
        name: input.name,
      }),
    fallbackCandidates: input.fallbackCandidates,
    mirrorSource: buildImageMirrorSource({
      provider: input.mirrorSourceProvider ?? null,
      url: input.mirrorSourceUrl ?? null,
      mirroredAt: input.mirroredAt ?? null,
    }),
  });
}

export function pickProductImageUrl(
  ...candidates: Array<string | null | undefined>
): string | null {
  return resolveSealedProductImageAsset({
    fallbackCandidates: candidates,
  }).selectedUrl;
}
