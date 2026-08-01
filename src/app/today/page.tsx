import DayViewPage from "@/app/lineup/[weekStart]/day/[dayOfWeek]/page";
import { todayInIsrael, weekStartParam } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Fixed URL for a broadcast display: always shows today's first session (session 0).
// Renders the day view directly (rather than redirecting) so the address bar — and
// whatever users bookmark — stays on /today instead of drifting to today's specific date.
export default function TodayPage() {
  const today = todayInIsrael();
  const weekStart = weekStartParam(today);
  const dayOfWeek = String(today.getUTCDay());
  return DayViewPage({ params: Promise.resolve({ weekStart, dayOfWeek }) });
}
