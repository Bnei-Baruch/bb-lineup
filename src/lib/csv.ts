/** Quote-aware CSV parser. Shared by every Google-Sheets-CSV importer. */
export function parseCSV(content: string): string[][] {
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

/** Fetch a Google Sheets tab as CSV and parse it into rows of cells. */
export async function fetchSheetCsv(sheetId: string, gid: string): Promise<string[][]> {
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(exportUrl);
  if (!res.ok) throw new Error(`Failed to fetch spreadsheet: ${res.status}`);
  const content = await res.text();
  return parseCSV(content);
}

/** Parse a Google Sheets sheetId + gid out of a full sheet URL. */
export function parseSheetUrl(url: string): { sheetId: string; gid: string } | null {
  const sheetId = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!sheetId) return null;
  const gid = url.match(/gid=(\d+)/)?.[1] ?? "0";
  return { sheetId, gid };
}
