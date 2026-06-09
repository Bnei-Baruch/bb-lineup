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
