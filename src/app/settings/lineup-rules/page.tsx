import { prisma } from "@/lib/prisma";
import { RuleSetManager } from "@/components/ai/RuleSetManager";

export const dynamic = "force-dynamic";

export default async function LineupRulesPage() {
  const [ruleSets, series, components] = await Promise.all([
    prisma.lineupRuleSet.findMany({ orderBy: { name: "asc" } }),
    prisma.series.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } }),
    prisma.lineupComponent.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, slotType: true, category: true, defaultDurationSec: true },
    }),
  ]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">תבניות תכנון</h1>
        <p className="text-sm text-muted-foreground mt-1">הגדר תבניות לינאפ ומגבלות לתכנון AI</p>
      </div>
      <RuleSetManager
        initialRuleSets={JSON.parse(JSON.stringify(ruleSets))}
        series={series}
        components={components}
      />
    </div>
  );
}
