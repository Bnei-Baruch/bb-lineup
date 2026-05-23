import { prisma } from "@/lib/prisma";
import { SeriesManager } from "@/components/series/SeriesManager";

export const dynamic = "force-dynamic";

export default async function SeriesPage() {
  const series = await prisma.series.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { lessons: true } } },
  });

  return (
    <div className="p-6">
      <SeriesManager series={JSON.parse(JSON.stringify(series))} />
    </div>
  );
}
