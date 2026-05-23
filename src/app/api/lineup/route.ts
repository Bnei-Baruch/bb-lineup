import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toWeekStart } from "@/lib/dates";

export async function GET() {
  const lineups = await prisma.lineup.findMany({
    orderBy: { weekStart: "desc" },
    select: {
      id: true,
      weekStart: true,
      notes: true,
      _count: { select: { days: true } },
    },
  });
  return NextResponse.json(lineups);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const weekStart = toWeekStart(new Date(body.weekStart));

  const lineup = await prisma.lineup.create({
    data: {
      weekStart,
      notes: body.notes ?? null,
      days: {
        create: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i })),
      },
    },
    include: { days: true },
  });

  return NextResponse.json(lineup, { status: 201 });
}
