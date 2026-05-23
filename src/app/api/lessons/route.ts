import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Extract source ID from a kabbalahmedia sources URL */
function extractSourceId(link: string): string | null {
  const m = link.match(/\/sources\/([A-Za-z0-9]+)/);
  return m?.[1] ?? null;
}

/** Fetch article word count + reading duration from our own API */
async function fetchArticleReading(sourceId: string): Promise<{ wordCount: number; durationSec: number } | null> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const r = await fetch(`${base}/api/km/source-wordcount?source_id=${sourceId}`);
    if (!r.ok) return null;
    const data = await r.json();
    if (data.wordCount && data.durationSec) return data;
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";
  const tags = searchParams.get("tags") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = 30;

  const where: Record<string, unknown> = {};

  if (q) {
    where.OR = [
      { sourceRef: { contains: q } },
      { articleSourceRef: { contains: q } },
      { narratorName: { contains: q } },
      { initialNotes: { contains: q } },
    ];
  }
  if (status) where.approvalStatus = status;
  if (tags) where.tags = { contains: tags };

  const [lessons, total] = await Promise.all([
    prisma.lesson.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        approvalStatus: true,
        recordingDate: true,
        sourceRef: true,
        articleSourceRef: true,
        narratorName: true,
        videoDurationSec: true,
        articleReadingMin: true,
        articleReadingSec: true,
        tags: true,
        seriesId: true,
        kmPageLink: true,
        videoLink: true,
        articleSourceLink: true,
        createdAt: true,
      },
    }),
    prisma.lesson.count({ where }),
  ]);

  return NextResponse.json({ lessons, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Strip fields that belong to ArticleSource, not Lesson
  delete body.articleBookVolume;
  delete body.articleBookPage;
  try {
    // Auto-calculate article reading duration
    if (body.articleSourceLink && !body.articleReadingSec) {
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
    const lesson = await prisma.lesson.create({ data: body });
    return NextResponse.json(lesson, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "שיעור עם קישור זה כבר קיים בספרייה" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
