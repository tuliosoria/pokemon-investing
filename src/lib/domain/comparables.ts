import type { SealedSetData } from "@/lib/types/sealed";

/**
 * Find catalog comparables for a given sealed set:
 *  - same productType
 *  - within ±5 release years
 *  - excludes the target itself
 *  - sorted by closest year, then alphabetically
 *  - returns up to 4 entries
 */
export function findComparables(
  target: SealedSetData,
  allSets: SealedSetData[],
  limit = 4,
): SealedSetData[] {
  return allSets
    .filter(
      (s) =>
        s.id !== target.id &&
        s.productType === target.productType &&
        Math.abs(s.releaseYear - target.releaseYear) <= 5,
    )
    .sort((a, b) => {
      const ay = Math.abs(a.releaseYear - target.releaseYear);
      const by = Math.abs(b.releaseYear - target.releaseYear);
      if (ay !== by) return ay - by;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

export function describeComparable(
  target: SealedSetData,
  comparable: SealedSetData,
): string {
  const yearDiff = comparable.releaseYear - target.releaseYear;
  if (yearDiff === 0) {
    return `Same era and same product type (${comparable.productType}).`;
  }
  const ago = Math.abs(yearDiff);
  const direction = yearDiff < 0 ? "earlier" : "later";
  return `${ago} year${ago === 1 ? "" : "s"} ${direction}, same ${comparable.productType.toLowerCase()} format.`;
}
