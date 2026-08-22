/** Parses "HH:MM" or "HH:MM:SS" into seconds since midnight. */
export function timeToSeconds(hhmm: string): number {
  const parts = hhmm.split(":").map(Number);
  return parts[0] * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

/** Seconds spanned by a broadcast window, handling windows that cross midnight. */
export function computeDayTotalSec(startTime: string, endTime: string): number {
  let window = timeToSeconds(endTime) - timeToSeconds(startTime);
  if (window < 0) window += 24 * 3600;
  return window;
}

export interface RemainingBudgetInput {
  broadcastStartTime: string;
  broadcastEndTime: string;
  /** Sum of fixed/live/continuous items BEFORE the content-start marker — reduces the window,
   *  same as DayTimeSummary's preContentSec, but doesn't count toward the content total itself. */
  preContentSec: number;
  /** Sums for items WITHIN the content window (contentStartIndex..contentCutoffIndex). Items at
   *  or after the cutoff are excluded entirely from the budget, matching DayTimeSummary — it
   *  doesn't count them either, so they must not silently inflate or shrink this calculation. */
  fixedItemsSec: number;
  continuousActualSec: number;
  liveAuthoredSec: number;
}

/** Whatever's left of the day's fixed total once fixed items, continuous-series lessons (their
 *  actual natural length), and live items (their authored planned estimate) are subtracted —
 *  this is the target a pickable-series lesson should try to fill. Same subtraction
 *  DayTimeSummary does for display, run here proactively before content is chosen. */
export function computeRemainingForPickableSec(input: RemainingBudgetInput): number {
  const dayTotalSec = computeDayTotalSec(input.broadcastStartTime, input.broadcastEndTime);
  return dayTotalSec - input.preContentSec - input.fixedItemsSec - input.continuousActualSec - input.liveAuthoredSec;
}

/** Distributes a (possibly negative) slack amount across live items proportionally to their
 *  authored size - the bigger, more open-ended discussion absorbs most of it, a brief transition
 *  barely moves. Clamped at a minimum of 30s each so nothing collapses to nothing/negative.
 *  Shared by the server (actual commit) and the client (live preview) so they never disagree. */
export function distributeSlack(liveInWindow: { index: number; authoredSec: number }[], slackSec: number): Map<number, number> {
  const adjusted = new Map<number, number>();
  if (liveInWindow.length === 0 || slackSec === 0) return adjusted;
  const totalAuthored = liveInWindow.reduce((sum, l) => sum + l.authoredSec, 0);
  if (totalAuthored === 0) return adjusted;
  const MIN_SEC = 30;
  for (const l of liveInWindow) {
    const share = slackSec * (l.authoredSec / totalAuthored);
    adjusted.set(l.index, Math.max(MIN_SEC, l.authoredSec + share));
  }
  return adjusted;
}
