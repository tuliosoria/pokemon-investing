import { NextRequest, NextResponse } from "next/server";
import { gradeEvSchema } from "@/lib/schemas/grading";
import { calculateGradeExpectedValue } from "@/lib/domain/grading";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = gradeEvSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = calculateGradeExpectedValue(parsed.data);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
