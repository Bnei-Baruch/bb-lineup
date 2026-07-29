import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseSheetUrl, fetchSheetCsv } from "@/lib/csv";
import {
  parseKmUid,
  fetchContentUnit,
  extractVideoLink,
  extractNarrator,
  extractSourceLink,
  lookupSourceById,
  findDocxFileId,
} from "@/lib/km-client";

const KM_BASE = "https://kabbalahmedia.info";

function mapApprovalStatus(hebrew: string): string {
  const h = hebrew.trim();
  if (h === "מאושר") return "approved";
  if (h === "מצונזר") return "censored";
  return "pending";
}

/** Parses D-M-YYYY or D.M.YYYY (the sheet's תאריך column format) */
function parseRowDate(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{1,2})[-.](\d{1,2})[-.](\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1]);
  const month = parseInt(m[2]);
  const year = parseInt(m[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function slugify(name: string): string {
  const slug = name
    .replace(/[^א-תa-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || `series-${Date.now()}`;
}

function normalizeTimecode(tc: string): string {
  return tc.split(":").map((p) => p.padStart(2, "0")).join(":");
}

/** Parses a part's freeform Hebrew time-range description into a start/end timecode pair.
 *  Handles: "מההתחלה עד דקה HH:MM:SS" (from the beginning) and "מדקה HH:MM:SS עד דקה HH:MM:SS". */
function parsePartTimeRange(text: string): { start: string; end: string } | null {
  const main = text.split(/זמנים\s*:/)[0];

  const fromStart = main.match(/מההתחלה[\s\S]*?(\d{1,2}:\d{2}:\d{2})/);
  if (fromStart) {
    return { start: "00:00:00", end: normalizeTimecode(fromStart[1]) };
  }
  const range = main.match(/(\d{1,2}:\d{2}:\d{2})[\s\S]*?עד[\s\S]*?(\d{1,2}:\d{2}:\d{2})/);
  if (range) {
    return { start: normalizeTimecode(range[1]), end: normalizeTimecode(range[2]) };
  }
  return null;
}

interface PartCol {
  partNumber: number;
  dateColIdx: number | null;
  contentColIdx: number;
}

interface ParsedColumns {
  status: number;
  date: number;
  num: number;
  lesson: number;
  sourceReading: number;
  link: number;
  transcript: number;
  duration: number;
  notes: number;
  parts: PartCol[];
}

function findCol(header: string[], label: string): number {
  return header.findIndex((h) => h.trim() === label);
}

/** Header-driven column detection — locates the fixed columns by name, then scans
 *  the remaining headers for (תאריך שידור, חלק N) pairs. Handles sheets where a
 *  part doesn't have its own preceding date column (it inherits the last one seen),
 *  so this works regardless of how many parts a given sheet has. */
function parseColumns(header: string[]): ParsedColumns {
  const status = findCol(header, "צנזורה");
  const date = header.findIndex((h) => h.trim() === "תאריך");
  const num = findCol(header, "מס'");
  const lesson = findCol(header, "שיעור");
  const sourceReading = findCol(header, "קריאת מקורות");
  const link = findCol(header, "קישור");
  const transcript = findCol(header, "תמליל");
  const duration = findCol(header, "זמנים");
  const notes = findCol(header, "הערות");

  const parts: PartCol[] = [];
  let lastDateCol: number | null = null;
  const startScan = duration !== -1 ? duration + 1 : 0;
  for (let i = startScan; i < header.length; i++) {
    const h = header[i].trim();
    if (h === "הערות") break;
    if (h === "תאריך שידור") { lastDateCol = i; continue; }
    const partMatch = h.match(/^חלק\s*(\d+)/);
    if (partMatch) {
      parts.push({ partNumber: parseInt(partMatch[1]), dateColIdx: lastDateCol, contentColIdx: i });
    }
  }

  return { status, date, num, lesson, sourceReading, link, transcript, duration, notes, parts };
}

interface PendingRow {
  rowIdx: number;
  kmUid: string;
  seriesName: string;
  lessonTitle: string;
  recordingDate: Date | null;
  approvalStatus: string;
  sheetTranscription: string | null;
  sourceReadingNote: string | null;
  parts: { partNumber: number; broadcastDate: string | null; start: string | null; end: string | null; raw: string }[];
}

export async function POST(req: NextRequest) {
  const { url, color } = await req.json();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const parsedUrl = parseSheetUrl(url);
  if (!parsedUrl) return NextResponse.json({ error: "Could not parse sheet URL" }, { status: 400 });

  let rows: string[][];
  try {
    rows = await fetchSheetCsv(parsedUrl.sheetId, parsedUrl.gid);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
  if (rows.length === 0) return NextResponse.json({ error: "Empty sheet" }, { status: 400 });

  const cols = parseColumns(rows[0]);
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim()));

  const errors: { row: number; reason: string }[] = [];
  const pending: PendingRow[] = [];
  let currentSeriesName: string | null = null;
  let noPartsSkipped = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const numCell = cols.num !== -1 ? (row[cols.num]?.trim() ?? "") : "";
    const lessonCell = cols.lesson !== -1 ? (row[cols.lesson]?.trim() ?? "") : "";
    const linkCell = cols.link !== -1 ? (row[cols.link]?.trim() ?? "") : "";
    const firstCell = row[0]?.trim() ?? "";

    // Series-header row: no lesson number/title/link, but the first cell has text
    if (!numCell && !lessonCell && !linkCell && firstCell) {
      currentSeriesName = firstCell;
      continue;
    }

    if (!linkCell) continue;

    // Only import lessons that actually have at least one part filled in
    const filledParts = cols.parts
      .map((part) => ({ part, content: row[part.contentColIdx]?.trim() ?? "" }))
      .filter(({ content }) => content);
    if (filledParts.length === 0) { noPartsSkipped++; continue; }

    if (!linkCell.includes("kabbalahmedia.info")) {
      errors.push({ row: i + 2, reason: `Link is not a KabbalaMedia link: ${linkCell}` });
      continue;
    }
    if (!currentSeriesName) {
      errors.push({ row: i + 2, reason: "No series header row found above this row" });
      continue;
    }

    const kmUid = parseKmUid(linkCell);
    if (!kmUid) {
      errors.push({ row: i + 2, reason: `Could not parse KM id from link: ${linkCell}` });
      continue;
    }

    const recordingDate = cols.date !== -1 ? parseRowDate(row[cols.date] ?? "") : null;
    const approvalStatus = cols.status !== -1 ? mapApprovalStatus(row[cols.status] ?? "") : "pending";
    const sheetTranscription = cols.transcript !== -1 ? (row[cols.transcript]?.trim() || null) : null;
    const sourceReadingNote = cols.sourceReading !== -1 ? (row[cols.sourceReading]?.trim() || null) : null;

    const parts = filledParts.map(({ part, content }) => {
      const range = parsePartTimeRange(content);
      const broadcastDate = part.dateColIdx != null ? (row[part.dateColIdx]?.trim() || null) : null;
      return {
        partNumber: part.partNumber,
        broadcastDate,
        start: range?.start ?? null,
        end: range?.end ?? null,
        raw: content.replace(/\s*\n\s*/g, " "),
      };
    });

    pending.push({
      rowIdx: i + 2,
      kmUid,
      seriesName: currentSeriesName,
      lessonTitle: lessonCell,
      recordingDate,
      approvalStatus,
      sheetTranscription,
      sourceReadingNote,
      parts,
    });
  }

  // Dedup against already-imported lessons — keyed on the row's kmUid (stored only on
  // that row's first part), so re-running the import skips the whole group together.
  const existingUids = new Set(
    pending.length
      ? (await prisma.lesson.findMany({
          where: { kmUid: { in: pending.map((p) => p.kmUid) } },
          select: { kmUid: true },
        })).map((l) => l.kmUid)
      : []
  );
  const toImport = pending.filter((p) => !existingUids.has(p.kmUid));
  const rowsSkipped = pending.length - toImport.length;

  // Find-or-create every series encountered
  const seriesByName = new Map<string, { id: string }>();
  const seriesCreated: string[] = [];
  for (const seriesName of Array.from(new Set(toImport.map((p) => p.seriesName)))) {
    let series = await prisma.series.findUnique({ where: { name: seriesName } });
    if (!series) {
      const count = await prisma.series.count();
      series = await prisma.series.create({
        data: { name: seriesName, slug: slugify(seriesName), color: color ?? null, sortOrder: count },
      });
      seriesCreated.push(series.name);
    }
    seriesByName.set(seriesName, series);
  }

  // Fetch KM metadata once per row (shared across all of that row's parts)
  interface RowFetch {
    p: PendingRow;
    sourceRef: string | null;
    videoDurationSec: number | null;
    videoLink: string | null;
    narratorName: string | null;
    articleSourceId: string | null;
    articleSourceLink: string | null;
    articleSourceRef: string | null;
    transcriptionLink: string | null;
    filmDate: string | null;
    error: string | null;
  }

  const rowFetches: RowFetch[] = await Promise.all(
    toImport.map(async (p): Promise<RowFetch> => {
      try {
        const unit = await fetchContentUnit(p.kmUid);
        const files = unit.files ?? [];
        const source = extractSourceLink(unit.sources);
        const sourceResult = source ? await lookupSourceById(source.id) : null;
        const hasDocx = findDocxFileId(files) !== null;
        return {
          p,
          sourceRef: unit.name ?? p.lessonTitle,
          videoDurationSec: unit.duration != null ? Math.round(unit.duration) : null,
          videoLink: extractVideoLink(files),
          narratorName: extractNarrator(files),
          articleSourceId: source?.id ?? null,
          articleSourceLink: source?.url ?? null,
          articleSourceRef: sourceResult?.title ?? null,
          transcriptionLink: p.sheetTranscription
            ?? (hasDocx ? `${KM_BASE}/he/lessons/cu/${p.kmUid}?activeTab=transcription` : null),
          filmDate: unit.film_date ?? null,
          error: null,
        };
      } catch (e) {
        return {
          p, sourceRef: p.lessonTitle,
          videoDurationSec: null, videoLink: null, narratorName: null,
          articleSourceId: null, articleSourceLink: null, articleSourceRef: null,
          transcriptionLink: p.sheetTranscription ?? null,
          filmDate: null,
          error: String(e),
        };
      }
    })
  );

  for (const r of rowFetches) {
    if (r.error) errors.push({ row: r.p.rowIdx, reason: r.error });
  }

  const rowsToCreate = rowFetches.filter((r) => !r.error);
  const lessonData = rowsToCreate.flatMap((r) => {
    const recordingDate = r.p.recordingDate ?? (r.filmDate ? new Date(r.filmDate) : null);
    return r.p.parts.map((part, idx) => {
      const noteLines: string[] = [];
      if (r.p.sourceReadingNote) noteLines.push(`קריאת מקורות: ${r.p.sourceReadingNote}`);
      if (part.broadcastDate) noteLines.push(`תאריך שידור מתוכנן: ${part.broadcastDate}`);
      noteLines.push(part.raw);

      return {
        kmUid: idx === 0 ? r.p.kmUid : null,
        kmPageLink: `${KM_BASE}/he/lessons/cu/${r.p.kmUid}`,
        sourceRef: `${r.sourceRef} - חלק ${part.partNumber}`,
        recordingDate,
        videoDurationSec: r.videoDurationSec,
        videoLink: r.videoLink,
        narratorName: r.narratorName,
        articleSourceId: r.articleSourceId,
        articleSourceRef: r.articleSourceRef,
        articleSourceLink: r.articleSourceLink,
        transcriptionLink: r.transcriptionLink,
        approvalStatus: r.p.approvalStatus,
        startTimecode: part.start,
        endTimecode: part.end,
        initialNotes: noteLines.join("\n"),
        seriesId: seriesByName.get(r.p.seriesName)!.id,
      };
    });
  });

  if (lessonData.length > 0) {
    await prisma.lesson.createMany({ data: lessonData });
  }

  return NextResponse.json(
    {
      seriesCreated,
      lessonsImported: lessonData.length,
      rowsSkipped,
      noPartsSkipped,
      errors,
    },
    { status: 201 }
  );
}
