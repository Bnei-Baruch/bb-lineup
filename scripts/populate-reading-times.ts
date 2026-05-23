/**
 * Fetches word count + reading time for every ArticleSource that doesn't
 * have it yet, by calling the KabMedia docx→HTML API directly.
 *
 * Usage:
 *   npx tsx scripts/populate-reading-times.ts [--dry-run] [--concurrency=5]
 *
 * The script processes sources in parallel (default 5 at a time) with a
 * small delay between batches to avoid hammering the API.
 */

import { createClient } from "@libsql/client";
import path from "path";

const DB_PATH = path.resolve(__dirname, "../prisma/lineup.db");
const DRY_RUN = process.argv.includes("--dry-run");
const concurrencyArg = process.argv.find((a) => a.startsWith("--concurrency="));
const CONCURRENCY = concurrencyArg ? parseInt(concurrencyArg.split("=")[1]) : 5;
const KM_BASE = "https://kabbalahmedia.info";
const WPM = 80;

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

type KmFile = {
  id: string;
  name?: string;
  mimetype?: string;
  language?: string;
};

function findDocx(files: KmFile[]): KmFile | null {
  const isDocx = (f: KmFile) =>
    f.name?.endsWith(".docx") ||
    f.mimetype?.includes("wordprocessingml") ||
    f.mimetype?.includes("msword");
  return (
    files.find((f) => isDocx(f) && f.language === "he") ??
    files.find(isDocx) ??
    null
  );
}

async function fetchWordCount(
  sourceId: string
): Promise<{ wordCount: number; readingSec: number } | null> {
  try {
    const unitRes = await fetch(
      `${KM_BASE}/backend/content_units/${sourceId}?with_files=true&ui_language=he&content_languages=he`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!unitRes.ok) return null;

    const unit = await unitRes.json();
    const files: KmFile[] = unit.files ?? [];
    const docx = findDocx(files);
    if (!docx) return null;

    const htmlRes = await fetch(
      `${KM_BASE}/assets/api/doc2html/${docx.id}`,
      { signal: AbortSignal.timeout(30_000) }
    );
    if (!htmlRes.ok) return null;

    const html = await htmlRes.text();
    const wordCount = countWords(stripHtml(html));
    if (wordCount === 0) return null;

    const readingSec = Math.round((wordCount / WPM) * 60);
    return { wordCount, readingSec };
  } catch {
    return null;
  }
}

/** Run an array of async tasks with limited concurrency */
async function runConcurrent<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = createClient({ url: `file:${DB_PATH}` });

  // Enable WAL mode for concurrent access with the dev server
  await db.execute("PRAGMA journal_mode=WAL");
  await db.execute("PRAGMA busy_timeout=5000");

  const { rows } = await db.execute(
    "SELECT id FROM ArticleSource WHERE readingSec IS NULL OR wordCount IS NULL ORDER BY id"
  );
  const ids = rows.map((r) => r.id as string);
  console.log(`Sources missing reading time: ${ids.length}`);
  if (DRY_RUN) { console.log("Dry run — no writes."); db.close(); return; }

  let done = 0, filled = 0, skipped = 0;

  // Process in batches of CONCURRENCY
  const BATCH = CONCURRENCY * 4; // fetch ahead a bit
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);

    const tasks = chunk.map((id) => async () => {
      const result = await fetchWordCount(id);
      return { id, result };
    });

    const results = await runConcurrent(tasks, CONCURRENCY);

    // Batch-write results (with retry on SQLITE_BUSY)
    const updates = results.filter((r) => r.result !== null);
    if (updates.length > 0) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await db.batch(
            updates.map(({ id, result }) => ({
              sql: "UPDATE ArticleSource SET wordCount = ?, readingSec = ? WHERE id = ?",
              args: [result!.wordCount, result!.readingSec, id],
            })),
            "write"
          );
          break;
        } catch (e: unknown) {
          if (attempt < 4 && (e as { code?: string }).code === "SQLITE_BUSY") {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          } else throw e;
        }
      }
      filled += updates.length;
    }
    skipped += results.filter((r) => r.result === null).length;
    done += chunk.length;

    process.stdout.write(
      `\r${done}/${ids.length}  filled=${filled}  skipped=${skipped}`
    );

    // Small pause between batches
    if (i + BATCH < ids.length) await new Promise((r) => setTimeout(r, 200));
  }

  db.close();
  console.log(`\nDone. Filled: ${filled}, Skipped (no docx): ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
