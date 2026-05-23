import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { LessonForm } from "@/components/library/LessonForm";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lesson, seriesList] = await Promise.all([
    prisma.lesson.findUnique({ where: { id }, include: { articleSource: true } }),
    prisma.series.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!lesson) notFound();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/library" className="hover:text-foreground transition-colors">ספריית שיעורים</Link>
        <ChevronRight className="h-4 w-4 rotate-180" />
        <span className="text-foreground">עריכת שיעור</span>
      </div>
      <h1 className="text-2xl font-bold">עריכת שיעור</h1>
      <LessonForm lesson={JSON.parse(JSON.stringify(lesson))} seriesList={seriesList} />
    </div>
  );
}
