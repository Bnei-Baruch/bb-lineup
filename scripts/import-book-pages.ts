/**
 * Reads the TOC mapping file, matches each article title against ArticleSource.ref,
 * and updates bookVolume + bookPage.
 *
 * Usage:
 *   npx tsx scripts/import-book-pages.ts [--dry-run]
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import path from "path";

const DB_PATH  = path.resolve(__dirname, "../prisma/lineup.db");
const TOC_PATH = path.resolve(__dirname, "../pdf/כתבי רבש ובעל הסולם מיפוי עמודים.txt");
const DRY_RUN  = process.argv.includes("--dry-run");

interface TocEntry {
  book: string;
  section: string;
  bookVolume: number | null;  // 1/2/3 for כתבי רב"ש, null for כתבי בעל הסולם
  title: string;
  page: number;
}

/** Map section name → כרך volume number */
function getVolume(book: string, section: string): number | null {
  if (!book.includes("רב")) return null;           // כתבי בעל הסולם → null
  if (/תשמ"[דהוזח]/.test(section)) return 1;       // תשמ"ד–תשמ"ח  → כרך א
  if (/תשמ"ט|תש"ן|תשנ"א|אגרות/.test(section)) return 2; // תשמ"ט–תשנ"א + אגרות → כרך ב
  if (/דרגות/.test(section)) return 3;             // דרגות הסולם   → כרך ג
  return null;
}

/** Strip leading Hebrew / Arabic index (e.g. "א. ", "א/ב. ", "17. ", "סא, ") */
function stripIndex(s: string): string {
  return s
    .replace(/^[\u05D0-\u05EA/]+[.,]\s*/, "")  // Hebrew letters + optional /
    .replace(/^\d+\.\s*/, "");                   // Arabic numerals
}

function parseToc(content: string): TocEntry[] {
  const entries: TocEntry[] = [];
  let book = "", section = "";

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("ספר:")) { book = line.slice(4).trim(); section = ""; continue; }
    if (line.startsWith("חלק:")) { section = line.slice(4).trim(); continue; }

    // Entry format: "[index. ]title - PAGE"  (page is the last numeric token)
    const m = line.match(/^(.+?)\s+-\s+(\d+)\s*$/);
    if (!m) continue;

    const page  = parseInt(m[2]);
    const raw   = m[1].trim();
    const title = stripIndex(raw)
      .replace(/\s*\.\.\.\s*$/, "")   // remove trailing "..." (truncated TOC titles)
      .trim();

    if (!title || !page) continue;

    entries.push({ book, section, bookVolume: getVolume(book, section), title, page });
  }

  return entries;
}

/** Normalize string for fuzzy comparison */
function norm(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    // Strip outer quotation marks  (e.g. "במקום שאתה..." → במקום שאתה...)
    .replace(/^["״""](.*?)["״""]$/, "$1")
    // Trailing apostrophe on Hebrew letter: א' → א
    .replace(/ - ([\u05D0-\u05EA]+)'$/, " - $1")
    // Spelling: עניין → ענין
    .replace(/עניין/g, "ענין")
    // Spelling: תפילה/תפילת → תפלה/תפלת (remove extra yod)
    .replace(/תפילה/g, "תפלה")
    .replace(/תפילת/g, "תפלת")
    // Spelling: זהר → זוהר
    .replace(/\bזהר\b/g, "זוהר")
    // Remove commas (TOC sometimes has commas that DB omits)
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Also try "מהו X בעבודה" ↔ "X בעבודה מהו" form */
function altForms(t: string): string[] {
  const alts: string[] = [];
  // "מהו X" → "X מהו"
  const mw = t.match(/^מהו\s+(.+)$/);
  if (mw) alts.push(mw[1] + " מהו");
  // "מהי X" → "X מהי"
  const mi = t.match(/^מהי\s+(.+)$/);
  if (mi) alts.push(mi[1] + " מהי");
  // "X מהו" → "מהו X"
  const wm = t.match(/^(.+)\s+מהו$/);
  if (wm) alts.push("מהו " + wm[1]);
  return alts;
}

/** Hebrew ordinals א=0, ב=1, ג=2 ... */
const HE_ORDINALS = "אבגדהוזחטיכלמנסעפצקרשת";

/** "כותרת (א')" → { base: "כותרת", ord: 0 }; returns null if no variant suffix */
function parseVariant(title: string): { base: string; ord: number } | null {
  const m = title.match(/^(.*?)\s*\(([א-ת])'?\)$/);
  if (!m) return null;
  const ord = HE_ORDINALS.indexOf(m[2]);
  if (ord < 0) return null;
  return { base: m[1].trim(), ord };
}

/** Fetch KabMedia sqdata tree; return author map + DFS position map */
async function buildSourceMaps(sourceIds: string[]): Promise<{
  authorMap: Map<string, "ravash" | "bhs" | "unknown">;
  positionMap: Map<string, number>;
}> {
  const authorMap = new Map<string, "ravash" | "bhs" | "unknown">();
  const positionMap = new Map<string, number>();
  try {
    const res = await fetch("https://kabbalahmedia.info/backend/sqdata?language=he", {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { authorMap, positionMap };
    const data = await res.json();
    const roots: Array<{ id: string; name: string; full_name?: string; children?: unknown[] }> = data.sources ?? [];

    type TreeNode = { id: string; name: string; full_name?: string; children?: unknown[] };
    let pos = 0;
    const walkTree = (nodes: TreeNode[], author: "ravash" | "bhs" | "unknown") => {
      for (const node of nodes) {
        positionMap.set(node.id, pos++);
        if (sourceIds.includes(node.id)) authorMap.set(node.id, author);
        if (node.children?.length) walkTree(node.children as TreeNode[], author);
      }
    };

    for (const root of roots) {
      const name = root.full_name ?? root.name ?? "";
      const author: "ravash" | "bhs" | "unknown" =
        name.includes("ברוך") ? "ravash" :
        name.includes("יהודה") ? "bhs" :
        "unknown";
      walkTree([root], author);
    }
  } catch {
    // If API fails, leave maps empty — matching falls back gracefully
  }
  return { authorMap, positionMap };
}

async function main() {
  const content = readFileSync(TOC_PATH, "utf-8");
  const entries = parseToc(content);
  console.log(`Parsed ${entries.length} TOC entries`);

  const db = createClient({ url: `file:${DB_PATH}` });

  // Load all ArticleSource records into memory
  const { rows } = await db.execute("SELECT id, ref FROM ArticleSource WHERE length(ref) > 0");
  const sources = rows as unknown as { id: string; ref: string }[];

  // Build author + position maps for disambiguation and variant ordering
  process.stdout.write("Fetching KabMedia source tree...");
  const { authorMap, positionMap } = await buildSourceMaps(sources.map((s) => s.id));
  console.log(` done (${authorMap.size} resolved)`);

  /** Return true if source is compatible with TOC book */
  function authorMatches(id: string, book: string): boolean {
    const a = authorMap.get(id);
    if (!a || a === "unknown") return true; // can't determine → allow
    if (book.includes("רב")) return a === "ravash";
    return a === "bhs";
  }

  // Build multi-value exact-match map: normalized ref → [id, ...]
  const exactMap = new Map<string, string[]>();
  for (const s of sources) {
    const k = norm(s.ref);
    const arr = exactMap.get(k);
    if (arr) arr.push(s.id);
    else exactMap.set(k, [s.id]);
  }

  const updates: { id: string; bookVolume: number | null; bookPage: number }[] = [];
  const unmatched: TocEntry[] = [];

  for (const entry of entries) {
    const t = norm(entry.title);

    const filterByAuthor = (ids: string[]) => ids.filter((id) => authorMatches(id, entry.book));

    // 1. Exact match (also try alternate forms)
    let ids = (exactMap.get(t) ?? []).filter((id) => authorMatches(id, entry.book));
    if (!ids.length) {
      for (const alt of altForms(t)) {
        const altIds = filterByAuthor(exactMap.get(alt) ?? []);
        if (altIds.length) { ids = altIds; break; }
      }
    }

    // 2. DB ref starts with text title — unique candidate after author filter
    if (!ids.length) {
      const candidates = filterByAuthor(
        sources.filter(s => norm(s.ref).startsWith(t + " - ") || norm(s.ref) === t).map(s => s.id)
      );
      if (candidates.length === 1) ids = candidates;
    }

    // 3. Text title starts with DB ref
    if (!ids.length) {
      for (const s of sources) {
        const r = norm(s.ref);
        if ((t.startsWith(r + " - ") || t.startsWith(r + ",")) && authorMatches(s.id, entry.book)) {
          ids = [s.id]; break;
        }
      }
    }

    // 4. DB ref starts with text title (truncated TOC) — unique candidate after author filter
    if (!ids.length) {
      const candidates = filterByAuthor(
        sources.filter(s => norm(s.ref).startsWith(t) && norm(s.ref).length > t.length).map(s => s.id)
      );
      if (candidates.length === 1) ids = candidates;
    }

    // 5. Variant suffix: "(א')" = 1st source in tree order, "(ב')" = 2nd, etc.
    //    Handles two DB patterns:
    //    a) multiple sources share the same base ref (sorted by tree position)
    //    b) KabMedia encodes variant in ref: "base - א", "base - ב", ...
    if (!ids.length) {
      const v = parseVariant(t);
      if (v) {
        const base = v.base;
        const letter = HE_ORDINALS[v.ord];

        // 5a. Try direct ref "base - א" (KabMedia-style encoding)
        const dashRef = base + " - " + letter;
        ids = filterByAuthor(exactMap.get(dashRef) ?? []);
        if (!ids.length) {
          for (const alt of altForms(dashRef)) {
            ids = filterByAuthor(exactMap.get(alt) ?? []);
            if (ids.length) break;
          }
        }

        // 5b. Multiple sources share exact base ref — pick by tree position
        if (!ids.length) {
          let candidates = filterByAuthor(exactMap.get(base) ?? []);
          if (!candidates.length) {
            for (const alt of altForms(base)) {
              candidates = filterByAuthor(exactMap.get(alt) ?? []);
              if (candidates.length) break;
            }
          }
          candidates.sort((a, b) => (positionMap.get(a) ?? 0) - (positionMap.get(b) ?? 0));
          if (v.ord < candidates.length) ids = [candidates[v.ord]];
        }
      }
    }

    if (ids.length) {
      for (const id of ids) updates.push({ id, bookVolume: entry.bookVolume, bookPage: entry.page });
    } else {
      unmatched.push(entry);
    }
  }

  console.log(`\nMatched : ${updates.length}`);
  console.log(`Unmatched: ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log("\nAll unmatched:");
    unmatched.forEach(e =>
      console.log(`  [${e.section}] "${e.title}"  p.${e.page}`)
    );
  }

  if (DRY_RUN) {
    console.log("\nDry run — no changes written.");
    db.close();
    return;
  }

  // Batch update
  const BATCH = 200;
  let done = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await db.batch(
      batch.map(({ id, bookVolume, bookPage }) => ({
        sql: "UPDATE ArticleSource SET bookVolume = ?, bookPage = ? WHERE id = ?",
        args: [bookVolume, bookPage, id],
      })),
      "write"
    );
    done += batch.length;
    process.stdout.write(`\r${done}/${updates.length}`);
  }

  db.close();
  console.log(`\nDone. ${done} ArticleSource records updated.`);
}

main().catch(e => { console.error(e); process.exit(1); });
