import { prisma } from "@/lib/prisma";
import { ComponentTable } from "@/components/components/ComponentTable";

export const dynamic = "force-dynamic";

export default async function ComponentsPage() {
  const components = await prisma.lineupComponent.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });

  const links = await prisma.$queryRaw<{ id: string; defaultLineupLink: string | null }[]>`
    SELECT id, defaultLineupLink FROM "LineupComponent"
  `.catch(() => [] as { id: string; defaultLineupLink: string | null }[]);
  const linkMap = Object.fromEntries(links.map((r) => [r.id, r.defaultLineupLink]));

  const rows = components.map((c) => ({ ...c, defaultLineupLink: linkMap[c.id] ?? null }));

  return (
    <div className="p-6">
      <ComponentTable components={JSON.parse(JSON.stringify(rows))} />
    </div>
  );
}
