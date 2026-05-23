import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseWeekParam, toWeekStart } from "@/lib/dates";
import { slotWithLessonInclude } from "@/lib/slot-includes";

function getWhere(weekStart: string) {
  return { weekStart: toWeekStart(parseWeekParam(weekStart)) };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ weekStart: string }> }
) {
  const { weekStart } = await params;
  const lineup = await prisma.lineup.findUnique({
    where: getWhere(weekStart),
    include: {
      days: {
        orderBy: { dayOfWeek: "asc" },
        include: {
          slots: {
            orderBy: { sortOrder: "asc" },
            include: slotWithLessonInclude,
          },
        },
      },
    },
  });

  if (!lineup) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lineup);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ weekStart: string }> }
) {
  const { weekStart } = await params;
  const { notes } = await req.json();
  const lineup = await prisma.lineup.update({
    where: getWhere(weekStart),
    data: { notes },
  });
  return NextResponse.json(lineup);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ weekStart: string }> }
) {
  const { weekStart } = await params;
  await prisma.lineup.delete({ where: getWhere(weekStart) });
  return new NextResponse(null, { status: 204 });
}
