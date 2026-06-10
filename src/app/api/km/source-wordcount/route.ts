import { NextRequest, NextResponse } from "next/server";
import { fetchContentUnit, findDocxFileId, fetchDocHtml } from "@/lib/km-client";
import { stripHtml, countWords } from "@/lib/time";
import { prisma } from "@/lib/prisma";

const WPM = 77;

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  const sourceId = req.nextUrl.searchParams.get("source_id");

  const targetId = sourceId ?? uid;
  if (!targetId) return NextResponse.json({ error: "uid or source_id required" }, { status: 400 });

  try {
    // Check DB cache first
    const cached = await prisma.articleSource.findUnique({
      where: { id: targetId },
      select: { readingSec: true },
    });
    if (cached?.readingSec != null) {
      const durationSec = Math.ceil(cached.readingSec / 60) * 60;
      return NextResponse.json({ wordCount: null, durationSec });
    }

    // Fall back to fetching from KM and computing from word count
    const unit = await fetchContentUnit(targetId);
    const files = unit.files ?? [];
    const docxId = findDocxFileId(files);

    if (!docxId) {
      return NextResponse.json({ wordCount: null, durationSec: null, error: "No docx file found" });
    }

    const html = await fetchDocHtml(docxId);
    const text = stripHtml(html);
    const wordCount = countWords(text);
    const durationSec = Math.ceil(wordCount / WPM) * 60;

    return NextResponse.json({ wordCount, durationSec });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
