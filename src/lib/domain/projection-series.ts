export interface ProjectionInput {
  currentPrice: number;
  annualRate: number;
  /** YYYY-MM-DD start date for the projection. */
  todayIso: string;
  /** Total months projected forward, inclusive of the starting point. Default 60. */
  months?: number;
}

export interface ProjectionSeriesPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

export function buildProjectionSeries(input: ProjectionInput): ProjectionSeriesPoint[] {
  const months = input.months ?? 60;
  const monthlyRate = Math.pow(1 + input.annualRate, 1 / 12) - 1;

  const start = new Date(`${input.todayIso}T00:00:00Z`);
  const out: ProjectionSeriesPoint[] = [];
  for (let m = 0; m <= months; m++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + m);
    out.push({
      date: d.toISOString().slice(0, 10),
      value: Math.round(input.currentPrice * Math.pow(1 + monthlyRate, m)),
    });
  }
  return out;
}
