import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  parseKmUid,
  fetchContentUnit,
  extractNarrator,
  extractSourceLink,
  lookupSourceById,
  findDocxFileId,
  extractVideoLink,
  findHebrewMp4,
} from "@/lib/km-client";

const execFileAsync = promisify(execFile);

/** Reads just the container metadata (via HTTP range requests, not a full download) to get the
 *  real duration when KM's own catalog value is missing or obviously wrong. Always probes the
 *  mp4 specifically — other formats (e.g. legacy .wmv) aren't guaranteed to even be seekable
 *  the same way, and mp4 is the only one we ever actually play back. */
async function probeMp4DurationSec(url: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", url],
      { timeout: 20000 }
    );
    const sec = parseFloat(stdout.trim());
    return Number.isFinite(sec) && sec > 1 ? Math.round(sec) : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const uid = parseKmUid(url);
  if (!uid) return NextResponse.json({ error: "Could not parse UID from URL" }, { status: 400 });

  try {
    const unit = await fetchContentUnit(uid);
    const files = unit.files ?? [];

    const heMp4 = findHebrewMp4(files);
    const heVideo = heMp4 ?? files.find((f) => f.language === "he" && f.type === "video");
    // KM occasionally has unindexed legacy recordings where every file (across all languages)
    // reports duration: 1 — not a real duration, so treat it as missing rather than showing
    // a misleading "00:00:01", and fall back to probing the mp4 file itself.
    let durationSec = heVideo?.duration != null && heVideo.duration > 1 ? heVideo.duration : null;
    if (durationSec == null && heMp4) {
      durationSec = await probeMp4DurationSec(`https://cdn.kabbalahmedia.info/${heMp4.id}`);
    }

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
      videoLink: extractVideoLink(files),
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
