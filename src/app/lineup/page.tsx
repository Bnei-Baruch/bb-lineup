import { prisma } from "@/lib/prisma";
import { currentWeekParam } from "@/lib/dates";
import { NewWeekButton } from "./NewWeekButton";
import { LineupList } from "./LineupList";
import { CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LineupsPage() {
  const lineups = await prisma.lineup.findMany({
    orderBy: { weekStart: "asc" },
    select: { id: true, weekStart: true, notes: true },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">תוכניות שבועיות</h1>
        <NewWeekButton />
      </div>

      {lineups.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarDays className="mx-auto h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg">אין תוכניות עדיין</p>
          <p className="text-sm mt-1">צור תוכנית חדשה כדי להתחיל</p>
        </div>
      ) : (
        <LineupList lineups={lineups} currentWeekParam={currentWeekParam()} />
      )}
    </div>
  );
}
