import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rule = await prisma.lineupRuleSet.findUnique({ where: { id } });
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rule);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const rule = await prisma.lineupRuleSet.update({
    where: { id },
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
  return NextResponse.json(rule);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.lineupRuleSet.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
