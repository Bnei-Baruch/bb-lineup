import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { lineupId, dayOfWeek } = await req.json();
  if (!lineupId || dayOfWeek === undefined) {
    return NextResponse.json({ error: "lineupId and dayOfWeek required" }, { status: 400 });
  }

  const existing = await prisma.$queryRaw<{ sessionIndex: number }[]>`
    SELECT sessionIndex FROM "LineupDay"
    WHERE "lineupId" = ${lineupId} AND "dayOfWeek" = ${dayOfWeek}
    ORDER BY "sessionIndex" ASC
  `;
  const nextIndex = (existing.at(-1)?.sessionIndex ?? -1) + 1;

  const id = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "LineupDay" (id, lineupId, dayOfWeek, sessionIndex, sessionLabel, notes, broadcastStartTime, broadcastEndTime, contentCutoffIndex)
    VALUES (${id}, ${lineupId}, ${dayOfWeek}, ${nextIndex}, NULL, NULL, NULL, NULL, NULL)
  `;

  return NextResponse.json({
    id,
    lineupId,
    dayOfWeek,
    sessionIndex: nextIndex,
    sessionLabel: null,
    notes: null,
    broadcastStartTime: null,
    broadcastEndTime: null,
    contentCutoffIndex: null,
    slots: [],
  });
}
