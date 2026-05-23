import { prisma } from "@/lib/prisma";
import { LessonForm } from "@/components/library/LessonForm";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewLessonPage() {
  const seriesList = await prisma.series.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/library" className="hover:text-foreground transition-colors">ספריית שיעורים</Link>
        <ChevronRight className="h-4 w-4 rotate-180" />
        <span className="text-foreground">שיעור חדש</span>
      </div>
      <h1 className="text-2xl font-bold">הוספת שיעור חדש</h1>
      <LessonForm seriesList={seriesList} />
    </div>
  );
}
