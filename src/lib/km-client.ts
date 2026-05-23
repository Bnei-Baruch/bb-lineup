const KM_BASE = "https://kabbalahmedia.info";

export interface KmFile {
  id: string;
  name: string;
  language: string;
  mimetype: string;
  type: string;
  duration?: number;
  video_size?: string;
}

export interface KmContentUnit {
  id: string;
  name: string;
  film_date: string;
  duration: number;
  files?: KmFile[];
  sources?: string[];
}

export interface KmSourceNode {
  id: string;
  name: string;
  full_name?: string;
  parent_id?: string;
  children?: KmSourceNode[];
}

export interface KmSourceResult {
  id: string;
  title: string;
  url: string;
}

/** Parse a kabbalahmedia content unit UID from a URL.
 *  Handles formats like:
 *  - /lessons/HKepmhFZ
 *  - /lessons/cu/HKepmhFZ
 *  - /programs/cu/HKepmhFZ
 */
export function parseKmUid(url: string): string | null {
  // Match the ID that comes after /cu/ in any kabbalahmedia URL
  const cuMatch = url.match(/\/cu\/([A-Za-z0-9_-]+)/);
  if (cuMatch) return cuMatch[1];
  // Fallback: last path segment before query string (for bare /lessons/UID format)
  const fallback = url.match(
    /kabbalahmedia\.info\/(?:[a-z]{2}\/)?(?:lessons|programs|events|plays|video)\/([A-Za-z0-9_-]+)(?:[?#]|$)/
  );
  return fallback ? fallback[1] : null;
}

/** Fetch a content unit with files and sources from kmedia backend */
export async function fetchContentUnit(uid: string): Promise<KmContentUnit> {
  const res = await fetch(
    `${KM_BASE}/backend/content_units/${uid}?with_files=true&with_sources=true&ui_language=he&content_languages=he`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) throw new Error(`kmedia content_units error: ${res.status}`);
  return res.json();
}

/** Return the kmedia frontend link for the first source ID, or null */
export function extractSourceLink(sources: string[] | undefined): { id: string; url: string } | null {
  const id = sources?.[0];
  if (!id) return null;
  return { id, url: `${KM_BASE}/sources/${id}` };
}

/** Find the Hebrew video file (prefer HD), return its URL */
export function extractVideoLink(files: KmFile[]): string | null {
  const heVideos = files.filter((f) => f.language === "he" && f.type === "video");
  const hd = heVideos.find((f) => f.video_size === "HD");
  const chosen = hd ?? heVideos[0];
  if (!chosen) return null;
  return `${KM_BASE}/cdn/${chosen.id}`;
}

/** Find the narrator name from a Hebrew video filename (e.g. heb_o_norav_... → "norav") */
export function extractNarrator(files: KmFile[]): string | null {
  const heVideo = files.find((f) => f.language === "he" && f.type === "video");
  if (!heVideo) return null;
  const parts = heVideo.name.split("_");
  // filename pattern: {lang}_{o|t}_{narrator}_{date}_...
  return parts[2] ?? null;
}

/** Find a docx file ID from the files array — prefer Hebrew, fallback to any */
export function findDocxFileId(files: KmFile[]): string | null {
  const isDocx = (f: KmFile) =>
    f.name?.endsWith(".docx") ||
    f.mimetype?.includes("wordprocessingml") ||
    f.mimetype?.includes("msword");
  return (files.find((f) => isDocx(f) && f.language === "he") ?? files.find(isDocx))?.id ?? null;
}

/** Fetch HTML version of a docx file */
export async function fetchDocHtml(fileId: string): Promise<string> {
  const res = await fetch(`${KM_BASE}/assets/api/doc2html/${fileId}`, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`doc2html error: ${res.status}`);
  return res.text();
}

// ─── Source (sqdata) search ───────────────────────────────────────────────────

const LANGS = ["he", "ru", "en", "es"] as const;
const sourceCache = new Map<string, KmSourceNode[]>();

async function fetchSourceTree(lang: string): Promise<KmSourceNode[]> {
  if (sourceCache.has(lang)) return sourceCache.get(lang)!;
  const res = await fetch(`${KM_BASE}/backend/sqdata?language=${lang}`, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const roots: KmSourceNode[] = data.sources ?? [];
  sourceCache.set(lang, roots);
  return roots;
}

function searchTree(
  nodes: KmSourceNode[],
  query: string,
  path: string,
  results: KmSourceResult[],
  seen: Set<string>
) {
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    const label = node.full_name || node.name;
    const currentPath = path ? `${path} | ${label}` : label;
    if (
      node.name.toLowerCase().includes(query) ||
      (node.full_name ?? "").toLowerCase().includes(query)
    ) {
      results.push({
        id: node.id,
        title: currentPath,
        url: `${KM_BASE}/sources/${node.id}`,
      });
      seen.add(node.id);
    }
    if (node.children?.length) {
      searchTree(node.children, query, currentPath, results, seen);
    }
    if (results.length >= 20) return;
  }
}

function findById(nodes: KmSourceNode[], id: string, path: string): KmSourceResult | null {
  for (const node of nodes) {
    const label = node.full_name || node.name;
    const currentPath = path ? `${path} | ${label}` : label;
    if (node.id === id) return { id: node.id, title: currentPath, url: `${KM_BASE}/sources/${node.id}` };
    if (node.children?.length) {
      const found = findById(node.children, id, currentPath);
      if (found) return found;
    }
  }
  return null;
}

/** Look up a source by ID across all language trees */
export async function lookupSourceById(id: string): Promise<KmSourceResult | null> {
  for (const lang of LANGS) {
    const tree = await fetchSourceTree(lang);
    const found = findById(tree, id, "");
    if (found) return found;
  }
  return null;
}

// ─── Collections ─────────────────────────────────────────────────────────────

export interface KmCollectionUnit {
  id: string;
  content_type: string;
  name_in_collection?: string;
  film_date: string;
  name: string;
  duration: number;
  original_language?: string;
}

export interface KmCollection {
  id: string;
  content_type: string;
  name: string;
  start_date?: string;
  end_date?: string;
  source_id?: string;
  content_units: KmCollectionUnit[];
}

/** Parse a collection UID from a kmedia URL or bare UID */
export function parseCollectionUid(input: string): string | null {
  const trimmed = input.trim();
  // Already a bare UID (no slashes or dots)
  if (/^[A-Za-z0-9_-]{6,12}$/.test(trimmed)) return trimmed;
  // Query param: ?id=xxx or &id=xxx
  const idParam = trimmed.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (idParam) return idParam[1];
  // Frontend URL: /series/c/qT4tEx12
  const seriesC = trimmed.match(/\/series\/c\/([A-Za-z0-9_-]+)/);
  if (seriesC) return seriesC[1];
  // Path segment: /collections/xxx
  const pathMatch = trimmed.match(/\/collections\/([A-Za-z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];
  return null;
}

/** Fetch a collection with all its content units */
export async function fetchCollection(uid: string): Promise<KmCollection | null> {
  const res = await fetch(
    `${KM_BASE}/backend/collections?page_size=1&id=${uid}&ui_language=he&content_languages=he`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.collections?.[0] ?? null;
}

export async function searchSources(query: string): Promise<KmSourceResult[]> {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const trees = await Promise.all(LANGS.map(fetchSourceTree));
  const results: KmSourceResult[] = [];
  const seen = new Set<string>();
  for (const tree of trees) {
    searchTree(tree, q, "", results, seen);
    if (results.length >= 20) break;
  }
  return results.slice(0, 20);
}
