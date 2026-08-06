import DaySessionViewPage from "@/app/lineup/[weekStart]/day/[dayOfWeek]/[sessionIndex]/page";
import { prisma } from "@/lib/prisma";
import { todayInIsrael, weekStartParam, parseWeekParam } from "@/lib/dates";

export const dynamic = "force-dynamic";

function currentIsraelTimeHHMM(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")!.value;
  const m = parts.find((p) => p.type === "minute")!.value;
  return `${h}:${m}`;
}

/** The sessionIndex of the first session today that hasn't finished yet (no
 *  broadcastEndTime, or one still ahead of now) — or null once every session
 *  today has ended, or none were ever scheduled. */
async function findUnfinishedSessionToday(date: Date, dayOfWeek: number): Promise<number | null> {
  const lineup = await prisma.lineup.findUnique({
    where: { weekStart: parseWeekParam(weekStartParam(date)) },
    include: {
      days: {
        where: { dayOfWeek },
        orderBy: { sessionIndex: "asc" },
        select: { sessionIndex: true, broadcastEndTime: true },
      },
    },
  });
  if (!lineup || lineup.days.length === 0) return null;
  const now = currentIsraelTimeHHMM();
  const next = lineup.days.find((d) => !d.broadcastEndTime || d.broadcastEndTime >= now);
  return next ? next.sessionIndex : null;
}

// Fixed URL for a broadcast display: shows today's first still-unfinished session —
// not always session 0, so a second session already showing after the first one ended
// doesn't get skipped in favor of the finished one. Once every session today has
// finished (or none were scheduled), rolls forward to tomorrow's first session instead,
// so the same bookmarked link always points at what's next.
// Renders the day view directly (rather than redirecting) so the address bar — and
// whatever users bookmark — stays on /today instead of drifting to today's specific date.
export default async function TodayPage() {
  let date = todayInIsrael();
  let dayOfWeek = date.getUTCDay();
  let sessionIndex = await findUnfinishedSessionToday(date, dayOfWeek);

  if (sessionIndex === null) {
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    dayOfWeek = date.getUTCDay();
    sessionIndex = (await findUnfinishedSessionToday(date, dayOfWeek)) ?? 0;
  }

  const weekStart = weekStartParam(date);
  return DaySessionViewPage({
    params: Promise.resolve({ weekStart, dayOfWeek: String(dayOfWeek), sessionIndex: String(sessionIndex) }),
  });
}
