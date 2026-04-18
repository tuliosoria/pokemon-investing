import { NextRequest, NextResponse } from "next/server";
import { sealedSchema } from "@/lib/schemas/sealed";
import { calculateSealedRoi } from "@/lib/domain/sealed";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = sealedSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = calculateSealedRoi(parsed.data);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
