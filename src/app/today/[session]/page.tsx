import { redirect, notFound } from "next/navigation";
import { todayInIsrael, weekStartParam } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Fixed URL for a broadcast display: /today/1 = today's first session, /today/2 = second, etc.
export default async function TodaySessionRedirectPage({
  params,
}: {
  params: Promise<{ session: string }>;
}) {
  const { session } = await params;
  const sessionNumber = parseInt(session, 10);
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1) notFound();

  const today = todayInIsrael();
  const weekStart = weekStartParam(today);
  const dayOfWeek = today.getUTCDay();
  const sessionIndex = sessionNumber - 1;
  redirect(`/lineup/${weekStart}/day/${dayOfWeek}/${sessionIndex}`);
}
