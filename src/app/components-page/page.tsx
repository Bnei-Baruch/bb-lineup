import { prisma } from "@/lib/prisma";
import { ComponentTable } from "@/components/components/ComponentTable";

export const dynamic = "force-dynamic";

export default async function ComponentsPage() {
  const components = await prisma.lineupComponent.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });

  return (
    <div className="p-6">
      <ComponentTable components={JSON.parse(JSON.stringify(components))} />
    </div>
  );
}
