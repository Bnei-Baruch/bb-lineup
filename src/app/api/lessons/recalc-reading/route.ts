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

/** POST /api/lessons/recalc-reading?id=xxx  — recalculate one lesson
 *  POST /api/lessons/recalc-reading          — backfill all missing */
export async function POST(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    // Single lesson recalculation
    const lesson = await prisma.lesson.findUnique({ where: { id }, select: { id: true, articleSourceLink: true } });
    if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!lesson.articleSourceLink) return NextResponse.json({ error: "No article source link" }, { status: 400 });

    const sourceId = extractSourceId(lesson.articleSourceLink);
    if (!sourceId) return NextResponse.json({ error: "Could not extract source ID" }, { status: 400 });

    const reading = await fetchArticleReading(sourceId);
    if (!reading) return NextResponse.json({ error: "Could not fetch word count (no docx?)" }, { status: 502 });

    const updated = await prisma.lesson.update({
      where: { id },
      data: {
        articleWordCount: reading.wordCount,
        articleReadingSec: reading.durationSec,
        articleReadingMin: Math.round(reading.durationSec / 60),
      },
    });
    return NextResponse.json({ articleReadingSec: updated.articleReadingSec, articleWordCount: updated.articleWordCount });
  }

  // Backfill all lessons with articleSourceLink but no articleReadingSec
  const lessons = await prisma.lesson.findMany({
    where: { articleSourceLink: { not: null }, articleReadingSec: null },
    select: { id: true, articleSourceLink: true },
  });

  let updated = 0;
  let failed = 0;
  for (const lesson of lessons) {
    const sourceId = extractSourceId(lesson.articleSourceLink!);
    if (!sourceId) { failed++; continue; }
    const reading = await fetchArticleReading(sourceId);
    if (!reading) { failed++; continue; }
    await prisma.lesson.update({
      where: { id: lesson.id },
      data: {
        articleWordCount: reading.wordCount,
        articleReadingSec: reading.durationSec,
        articleReadingMin: Math.round(reading.durationSec / 60),
      },
    });
    updated++;
  }

  return NextResponse.json({ total: lessons.length, updated, failed });
}
