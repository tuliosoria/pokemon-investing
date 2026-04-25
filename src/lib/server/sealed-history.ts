import "server-only";

import {
  listStoredSealedPriceSnapshots,
  type StoredSealedPriceSnapshot,
} from "@/lib/db/sealed-pricing";

export interface PriceHistoryPoint {
  date: string;
  price: number;
}

export function snapshotsToHistoryPoints(
  snapshots: Pick<StoredSealedPriceSnapshot, "snapshotDate" | "bestPrice">[],
): PriceHistoryPoint[] {
  return snapshots
    .filter(
      (s): s is { snapshotDate: string; bestPrice: number } =>
        typeof s.snapshotDate === "string" &&
        s.snapshotDate.length > 0 &&
        typeof s.bestPrice === "number" &&
        Number.isFinite(s.bestPrice),
    )
    .map((s) => ({ date: s.snapshotDate, price: s.bestPrice }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getSealedPriceHistory(
  pokedataId: string,
  monthsBack = 24,
): Promise<PriceHistoryPoint[]> {
  const snapshots = await listStoredSealedPriceSnapshots(pokedataId, {
    limit: monthsBack * 4,
    ascending: true,
  }).catch(() => [] as StoredSealedPriceSnapshot[]);
  return snapshotsToHistoryPoints(snapshots);
}
