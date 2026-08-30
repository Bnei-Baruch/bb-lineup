import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function extractSourceId(link: string): string | null {
  const m = link.match(/\/sources\/([A-Za-z0-9]+)/);
  return m?.[1] ?? null;
}

async function fetchArticleReading(sourceId: string): Promise<{ wordCount: number; durationSec: number } | null> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const r = await fetch(`${base}/api/km/source-wordcount?source_id=${sourceId}`);
    if (!r.ok) return null;
    const data = await r.json();
    if (data.wordCount && data.durationSec) return data;
    return null;
  } catch { return null; }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: { articleSource: true, parts: { orderBy: { partNumber: "asc" } } },
  });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lesson);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  delete body.id;

  // A bare "YYYY-MM-DD" (e.g. from a native date input) isn't a full ISO-8601 DateTime, which
  // this Prisma client version requires - convert before it ever reaches the query engine.
  if (typeof body.broadcastDate === "string") {
    body.broadcastDate = body.broadcastDate ? new Date(body.broadcastDate) : null;
  }

  // Extract book page fields — handled via ArticleSource, not Lesson
  const bookVolume: number | null = body.articleBookVolume ?? null;
  const bookPage: number | null = body.articleBookPage ?? null;
  delete body.articleBookVolume;
  delete body.articleBookPage;

  // Extract timecode fields — written via raw SQL to avoid Prisma client cache issues. Only
  // touched when actually present in the request, so a partial update (e.g. inline-editing one
  // unrelated field) can't silently wipe out an existing cut.
  const hasTimecodeFields = "startTimecode" in body || "endTimecode" in body;
  const startTimecode: string | null = body.startTimecode || null;
  const endTimecode: string | null = body.endTimecode || null;
  delete body.startTimecode;
  delete body.endTimecode;

  // Parts are a nested relation, not a plain Lesson column. Only touched when the key is
  // present, so a partial update (e.g. inline-editing broadcastDate/status) can't wipe them.
  const hasParts = "parts" in body;
  const parts: { partNumber: number; startTimecode?: string | null; endTimecode?: string | null; broadcastDate?: string | Date | null; openingStatement?: string | null; closingStatement?: string | null; notes?: string | null }[] | undefined = body.parts;
  delete body.parts;

  // Re-calculate article reading if source link changed
  if (body.articleSourceLink) {
    const existing = await prisma.lesson.findUnique({ where: { id }, select: { articleSourceLink: true } });
    const linkChanged = existing?.articleSourceLink !== body.articleSourceLink;
    if (linkChanged || !body.articleReadingSec) {
      const sourceId = extractSourceId(body.articleSourceLink);
      if (sourceId) {
        const reading = await fetchArticleReading(sourceId);
        if (reading) {
          body.articleWordCount = reading.wordCount;
          body.articleReadingSec = reading.durationSec;
          body.articleReadingMin = Math.round(reading.durationSec / 60);
        }
      }
    }
  }

  let lesson;
  try {
    if (hasParts) {
      const [, updated] = await prisma.$transaction([
        prisma.lessonPart.deleteMany({ where: { lessonId: id } }),
        prisma.lesson.update({
          where: { id },
          data: {
            ...body,
            parts: parts && parts.length > 0
              ? { create: parts.map((p) => ({ ...p, broadcastDate: p.broadcastDate ? new Date(p.broadcastDate) : null })) }
              : undefined,
          },
          include: { parts: { orderBy: { partNumber: "asc" } } },
        }),
      ]);
      lesson = updated;
    } else {
      lesson = await prisma.lesson.update({ where: { id }, data: body });
    }
  } catch (err) {
    console.error("lesson update error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  // Write timecode fields via raw SQL (Prisma client may not yet include these columns)
  if (hasTimecodeFields) {
    await prisma.$executeRaw`
      UPDATE "Lesson" SET "startTimecode" = ${startTimecode}, "endTimecode" = ${endTimecode} WHERE id = ${id}
    `;
  }

  // Upsert book page into ArticleSource if we have a source ID
  const sourceId = lesson.articleSourceId;
  if (sourceId && (bookVolume !== null || bookPage !== null)) {
    await prisma.articleSource.upsert({
      where: { id: sourceId },
      create: {
        id: sourceId,
        ref: lesson.articleSourceRef ?? "",
        link: lesson.articleSourceLink,
        wordCount: lesson.articleWordCount,
        readingSec: lesson.articleReadingSec,
        bookVolume,
        bookPage,
      },
      update: {
        ...(bookVolume !== null ? { bookVolume } : {}),
        ...(bookPage !== null ? { bookPage } : {}),
      },
    });
  }

  return NextResponse.json(hasTimecodeFields ? { ...lesson, startTimecode, endTimecode } : lesson);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inUse = await prisma.lineupSlot.count({ where: { lessonId: id } });
  if (inUse > 0) {
    return NextResponse.json(
      { error: "השיעור משובץ בתוכנית ולא ניתן למחוק אותו" },
      { status: 409 }
    );
  }
  await prisma.lesson.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
