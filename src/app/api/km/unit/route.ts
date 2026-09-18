import { NextRequest, NextResponse } from "next/server";
import {
  parseKmUid,
  fetchContentUnit,
  extractNarrator,
  extractSourceLink,
  lookupSourceById,
  findDocxFileId,
  extractVideoLink,
  resolveVideoDurationSec,
} from "@/lib/km-client";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
  // Which language's files to look for — a lesson whose original language isn't Hebrew
  // (e.g. Russian) often has no Hebrew dub at all, so searching for "he" files finds nothing.
  const lang = req.nextUrl.searchParams.get("lang") || "he";

  const uid = parseKmUid(url);
  if (!uid) return NextResponse.json({ error: "Could not parse UID from URL" }, { status: 400 });

  try {
    const unit = await fetchContentUnit(uid);
    const files = unit.files ?? [];

    const durationSec = await resolveVideoDurationSec(files, lang);

    const source = extractSourceLink(unit.sources);
    const sourceResult = source ? await lookupSourceById(source.id) : null;
    const hasDocx = findDocxFileId(files, lang) !== null;
    const transcriptionLink = hasDocx
      ? `https://kabbalahmedia.info/he/lessons/cu/${unit.id}?activeTab=transcription`
      : null;
    return NextResponse.json({
      kmUid: unit.id,
      sourceRef: unit.name ?? null,
      recordingDate: unit.film_date ?? null,
      videoDurationSec: durationSec != null ? Math.round(durationSec) : null,
      videoLink: extractVideoLink(files, lang),
      narratorName: extractNarrator(files, lang),
      articleSourceId: source?.id ?? null,
      articleSourceLink: source?.url ?? null,
      articleSourceRef: sourceResult?.title ?? null,
      transcriptionLink,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
