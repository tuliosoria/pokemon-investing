import { NextRequest, NextResponse } from "next/server";
import {
  getUserGradeStats,
  recordUserGradeSubmission,
} from "@/lib/db/user-grades";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const cardId = req.nextUrl.searchParams.get("cardId")?.trim();
  if (!cardId) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }
  const stats = await getUserGradeStats(cardId);
  return NextResponse.json({ stats });
}

interface SubmitBody {
  cardId?: string;
  psa10Pct?: number;
  psa9Pct?: number;
  psa8Pct?: number;
}

export async function POST(req: NextRequest) {
  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const cardId = body.cardId?.trim();
  if (!cardId) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }

  const psa10Pct = Number(body.psa10Pct ?? 0);
  const psa9Pct = Number(body.psa9Pct ?? 0);
  const psa8Pct = Number(body.psa8Pct ?? 0);
  if (
    !Number.isFinite(psa10Pct) ||
    !Number.isFinite(psa9Pct) ||
    !Number.isFinite(psa8Pct)
  ) {
    return NextResponse.json({ error: "invalid percentages" }, { status: 400 });
  }
  if (psa10Pct + psa9Pct + psa8Pct > 100.001) {
    return NextResponse.json(
      { error: "percentages exceed 100" },
      { status: 400 }
    );
  }

  await recordUserGradeSubmission({ cardId, psa10Pct, psa9Pct, psa8Pct });
  const stats = await getUserGradeStats(cardId);
  return NextResponse.json({ ok: true, stats });
}
