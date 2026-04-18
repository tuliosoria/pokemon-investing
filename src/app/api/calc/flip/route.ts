import { NextRequest, NextResponse } from "next/server";
import { flipSchema } from "@/lib/schemas/flip";
import { calculateFlipNetProfit } from "@/lib/domain/flip";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = flipSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = calculateFlipNetProfit(parsed.data);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
