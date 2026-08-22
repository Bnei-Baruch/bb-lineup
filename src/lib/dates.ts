export const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const EN_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Normalize a date to the Sunday of its week at UTC midnight */
export function toWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Format a week-start date as YYYY-MM-DD for use in URL params */
export function weekStartParam(date: Date): string {
  return toWeekStart(date).toISOString().slice(0, 10);
}

/** Parse a YYYY-MM-DD string to a Date (UTC midnight) */
export function parseWeekParam(param: string): Date {
  return new Date(param + "T00:00:00.000Z");
}

/** Get the current week's Sunday as a YYYY-MM-DD string */
export function currentWeekParam(): string {
  return weekStartParam(new Date());
}

/** Convert an ISO-8601 timestamp to seconds-since-midnight in Asia/Jerusalem */
export function isoToIsraelSec(iso: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("he", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");
  const s = parseInt(parts.find((p) => p.type === "second")?.value ?? "0");
  return h * 3600 + m * 60 + s;
}

/** Today's date in Asia/Jerusalem, as a UTC-midnight Date (avoids off-by-one near midnight on UTC servers) */
export function todayInIsrael(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
}

/** Format a date as DD.MM.YY */
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = String(d.getUTCFullYear()).slice(2);
  return `${day}.${month}.${year}`;
}

/** Get the date of a specific day within a week */
export function dayDate(weekStart: Date, dayOfWeek: number): Date {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + dayOfWeek);
  return d;
}

/** Hebrew/English part-of-day label derived from a session's "HH:MM[:SS]" broadcast start time */
export function timeOfDayLabel(time: string | null | undefined): { he: string; en: string } {
  const hour = time ? parseInt(time.split(":")[0], 10) : NaN;
  if (isNaN(hour)) return { he: "שיעור", en: "Lesson" };
  if (hour < 12) return { he: "בוקר", en: "Morning" };
  if (hour < 17) return { he: "צהריים", en: "Afternoon" };
  if (hour < 21) return { he: "ערב", en: "Evening" };
  return { he: "לילה", en: "Night" };
}
