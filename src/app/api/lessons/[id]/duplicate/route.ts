import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PART_SUFFIX = /\s*חלק\s*\d+\s*$/;
const PART_NUMBER = /חלק\s*(\d+)\s*$/;

const SELECT = {
  id: true,
  approvalStatus: true,
  recordingDate: true,
  broadcastDate: true,
  sourceRef: true,
  articleSourceRef: true,
  narratorName: true,
  videoDurationSec: true,
  articleReadingMin: true,
  articleReadingSec: true,
  tags: true,
  seriesId: true,
  series: { select: { id: true, name: true, color: true } },
  kmPageLink: true,
  videoLink: true,
  articleSourceLink: true,
  transcriptionLink: true,
  articleSource: { select: { bookSeries: true, bookVolume: true, bookPage: true } },
  createdAt: true,
} as const;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const original = await prisma.lesson.findUnique({ where: { id } });
  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isFirstDuplicate = !PART_SUFFIX.test(original.sourceRef ?? "");
  const baseRef = (original.sourceRef ?? "").replace(PART_SUFFIX, "").trim();

  // Find highest existing part number among siblings
  const siblings = baseRef
    ? await prisma.lesson.findMany({
        where: { sourceRef: { contains: baseRef } },
        select: { sourceRef: true },
      })
    : [];
  const maxPart = siblings.reduce((max, l) => {
    const m = l.sourceRef?.match(PART_NUMBER);
    return m ? Math.max(max, parseInt(m[1])) : max;
  }, isFirstDuplicate ? 1 : 0);
  const nextPart = maxPart + 1;

  const { id: _id, kmUid: _kmUid, createdAt: _c, updatedAt: _u, ...fields } = original;

  // If first duplication, also rename original to "חלק 1"
  let updatedOriginal = null;
  if (isFirstDuplicate && baseRef) {
    updatedOriginal = await prisma.lesson.update({
      where: { id },
      data: { sourceRef: `${baseRef} חלק 1` },
      select: SELECT,
    });
  }

  const created = await prisma.lesson.create({
    data: { ...fields, sourceRef: `${baseRef} חלק ${nextPart}`, approvalStatus: "pending" },
    select: SELECT,
  });

  return NextResponse.json({ created, updatedOriginal }, { status: 201 });
}
