import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await prisma.$queryRaw<{ sessionIndex: number }[]>`
    SELECT sessionIndex FROM "LineupDay" WHERE id = ${id}
  `;
  if (!rows[0] || rows[0].sessionIndex === 0) {
    return NextResponse.json({ error: "Cannot delete primary session" }, { status: 409 });
  }
  await prisma.lineupDay.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  if (body.broadcastStartTime !== undefined) {
    await prisma.lineupDay.update({
      where: { id },
      data: { broadcastStartTime: body.broadcastStartTime ?? null },
    });
  }

  if (body.broadcastEndTime !== undefined) {
    await prisma.$executeRaw`UPDATE "LineupDay" SET "broadcastEndTime" = ${body.broadcastEndTime ?? null} WHERE "id" = ${id}`;
  }

  if (body.contentStartIndex !== undefined) {
    try {
      await prisma.$executeRaw`UPDATE "LineupDay" SET "contentStartIndex" = ${body.contentStartIndex ?? null} WHERE "id" = ${id}`;
    } catch { /* column not yet migrated on this env */ }
  }

  if (body.contentCutoffIndex !== undefined) {
    try {
      await prisma.$executeRaw`UPDATE "LineupDay" SET "contentCutoffIndex" = ${body.contentCutoffIndex ?? null} WHERE "id" = ${id}`;
    } catch { /* column not yet migrated on this env */ }
  }

  if (body.sessionLabel !== undefined) {
    try {
      await prisma.$executeRaw`UPDATE "LineupDay" SET "sessionLabel" = ${body.sessionLabel ?? null} WHERE "id" = ${id}`;
    } catch { /* column not yet migrated on this env */ }
  }

  const day = await prisma.$queryRaw<{ id: string; broadcastStartTime: string | null; broadcastEndTime: string | null }[]>`
    SELECT id, broadcastStartTime, broadcastEndTime FROM "LineupDay" WHERE id = ${id}
  `;
  return NextResponse.json(day[0] ?? {});
}
