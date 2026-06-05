import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const COL_BROADCAST_DATE = 1;
const COL_STATUS = 2;
const COL_LESSON_LINK = 6;
const COL_TRANSCRIPTION_LINK = 7;

function parseBroadcastDate(raw: string, year: number): Date | null {
  const match = raw.match(/(\d{1,2})\.(\d{1,2})/);
  if (!match) return null;
  const day = parseInt(match[1]);
  const month = parseInt(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function mapStatus(hebrew: string): string {
  const h = hebrew.trim();
  if (h === "מאושר") return "approved";
  if (h === "מצונזר") return "censored";
  return "pending";
}

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

function parseKmUid(url: string): string | null {
  const cuMatch = url.match(/\/cu\/([A-Za-z0-9_-]+)/);
  if (cuMatch) return cuMatch[1];
  const fallback = url.match(
    /kabbalahmedia\.info\/(?:[a-z]{2}\/)?(?:lessons|programs|events|plays|video)\/([A-Za-z0-9_-]+)(?:[?#]|$)/
  );
  return fallback ? fallback[1] : null;
}

async function fetchKmUnit(uid: string): Promise<Record<string, unknown>> {
  const res = await fetch(
    `https://kabbalahmedia.info/backend/content_units/${uid}?with_files=true&with_sources=true&ui_language=he&content_languages=he`
  );
  if (!res.ok) throw new Error(`KabMedia ${res.status} for uid ${uid}`);
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
  function findPath(
    nodes: Array<{ id: string; name: string; full_name?: string; children?: unknown[] }>,
    id: string,
    path: string
  ): string | null {
    for (const node of nodes) {
      const label = node.full_name || node.name;
      const currentPath = path ? `${path} | ${label}` : label;
      if (node.id === id) return currentPath;
      if (node.children?.length) {
        const found = findPath(node.children as typeof nodes, id, currentPath);
        if (found) return found;
      }
    }
    return null;
  }
  return findPath(_sourceTree!, sourceId, "");
}

const WPM = 77;

async function fetchWordCount(
  sourceId: string,
  baseUrl: string
): Promise<{ wordCount: number; durationSec: number } | null> {
  try {
    const row = await prisma.articleSource.findUnique({
      where: { id: sourceId },
      select: { wordCount: true },
    });
    if (row?.wordCount) {
      return { wordCount: row.wordCount, durationSec: Math.round(row.wordCount / WPM * 60) };
    }
  } catch { /* fall through */ }
  try {
    const res = await fetch(`${baseUrl}/api/km/source-wordcount?source_id=${sourceId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.wordCount ? data : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    url: urlArg,
    gid: gidArg = "1066072488",
    year: yearArg,
    skipRows = 7,
    seriesId,
    dryRun = false,
  } = body;

  const year = yearArg ? parseInt(yearArg) : new Date().getFullYear();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const log: string[] = [];

  // Reset source tree cache per request
  _sourceTree = null;

  // Fetch CSV
  let csvContent: string;
  try {
    const sheetId = urlArg?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? "16zwyyw0jrTXDwMiYkMHFqTagGFqutrnacVZB0LhdR-g";
    const gid = urlArg?.match(/gid=(\d+)/)?.[1] ?? gidArg;
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const res = await fetch(exportUrl);
    if (!res.ok) return NextResponse.json({ error: `Failed to fetch spreadsheet: ${res.status}` }, { status: 400 });
    csvContent = await res.text();
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  const allRows = parseCSV(csvContent);
  const dataRows = allRows.slice(skipRows).filter((r) => r.some((c) => c.trim()));

  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const row of dataRows) {
    const rawLink = row[COL_LESSON_LINK]?.trim() ?? "";
    const rawBroadcastDate = row[COL_BROADCAST_DATE]?.trim() ?? "";
    const rawStatus = row[COL_STATUS]?.trim() ?? "";
    const sheetTranscription = row[COL_TRANSCRIPTION_LINK]?.trim() || null;

    if (!rawLink.includes("kabbalahmedia.info")) { skipped++; continue; }

    const kmUid = parseKmUid(rawLink);
    if (!kmUid) {
      log.push(`SKIP: Cannot parse kmUid from: ${rawLink}`);
      skipped++;
      continue;
    }

    const broadcastDate = parseBroadcastDate(rawBroadcastDate, year);
    const isPast = broadcastDate ? broadcastDate < new Date() : false;
    const approvalStatus = isPast ? "used" : mapStatus(rawStatus);

    try {
      const existing = await prisma.lesson.findUnique({ where: { kmUid }, select: { id: true } });

      if (existing) {
        const updateData: Record<string, unknown> = { approvalStatus };
        if (broadcastDate) updateData.broadcastDate = broadcastDate;
        if (sheetTranscription) updateData.transcriptionLink = sheetTranscription;
        if (!dryRun) await prisma.lesson.update({ where: { id: existing.id }, data: updateData });
        log.push(`UPDATE ${kmUid}: status=${approvalStatus}${broadcastDate ? `, date=${broadcastDate.toISOString().slice(0, 10)}` : ""}`);
        updated++;
      } else {
        let unit: Record<string, unknown>;
        try {
          unit = await fetchKmUnit(kmUid);
        } catch (e) {
          log.push(`ERROR ${kmUid}: ${e}`);
          errors++;
          continue;
        }

        const sourceId = (unit.sources as string[])?.[0] ?? null;
        const articleSourceLink = sourceId ? `https://kabbalahmedia.info/sources/${sourceId}` : null;
        const kmPageLink = `https://kabbalahmedia.info/he/lessons/cu/${kmUid}`;

        let articleWordCount: number | null = null;
        let articleReadingSec: number | null = null;
        let articleReadingMin: number | null = null;
        if (sourceId) {
          const wc = await fetchWordCount(sourceId, baseUrl);
          if (wc) {
            articleWordCount = wc.wordCount;
            articleReadingSec = wc.durationSec;
            articleReadingMin = Math.round(wc.durationSec / 60);
          }
        }

        let articleSourceRef: string | null = null;
        if (sourceId) {
          articleSourceRef = await resolveSourceRef(sourceId);
          if (!dryRun) {
            await prisma.articleSource.upsert({
              where: { id: sourceId },
              create: {
                id: sourceId,
                ref: articleSourceRef ?? "",
                link: articleSourceLink,
                ...(articleWordCount  != null ? { wordCount:  articleWordCount  } : {}),
                ...(articleReadingSec != null ? { readingSec: articleReadingSec } : {}),
              },
              update: {
                ...(articleSourceRef ? { ref: articleSourceRef } : {}),
                link: articleSourceLink,
                ...(articleWordCount  != null ? { wordCount:  articleWordCount  } : {}),
                ...(articleReadingSec != null ? { readingSec: articleReadingSec } : {}),
              },
            });
          }
        }

        type KmFile = { language: string; type: string; name?: string; mimetype?: string; duration?: number };
        const files = (unit.files as KmFile[] | undefined) ?? [];
        const heVideo = files.find((f) => f.language === "he" && f.type === "video");
        const narratorName = heVideo?.name?.split("_")[2] ?? null;
        const videoDurationSec = heVideo?.duration != null ? Math.round(heVideo.duration) : (unit.duration ? Math.round(unit.duration as number) : null);
        const hasDocx = files.some(
          (f) => f.name?.endsWith(".docx") || f.mimetype?.includes("wordprocessingml") || f.mimetype?.includes("msword")
        );
        const transcriptionLink = sheetTranscription
          ?? (hasDocx ? `https://kabbalahmedia.info/he/lessons/cu/${kmUid}?activeTab=transcription` : null);

        const data: Record<string, unknown> = {
          kmUid, kmPageLink,
          sourceRef: (unit.name as string) ?? null,
          recordingDate: unit.film_date ? new Date(unit.film_date as string) : null,
          videoDurationSec,
          narratorName, transcriptionLink,
          articleSourceId: sourceId, articleSourceRef, articleSourceLink,
          articleWordCount, articleReadingSec, articleReadingMin,
          approvalStatus,
          ...(broadcastDate ? { broadcastDate } : {}),
          ...(seriesId ? { seriesId } : {}),
        };

        if (!dryRun) await prisma.lesson.create({ data });
        log.push(`CREATE ${kmUid}: "${unit.name ?? kmUid}"`);
        created++;
      }
    } catch (e) {
      log.push(`ERROR ${kmUid}: ${e}`);
      errors++;
    }
  }

  return NextResponse.json({ created, updated, skipped, errors, total: dataRows.length, log, dryRun });
}
