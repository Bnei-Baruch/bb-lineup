import { redirect } from "next/navigation";
import { currentWeekParam } from "@/lib/dates";

export default function HomePage() {
  redirect(`/lineup/${currentWeekParam()}`);
}
