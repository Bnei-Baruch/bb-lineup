/** Parse "HH:MM:SS" or "H:MM:SS" to total seconds */
export function timecodeToSeconds(tc: string): number {
  const parts = tc.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

/** Format total seconds as "H:MM:SS" */
export function secondsToTimecode(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Compute duration between two timecodes, returns "H:MM:SS" */
export function timecodeDuration(start: string, end: string): string {
  const diff = timecodeToSeconds(end) - timecodeToSeconds(start);
  return diff > 0 ? secondsToTimecode(diff) : "0:00:00";
}

/** Add minutes to a time string "HH:MM" or "HH:MM:SS", return "HH:MM:SS" */
export function addMinutesToTime(time: string, minutes: number): string {
  return addSecondsToTime(time, minutes * 60);
}

/** Add seconds to a time string "HH:MM" or "HH:MM:SS", return "HH:MM:SS" */
export function addSecondsToTime(time: string, seconds: number): string {
  const parts = time.split(":").map(Number);
  const totalSec = (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0) + seconds;
  const newH = Math.floor(totalSec / 3600) % 24;
  const newM = Math.floor((totalSec % 3600) / 60);
  const newS = Math.floor(totalSec % 60);
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}:${String(newS).padStart(2, "0")}`;
}
