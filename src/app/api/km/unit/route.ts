import { NextRequest, NextResponse } from "next/server";
import {
  parseKmUid,
  fetchContentUnit,
  extractNarrator,
  extractSourceLink,
  lookupSourceById,
  findDocxFileId,
} from "@/lib/km-client";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const uid = parseKmUid(url);
  if (!uid) return NextResponse.json({ error: "Could not parse UID from URL" }, { status: 400 });

  try {
    const unit = await fetchContentUnit(uid);
    const files = unit.files ?? [];

    const heVideo = files.find((f) => f.language === "he" && f.type === "video");
    const durationSec = heVideo?.duration ?? unit.duration ?? null;

    const source = extractSourceLink(unit.sources);
    const sourceResult = source ? await lookupSourceById(source.id) : null;
    const hasDocx = findDocxFileId(files) !== null;
    const transcriptionLink = hasDocx
      ? `https://kabbalahmedia.info/he/lessons/cu/${unit.id}?activeTab=transcription`
      : null;
    return NextResponse.json({
      kmUid: unit.id,
      sourceRef: unit.name ?? null,
      recordingDate: unit.film_date ?? null,
      videoDurationSec: durationSec != null ? Math.round(durationSec) : null,
      videoLink: `https://kabbalahmedia.info/he/lessons/cu/${unit.id}`,
      narratorName: extractNarrator(files),
      articleSourceId: source?.id ?? null,
      articleSourceLink: source?.url ?? null,
      articleSourceRef: sourceResult?.title ?? null,
      transcriptionLink,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
