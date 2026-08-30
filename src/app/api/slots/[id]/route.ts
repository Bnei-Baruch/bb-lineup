import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slotWithLessonInclude, withLessonTimecodes } from "@/lib/slot-includes";
import { syncBroadcastDateOnPlacement, syncBroadcastDateOnRemoval } from "@/lib/broadcast-date";
import { resolveLessonWords } from "@/lib/lesson-words";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  delete body.id;
  delete body.dayId;
  delete body.createdAt;
  delete body.updatedAt;
  delete body.lesson;
  delete body.component;
  delete body.studyMaterialSource;
  delete body.studyMaterialSourceId;

  const before = await prisma.lineupSlot.findUniqueOrThrow({
    where: { id },
    select: { dayId: true, lessonId: true, lessonPartId: true },
  });

  // Prefill opening/closing words when this request re-links the slot to a different
  // lesson/part, unless the caller already provided their own in this same request.
  const isRelinking = ("lessonId" in body || "lessonPartId" in body)
    && (body.lessonId !== before.lessonId || body.lessonPartId !== before.lessonPartId);
  if (isRelinking && body.openingWords == null && body.closingWords == null) {
    const words = await resolveLessonWords(prisma, body.lessonId ?? before.lessonId, body.lessonPartId ?? before.lessonPartId);
    if (words.openingWords) body.openingWords = words.openingWords;
    if (words.closingWords) body.closingWords = words.closingWords;
  }

  const slot = await prisma.lineupSlot.update({
    where: { id },
    data: body,
    include: slotWithLessonInclude,
  });

  if (slot.lessonId !== before.lessonId || slot.lessonPartId !== before.lessonPartId) {
    if (before.lessonId || before.lessonPartId) {
      await syncBroadcastDateOnRemoval(before.lessonId, before.lessonPartId);
    }
    if (slot.lessonId || slot.lessonPartId) {
      await syncBroadcastDateOnPlacement(before.dayId, slot.lessonId, slot.lessonPartId);
    }
  }

  const [enriched] = await withLessonTimecodes(prisma, [slot]);
  return NextResponse.json(enriched);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dayId } = await req.json();
  if (!dayId) return NextResponse.json({ error: "dayId required" }, { status: 400 });
  const slot = await prisma.lineupSlot.update({
    where: { id },
    data: { dayId },
    include: slotWithLessonInclude,
  });

  await syncBroadcastDateOnPlacement(dayId, slot.lessonId, slot.lessonPartId);

  const [enriched] = await withLessonTimecodes(prisma, [slot]);
  return NextResponse.json(enriched);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slot = await prisma.lineupSlot.delete({
    where: { id },
    select: { lessonId: true, lessonPartId: true },
  });

  await syncBroadcastDateOnRemoval(slot.lessonId, slot.lessonPartId);

  return new NextResponse(null, { status: 204 });
}
