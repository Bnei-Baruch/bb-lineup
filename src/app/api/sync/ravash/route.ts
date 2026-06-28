import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const SHEET_ID = "16zwyyw0jrTXDwMiYkMHFqTagGFqutrnacVZB0LhdR-g";
const SHEET_GID = "1066072488";
const SERIES_NAME = "מאמרי רב״ש";
const SKIP_ROWS = 6;

// Column indices (0-based)
const C_BROADCAST_DATE = 1;   // "ראשון, 21.6.2026"
const C_STATUS = 2;            // "מאושר" / "מצונזר..."
const C_RECORDING_DATE = 4;   // "22-05-2002" or "28.3.2003"
const C_SOURCE_REF = 5;        // lesson title
const C_ARTICLE_SOURCE = 6;   // https://kabbalahmedia.info/sources/...
const C_LESSON_LINK = 7;       // https://kabbalahmedia.info/he/lessons/cu/...
const C_TRANSCRIPTION = 8;    // Google Docs link (Hebrew transcription)
const C_VIDEO_DURATION = 10;  // HH:MM:SS
const C_READING_TIME = 12;    // HH:MM:SS

export const dynamic = "force-dynamic";

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") { field += c; }
    }
  }
  if (field || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseBroadcastDate(raw: string): Date | null {
  // Handles "ראשון, 21.6.2026" or plain "21.6.2026" or "21.06.2026"
  const match = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return null;
  const [, d, m, y] = match;
  return new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d)));
}

function parseRecordingDate(raw: string): Date | null {
  // Handles "22-05-2002" or "28.3.2003"
  const dashMatch = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, d, m, y] = dashMatch;
    return new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d)));
  }
  const dotMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    return new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d)));
  }
  return null;
}

function parseTimecode(raw: string): number | null {
  // "01:23:45" or "01:23" → seconds
  if (!raw) return null;
  const parts = raw.trim().split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return null;
}

function mapStatus(raw: string): string {
  const h = raw.trim();
  if (h === "מאושר") return "approved";
  if (h.startsWith("מצונזר")) return "approved"; // censored+edited → still approved for scheduling
  return "pending";
}

function parseSourceId(url: string): string | null {
  const m = url.match(/\/sources\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

function parseKmUid(url: string): string | null {
  const cu = url.match(/\/cu\/([A-Za-z0-9_-]+)/);
  if (cu) return cu[1];
  const fallback = url.match(
    /kabbalahmedia\.info\/(?:[a-z]{2}\/)?(?:lessons|programs|events|plays|video)\/([A-Za-z0-9_-]+)/
  );
  return fallback ? fallback[1] : null;
}

// ── KabMedia helpers ──────────────────────────────────────────────────────────

async function fetchKmUnit(uid: string): Promise<Record<string, unknown>> {
  const res = await fetch(
    `https://kabbalahmedia.info/backend/content_units/${uid}?with_files=true&with_sources=true&ui_language=he&content_languages=he`
  );
  if (!res.ok) throw new Error(`KM ${res.status} for ${uid}`);
  return res.json();
}

let _sourceTree: Array<{ id: string; name: string; full_name?: string; children?: unknown[] }> | null = null;

async function resolveSourceRef(sourceId: string): Promise<string | null> {
  if (!_sourceTree) {
    try {
      const res = await fetch("https://kabbalahmedia.info/backend/sqdata?language=he");
      if (!res.ok) return null;
      const data = await res.json();
      _sourceTree = data.sources ?? [];
    } catch { return null; }
  }
  function find(
    nodes: typeof _sourceTree,
    id: string,
    path: string
  ): string | null {
    for (const node of nodes!) {
      const label = node.full_name || node.name;
      const cur = path ? `${path} | ${label}` : label;
      if (node.id === id) return cur;
      if (node.children?.length) {
        const hit = find(node.children as typeof _sourceTree, id, cur);
        if (hit) return hit;
      }
    }
    return null;
  }
  return find(_sourceTree!, sourceId, "");
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  _sourceTree = null;
  const log: string[] = [];

  // Resolve series
  const series = await prisma.series.findFirst({
    where: { name: SERIES_NAME },
    select: { id: true },
  });
  if (!series) {
    return NextResponse.json({ error: `Series "${SERIES_NAME}" not found` }, { status: 404 });
  }

  // Fetch CSV
  let csvContent: string;
  try {
    const exportUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
    const res = await fetch(exportUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    csvContent = await res.text();
  } catch (e) {
    return NextResponse.json({ error: `Failed to fetch spreadsheet: ${e}` }, { status: 500 });
  }

  const dataRows = parseCSV(csvContent)
    .slice(SKIP_ROWS)
    .filter((r) => r.some((c) => c.trim()));

  let created = 0, updated = 0, skipped = 0, errors = 0;
  const today = new Date();

  for (const row of dataRows) {
    const rawLessonLink = row[C_LESSON_LINK]?.trim() ?? "";
    const rawArticleLink = row[C_ARTICLE_SOURCE]?.trim() ?? "";
    const rawBroadcastDate = row[C_BROADCAST_DATE]?.trim() ?? "";
    const rawStatus = row[C_STATUS]?.trim() ?? "";
    const rawRecordingDate = row[C_RECORDING_DATE]?.trim() ?? "";
    const rawSourceRef = row[C_SOURCE_REF]?.trim().replace(/\s+/g, " ") ?? "";
    const rawTranscription = row[C_TRANSCRIPTION]?.trim() || null;
    const rawVideoDuration = row[C_VIDEO_DURATION]?.trim() ?? "";
    const rawReadingTime = row[C_READING_TIME]?.trim() ?? "";

    // Must have a lesson link to process
    if (!rawLessonLink.includes("kabbalahmedia.info")) {
      skipped++;
      continue;
    }

    const kmUid = parseKmUid(rawLessonLink);
    if (!kmUid) {
      log.push(`SKIP: cannot parse kmUid from: ${rawLessonLink}`);
      skipped++;
      continue;
    }

    const broadcastDate = parseBroadcastDate(rawBroadcastDate);
    const recordingDate = parseRecordingDate(rawRecordingDate);
    const videoDurationSec = parseTimecode(rawVideoDuration);
    const articleReadingSec = parseTimecode(rawReadingTime);
    const articleReadingMin = articleReadingSec ? Math.ceil(articleReadingSec / 60) : null;
    const isPast = broadcastDate ? broadcastDate < today : false;
    const approvalStatus = isPast ? "used" : mapStatus(rawStatus);

    const articleSourceId = parseSourceId(rawArticleLink);
    const articleSourceLink = articleSourceId
      ? `https://kabbalahmedia.info/sources/${articleSourceId}`
      : (rawArticleLink.includes("kabbalahmedia.info") ? rawArticleLink : null);

    try {
      const existing = await prisma.lesson.findUnique({
        where: { kmUid },
        select: { id: true },
      });

      if (existing) {
        const updateData: Record<string, unknown> = { approvalStatus };
        if (broadcastDate) updateData.broadcastDate = broadcastDate;
        if (rawTranscription) updateData.transcriptionLink = rawTranscription;
        if (videoDurationSec) updateData.videoDurationSec = videoDurationSec;
        if (articleReadingSec) updateData.articleReadingSec = articleReadingSec;
        if (articleReadingMin) updateData.articleReadingMin = articleReadingMin;
        if (rawSourceRef) updateData.sourceRef = rawSourceRef;
        if (recordingDate) updateData.recordingDate = recordingDate;
        if (articleSourceId) {
          updateData.articleSourceId = articleSourceId;
          updateData.articleSourceLink = articleSourceLink;
        }
        await prisma.lesson.update({ where: { id: existing.id }, data: updateData });
        // Supplement articleReadingSec via raw SQL (Prisma client may not know the column)
        if (articleReadingSec) {
          await prisma.$executeRaw`UPDATE "Lesson" SET "articleReadingSec" = ${articleReadingSec} WHERE id = ${existing.id}`;
        }
        log.push(`UPDATE ${kmUid}: ${approvalStatus}${broadcastDate ? ` ${broadcastDate.toISOString().slice(0, 10)}` : ""}`);
        updated++;
      } else {
        // Fetch full unit from KabMedia
        let unit: Record<string, unknown>;
        try {
          unit = await fetchKmUnit(kmUid);
        } catch (e) {
          log.push(`ERROR ${kmUid}: ${e}`);
          errors++;
          continue;
        }

        const kmPageLink = `https://kabbalahmedia.info/he/lessons/cu/${kmUid}`;
        type KmFile = { language: string; type: string; name?: string; mimetype?: string; duration?: number };
        const files = (unit.files as KmFile[]) ?? [];
        const heVideo = files.find((f) => f.language === "he" && f.type === "video");
        const narratorName = heVideo?.name?.split("_")[2] ?? null;
        const kmVideoDuration = heVideo?.duration != null
          ? Math.round(heVideo.duration)
          : (unit.duration ? Math.round(unit.duration as number) : null);
        const finalVideoDuration = videoDurationSec ?? kmVideoDuration;
        const hasDocx = files.some(
          (f) => f.name?.endsWith(".docx") || f.mimetype?.includes("wordprocessingml") || f.mimetype?.includes("msword")
        );
        const transcriptionLink = rawTranscription
          ?? (hasDocx ? `${kmPageLink}?activeTab=transcription` : null);

        // Upsert ArticleSource
        let resolvedSourceRef: string | null = rawSourceRef || null;
        if (articleSourceId) {
          const kmSourceRef = await resolveSourceRef(articleSourceId);
          if (!resolvedSourceRef && kmSourceRef) resolvedSourceRef = kmSourceRef;
          await prisma.articleSource.upsert({
            where: { id: articleSourceId },
            create: {
              id: articleSourceId,
              ref: kmSourceRef ?? rawSourceRef ?? "",
              link: articleSourceLink,
              ...(articleReadingSec ? { readingSec: articleReadingSec } : {}),
            },
            update: {
              ...(kmSourceRef ? { ref: kmSourceRef } : {}),
              link: articleSourceLink,
              ...(articleReadingSec ? { readingSec: articleReadingSec } : {}),
            },
          });
        }

        const data: Record<string, unknown> = {
          kmUid,
          kmPageLink,
          sourceRef: rawSourceRef || (unit.name as string) || null,
          recordingDate: recordingDate ?? (unit.film_date ? new Date(unit.film_date as string) : null),
          videoDurationSec: finalVideoDuration,
          narratorName,
          transcriptionLink,
          articleSourceId,
          articleSourceRef: resolvedSourceRef,
          articleSourceLink,
          articleReadingSec,
          articleReadingMin,
          approvalStatus,
          seriesId: series.id,
          ...(broadcastDate ? { broadcastDate } : {}),
        };

        const created_lesson = await prisma.lesson.create({ data });
        // Supplement articleReadingSec via raw SQL
        if (articleReadingSec) {
          await prisma.$executeRaw`UPDATE "Lesson" SET "articleReadingSec" = ${articleReadingSec} WHERE id = ${created_lesson.id}`;
        }
        log.push(`CREATE ${kmUid}: "${rawSourceRef || unit.name}"`);
        created++;
      }
    } catch (e) {
      log.push(`ERROR ${kmUid}: ${e}`);
      errors++;
    }
  }

  const summary = `+${created} created, ~${updated} updated, ${skipped} skipped, ${errors} errors / ${dataRows.length} rows`;
  console.log(`[sync/ravash] ${summary}`);

  return NextResponse.json({ created, updated, skipped, errors, total: dataRows.length, log, summary });
}
