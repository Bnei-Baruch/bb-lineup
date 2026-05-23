"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { LessonTable } from "@/components/library/LessonTable";
import { SeriesManager } from "@/components/series/SeriesManager";

interface LessonRow {
  id: string;
  approvalStatus: string;
  recordingDate: Date | null;
  broadcastDate: string | null;
  sourceRef: string | null;
  narratorName: string | null;
  videoDurationSec: number | null;
  articleReadingSec: number | null;
  tags: string | null;
  kmPageLink: string | null;
  articleSourceLink: string | null;
  transcriptionLink: string | null;
  series: { id: string; name: string; color: string | null } | null;
  articleSource: { bookSeries: string | null; bookVolume: number | null; bookPage: number | null } | null;
}

interface SeriesRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  sortOrder: number;
  currentArticleRef: string | null;
  currentLessonRef: string | null;
  currentPage: string | null;
  _count?: { lessons: number };
}

interface Props {
  lessons: LessonRow[];
  series: SeriesRow[];
  currentSlotIds: string[];
  pastSlotIds: string[];
}

type Tab = "lessons" | "series";

export function LibraryClient({ lessons: initial, series, currentSlotIds, pastSlotIds }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("lessons");
  const [lessons, setLessons] = useState(initial);

  async function handleDelete(id: string) {
    if (!confirm("למחוק את השיעור?")) return;
    const res = await fetch(`/api/lessons/${id}`, { method: "DELETE" });
    if (res.status === 409) {
      const data = await res.json();
      alert(data.error);
      return;
    }
    if (res.ok) setLessons((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleBulkStatusChange(ids: string[], status: string) {
    const res = await fetch("/api/lessons/bulk-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    });
    if (!res.ok) return;
    setLessons((prev) => prev.map((l) => ids.includes(l.id) ? { ...l, approvalStatus: status } : l));
  }

  async function handleBulkAssignSeries(ids: string[], seriesId: string | null) {
    const res = await fetch("/api/lessons/bulk-series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, seriesId }),
    });
    if (!res.ok) return;
    const targetSeries = seriesId ? series.find((s) => s.id === seriesId) ?? null : null;
    setLessons((prev) =>
      prev.map((l) =>
        ids.includes(l.id)
          ? { ...l, series: targetSeries ? { id: targetSeries.id, name: targetSeries.name, color: targetSeries.color } : null }
          : l
      )
    );
  }

  async function handleBulkDelete(ids: string[]) {
    if (!confirm(`למחוק ${ids.length} שיעורים?`)) return;
    const res = await fetch("/api/lessons/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setLessons((prev) => prev.filter((l) => !ids.includes(l.id)));
    if (data.skipped > 0) {
      alert(`נמחקו ${data.deleted} שיעורים. ${data.skipped} שיעורים משובצים בתוכנית ולא נמחקו.`);
    }
  }

  const normalized = lessons.map((l) => ({
    ...l,
    recordingDate: l.recordingDate ? l.recordingDate.toISOString() : null,
    series: l.series ?? null,
  }));

  const seriesList = series.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ספרייה</h1>
        {tab === "lessons" && (
          <Link href="/library/new" className={buttonVariants()}>
            <Plus className="me-2 h-4 w-4" />
            שיעור חדש
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["lessons", "series"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "lessons" ? `שיעורים (${lessons.length})` : "סדרות"}
          </button>
        ))}
      </div>

      {tab === "lessons" && (
        <LessonTable
          lessons={normalized}
          seriesList={seriesList}
          currentSlotIds={currentSlotIds}
          pastSlotIds={pastSlotIds}
          onDelete={handleDelete}
          onBulkDelete={handleBulkDelete}
          onBulkStatusChange={handleBulkStatusChange}
          onBulkAssignSeries={handleBulkAssignSeries}
        />
      )}

      {tab === "series" && (
        <SeriesManager
          series={series}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
