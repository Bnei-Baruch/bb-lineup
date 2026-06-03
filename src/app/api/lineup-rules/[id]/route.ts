import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "LineupRuleSet" WHERE id = ${id}`;
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  await prisma.lineupRuleSet.update({
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

  if (body.broadcastEndTime !== undefined) {
    await prisma.$executeRaw`UPDATE "LineupRuleSet" SET "broadcastEndTime" = ${body.broadcastEndTime ?? null} WHERE id = ${id}`;
  }

  const updated = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "LineupRuleSet" WHERE id = ${id}`;
  return NextResponse.json(updated[0]);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.lineupRuleSet.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
