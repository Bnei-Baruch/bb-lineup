import { notFound } from "next/navigation";
import DaySessionViewPage from "@/app/lineup/[weekStart]/day/[dayOfWeek]/[sessionIndex]/page";
import { todayInIsrael, weekStartParam } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Fixed URL for a broadcast display: /today/1 = today's first session, /today/2 = second, etc.
// Renders the day view directly (rather than redirecting) so the address bar — and whatever
// users bookmark — stays on /today/N instead of drifting to today's specific date.
export default async function TodaySessionPage({
  params,
}: {
  params: Promise<{ session: string }>;
}) {
  const { session } = await params;
  const sessionNumber = parseInt(session, 10);
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1) notFound();

  const today = todayInIsrael();
  const weekStart = weekStartParam(today);
  const dayOfWeek = String(today.getUTCDay());
  const sessionIndex = String(sessionNumber - 1);
  return DaySessionViewPage({ params: Promise.resolve({ weekStart, dayOfWeek, sessionIndex }) });
}
