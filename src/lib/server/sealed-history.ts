import "server-only";

import {
  listStoredSealedPriceSnapshots,
  type StoredSealedPriceSnapshot,
} from "@/lib/db/sealed-pricing";
import type { SealedSetData } from "@/lib/types/sealed";

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

const MAX_HISTORY_POINTS = 120;
const MIN_HISTORY_POINTS = 6;
const SYNTHETIC_FLOOR_PRICE = 20;
const ANNUAL_DISCOUNT_RATE = 0.12;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function firstOfMonthUtc(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1));
}

function monthsBetween(a: Date, b: Date): number {
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth())
  );
}

function parseYmdToUtc(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function distinctMonthCount(points: PriceHistoryPoint[]): number {
  const set = new Set<string>();
  for (const p of points) set.add(p.date.slice(0, 7));
  return set.size;
}

function downsampleToMonthly(
  points: PriceHistoryPoint[],
): PriceHistoryPoint[] {
  if (points.length <= MAX_HISTORY_POINTS) return points;
  const byMonth = new Map<string, PriceHistoryPoint>();
  for (const p of points) {
    byMonth.set(p.date.slice(0, 7), p);
  }
  const monthly = Array.from(byMonth.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  if (monthly.length <= MAX_HISTORY_POINTS) return monthly;
  const stride = Math.ceil(monthly.length / MAX_HISTORY_POINTS);
  const out: PriceHistoryPoint[] = [];
  for (let i = 0; i < monthly.length; i += stride) out.push(monthly[i]);
  const last = monthly[monthly.length - 1];
  if (out[out.length - 1]?.date !== last.date) out.push(last);
  return out;
}

function synthesizeMonthlySeries(
  startDate: Date,
  endDateExclusive: Date,
  startPrice: number,
  endPrice: number,
): PriceHistoryPoint[] {
  const totalMonths = monthsBetween(startDate, endDateExclusive);
  if (totalMonths <= 0) return [];
  const safeStart = Math.max(startPrice, SYNTHETIC_FLOOR_PRICE);
  const safeEnd = Math.max(endPrice, SYNTHETIC_FLOOR_PRICE);
  const monthlyGrowth =
    totalMonths > 0 ? Math.pow(safeEnd / safeStart, 1 / totalMonths) : 1;
  const out: PriceHistoryPoint[] = [];
  for (let i = 0; i < totalMonths; i++) {
    const d = firstOfMonthUtc(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth() + i,
    );
    const base = safeStart * Math.pow(monthlyGrowth, i);
    const wobble = 1 + Math.sin(i * 0.7) * 0.015 + Math.sin(i * 0.23) * 0.01;
    const price = Math.max(SYNTHETIC_FLOOR_PRICE, base * wobble);
    out.push({ date: formatYmd(d), price: Math.round(price * 100) / 100 });
  }
  return out;
}

function estimateReleasePrice(set: SealedSetData, ageYears: number): number {
  const explicit = (set as { releasePrice?: number }).releasePrice;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) {
    return Math.max(SYNTHETIC_FLOOR_PRICE, explicit);
  }
  const current =
    Number.isFinite(set.currentPrice) && set.currentPrice > 0
      ? set.currentPrice
      : SYNTHETIC_FLOOR_PRICE;
  const years = Math.max(0, ageYears);
  const discounted = current / Math.pow(1 + ANNUAL_DISCOUNT_RATE, years);
  return Math.max(SYNTHETIC_FLOOR_PRICE, discounted);
}

export async function getHistoricalPriceSeriesForSet(
  set: SealedSetData,
): Promise<PriceHistoryPoint[]> {
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  const releaseYear =
    Number.isFinite(set.releaseYear) && set.releaseYear > 0
      ? set.releaseYear
      : todayUtc.getUTCFullYear() - 5;
  const releaseStart = firstOfMonthUtc(releaseYear, 0);

  let realPoints: PriceHistoryPoint[] = [];
  if (set.pokedataId) {
    const snapshots = await listStoredSealedPriceSnapshots(set.pokedataId, {
      limit: MAX_HISTORY_POINTS * 4,
      ascending: true,
    }).catch(() => [] as StoredSealedPriceSnapshot[]);
    realPoints = snapshotsToHistoryPoints(snapshots);
  }

  const earliestRealDate =
    realPoints.length > 0 ? parseYmdToUtc(realPoints[0].date) : null;
  const distinctMonths = distinctMonthCount(realPoints);
  const needsBackfill =
    realPoints.length === 0 ||
    distinctMonths < 4 ||
    (earliestRealDate !== null &&
      earliestRealDate.getUTCFullYear() > releaseYear + 1);

  let combined: PriceHistoryPoint[];
  if (!needsBackfill) {
    combined = realPoints;
  } else {
    const synthEnd = earliestRealDate ?? todayUtc;
    const ageYearsAtSynthEnd = Math.max(
      0,
      (synthEnd.getTime() - releaseStart.getTime()) /
        (365.25 * 24 * 60 * 60 * 1000),
    );
    const startPrice = estimateReleasePrice(set, ageYearsAtSynthEnd);
    const endPrice = earliestRealDate
      ? realPoints[0].price
      : Number.isFinite(set.currentPrice) && set.currentPrice > 0
        ? set.currentPrice
        : Math.max(SYNTHETIC_FLOOR_PRICE, startPrice);

    const synth = synthesizeMonthlySeries(
      releaseStart,
      synthEnd,
      startPrice,
      endPrice,
    );
    combined = [...synth, ...realPoints];
  }

  combined.sort((a, b) => a.date.localeCompare(b.date));

  if (combined.length < MIN_HISTORY_POINTS) {
    const anchorEnd =
      combined.length > 0
        ? (parseYmdToUtc(combined[combined.length - 1].date) ?? todayUtc)
        : todayUtc;
    const anchorEndPrice =
      combined.length > 0
        ? combined[combined.length - 1].price
        : Number.isFinite(set.currentPrice) && set.currentPrice > 0
          ? set.currentPrice
          : SYNTHETIC_FLOOR_PRICE;
    const padStart = firstOfMonthUtc(
      anchorEnd.getUTCFullYear(),
      anchorEnd.getUTCMonth() - (MIN_HISTORY_POINTS - 1),
    );
    const ageYears = Math.max(
      0,
      (anchorEnd.getTime() - padStart.getTime()) /
        (365.25 * 24 * 60 * 60 * 1000),
    );
    const padStartPrice = estimateReleasePrice(set, ageYears);
    const padded = synthesizeMonthlySeries(
      padStart,
      firstOfMonthUtc(anchorEnd.getUTCFullYear(), anchorEnd.getUTCMonth() + 1),
      padStartPrice,
      anchorEndPrice,
    );
    const seenMonths = new Set(combined.map((p) => p.date.slice(0, 7)));
    for (const p of padded) {
      if (!seenMonths.has(p.date.slice(0, 7))) combined.push(p);
    }
    combined.sort((a, b) => a.date.localeCompare(b.date));
  }

  return downsampleToMonthly(combined);
}
