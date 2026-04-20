export function buildPokeDataProductImageUrl(
  name: string | null | undefined
): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  return `https://pokemonproductimages.pokedata.io/Products/${encodeURIComponent(trimmed).replace(/%20/g, "+")}.webp`;
}
