import { redirect } from "next/navigation";
import { todayInIsrael, weekStartParam } from "@/lib/dates";

export const dynamic = "force-dynamic";

// Fixed URL for a broadcast display: always resolves to today's first session (session 0).
export default function TodayRedirectPage() {
  const today = todayInIsrael();
  const weekStart = weekStartParam(today);
  const dayOfWeek = today.getUTCDay();
  redirect(`/lineup/${weekStart}/day/${dayOfWeek}`);
}
