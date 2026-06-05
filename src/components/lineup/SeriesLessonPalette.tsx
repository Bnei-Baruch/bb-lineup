"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDurationSec } from "@/lib/time";

interface LessonRow {
  id: string;
  sourceRef: string | null;
  recordingDate: string | null;
  videoDurationSec: number | null;
  narratorName: string | null;
  approvalStatus: string;
}

interface SeriesRow {
  id: string;
  name: string;
  color: string | null;
  lessons: LessonRow[];
}

interface SeriesLessonPaletteProps {
  series: SeriesRow[];
  onAdd: (lessonId: string, durationSec: number | null) => void;
}

export function SeriesLessonPalette({ series, onAdd }: SeriesLessonPaletteProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  const query = q.trim().toLowerCase();

  return (
    <div className="space-y-1">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="חיפוש שיעור..."
        className="w-full text-xs border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      />

      {series.map((s) => {
        const filtered = query
          ? s.lessons.filter(
              (l) =>
                l.sourceRef?.toLowerCase().includes(query) ||
                l.narratorName?.toLowerCase().includes(query)
            )
          : s.lessons;

        if (query && filtered.length === 0) return null;

        const isOpen = openIds.has(s.id) || !!query;

        return (
          <div key={s.id} className="border border-border rounded-md overflow-hidden">
            <button
              onClick={() => toggle(s.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-semibold bg-muted hover:bg-accent/50 transition-colors text-start"
            >
              {s.color && (
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              )}
              <span className="flex-1 truncate">{s.name}</span>
              <span className="text-muted-foreground">{filtered.length}</span>
              {isOpen ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronLeft className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
            </button>

            {isOpen && (
              <div className="divide-y divide-border">
                {filtered.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-2">אין שיעורים</p>
                )}
                {filtered.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => onAdd(l.id, l.videoDurationSec ?? null)}
                    className={cn(
                      "w-full flex items-start gap-1.5 px-2 py-1.5 text-start text-xs hover:bg-accent/40 transition-colors group",
                      l.approvalStatus === "approved" && "opacity-60"
                    )}
                    title={l.sourceRef ?? undefined}
                  >
                    <Plus className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground group-hover:text-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate leading-tight">{l.sourceRef ?? "—"}</div>
                      <div className="text-muted-foreground flex gap-1.5 mt-0.5">
                        {l.recordingDate && (
                          <span>{l.recordingDate.slice(0, 10)}</span>
                        )}
                        {l.videoDurationSec && (
                          <span>{formatDurationSec(l.videoDurationSec)}</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {series.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          אין סדרות — ייבא מקבלה מדיה
        </p>
      )}
    </div>
  );
}
