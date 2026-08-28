import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slotWithLessonInclude, withLessonTimecodes } from "@/lib/slot-includes";
import { parseKmUid, fetchContentUnit } from "@/lib/km-client";
import { syncBroadcastDateOnPlacement } from "@/lib/broadcast-date";

// A lesson's cached videoDurationSec can go stale if the source video on KabbalaMedia
// is re-cut/re-encoded after import. Re-check it against KM right when the lesson is
// actually scheduled, so the lineup reflects the current real duration. Updates the
// shared Lesson row (not the slot) — slotEffectiveDuration() reads it live, so every
// slot referencing this lesson benefits, not just the one being added now.
async function refreshLessonDuration(lessonId: string) {
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { kmPageLink: true, videoDurationSec: true },
    });
    const uid = lesson?.kmPageLink ? parseKmUid(lesson.kmPageLink) : null;
    if (!uid) return;
    const unit = await fetchContentUnit(uid);
    const freshDurationSec = unit.duration != null ? Math.round(unit.duration) : null;
    if (freshDurationSec != null && freshDurationSec !== lesson?.videoDurationSec) {
      await prisma.lesson.update({ where: { id: lessonId }, data: { videoDurationSec: freshDurationSec } });
    }
  } catch {
    // KM unreachable or lesson has no resolvable kmUid — keep the cached duration
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { dayId, slotType, ...rest } = body;

  // Remove relation/unknown fields that Prisma doesn't accept as data
  delete rest.lesson;
  delete rest.component;
  delete rest.studyMaterialSource;
  delete rest.studyMaterialSourceId;

  // Validate foreign keys before creating to give a clear error
  const day = await prisma.lineupDay.findUnique({ where: { id: dayId }, select: { id: true } });
  if (!day) return NextResponse.json({ error: `dayId not found: ${dayId}` }, { status: 422 });

  if (rest.lessonId) {
    const lesson = await prisma.lesson.findUnique({ where: { id: rest.lessonId }, select: { id: true } });
    if (!lesson) {
      delete rest.lessonId; // drop invalid reference instead of failing
    } else {
      await refreshLessonDuration(rest.lessonId);
    }
  }

  if (rest.lessonPartId) {
    const lessonPart = await prisma.lessonPart.findUnique({ where: { id: rest.lessonPartId }, select: { id: true } });
    if (!lessonPart) delete rest.lessonPartId; // drop invalid reference instead of failing
  }

  if (rest.componentId) {
    const component = await prisma.lineupComponent.findUnique({ where: { id: rest.componentId }, select: { id: true } });
    if (!component) {
      delete rest.componentId; // drop invalid reference instead of failing
    }
  }

  const last = await prisma.lineupSlot.findFirst({
    where: { dayId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const slot = await prisma.lineupSlot.create({
    data: { dayId, slotType, sortOrder, ...rest },
    include: slotWithLessonInclude,
  });

  await syncBroadcastDateOnPlacement(dayId, slot.lessonId, slot.lessonPartId);

  const [enriched] = await withLessonTimecodes(prisma, [slot]);
  return NextResponse.json(enriched, { status: 201 });
}
