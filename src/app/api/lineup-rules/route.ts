import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const rules = await prisma.lineupRuleSet.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const rule = await prisma.lineupRuleSet.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      isDefault: body.isDefault ?? false,
      broadcastStartTime: body.broadcastStartTime ?? "02:40",
      targetDurationSec: body.targetDurationSec ?? null,
      hardMaxDurationSec: body.hardMaxDurationSec ?? null,
      splitLongLessons: body.splitLongLessons ?? true,
      maxLessonDurationSec: body.maxLessonDurationSec ?? null,
      dayTemplate: typeof body.dayTemplate === "string" ? body.dayTemplate : JSON.stringify(body.dayTemplate ?? []),
      preferredSeriesIds: typeof body.preferredSeriesIds === "string" ? body.preferredSeriesIds : (body.preferredSeriesIds ? JSON.stringify(body.preferredSeriesIds) : null),
      extraInstructions: body.extraInstructions ?? null,
    },
  });
  return NextResponse.json(rule, { status: 201 });
}
