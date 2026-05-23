import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/dates";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NewWeekButton } from "./NewWeekButton";
import { CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LineupsPage() {
  const lineups = await prisma.lineup.findMany({
    orderBy: { weekStart: "desc" },
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {lineups.map((lineup) => {
            const ws = new Date(lineup.weekStart);
            const we = new Date(ws);
            we.setUTCDate(we.getUTCDate() + 6);
            const param = ws.toISOString().slice(0, 10);
            return (
              <Link key={lineup.id} href={`/lineup/${param}`}>
                <Card className="hover:bg-accent transition-colors cursor-pointer">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base tabular-nums">
                      {formatDate(ws)} – {formatDate(we)}
                    </CardTitle>
                    {lineup.notes && (
                      <CardDescription className="truncate">{lineup.notes}</CardDescription>
                    )}
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
