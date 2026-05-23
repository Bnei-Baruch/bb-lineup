import { prisma } from "@/lib/prisma";
import { WeekTemplateManager } from "@/components/lineup/WeekTemplateManager";

export const dynamic = "force-dynamic";

export default async function WeekTemplatesPage() {
  const [templates, components] = await Promise.all([
    prisma.weekTemplate.findMany({ orderBy: { name: "asc" } }),
    prisma.lineupComponent.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, slotType: true, defaultDurationSec: true },
    }),
  ]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">תבניות שבועיות</h1>
        <p className="text-sm text-muted-foreground mt-1">הגדר תבניות מבנה שבועי ליישום מהיר על לינאפ</p>
      </div>
      <WeekTemplateManager
        initialTemplates={JSON.parse(JSON.stringify(templates))}
        components={components}
      />
    </div>
  );
}
