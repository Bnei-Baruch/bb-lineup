/** Format minutes as HH:MM:SS (e.g. 125 → "02:05:00") */
export function formatDuration(minutes: number): string {
  const totalSec = minutes * 60;
  return formatDurationSec(totalSec);
}

/** Format seconds as HH:MM:SS (e.g. 1969 → "00:32:49") */
export function formatDurationSec(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Parse HH:MM:SS (or HH:MM) string to total seconds */
export function parseDurationToSec(value: string): number | null {
  const parts = value.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return null;
}

/** Count words in a string using the kmedia-mdb reading time formula */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Calculate reading time in minutes from word count (~77 WPM) */
export function readingTimeFromWords(wordCount: number): number {
  return Math.ceil(wordCount / (270 / 3.5));
}

/** Strip HTML tags from a string */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
