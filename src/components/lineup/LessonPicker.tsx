"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/library/StatusBadge";
import { formatDate } from "@/lib/dates";
import { formatDurationSec } from "@/lib/time";
import { LessonSummary } from "@/types";

interface LessonPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (lesson: LessonSummary) => void;
}

export function LessonPicker({ open, onClose, onSelect }: LessonPickerProps) {
  const [q, setQ] = useState("");
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lessons?q=${encodeURIComponent(q)}&pageSize=50`);
        const data = await res.json();
        setLessons(data.lessons ?? []);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [q, open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>בחירת שיעור</DialogTitle>
        </DialogHeader>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש שיעור..."
          autoFocus
        />
        <div className="flex-1 overflow-y-auto border border-border rounded-md divide-y divide-border">
          {loading && (
            <p className="text-center py-6 text-muted-foreground text-sm">טוען...</p>
          )}
          {!loading && lessons.length === 0 && (
            <p className="text-center py-6 text-muted-foreground text-sm">לא נמצאו שיעורים</p>
          )}
          {!loading && lessons.map((l) => (
            <button
              key={l.id}
              className="w-full text-start px-4 py-3 hover:bg-accent transition-colors"
              onClick={() => { onSelect(l); onClose(); }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{l.sourceRef ?? "—"}</p>
                  {l.articleSourceRef && (
                    <p className="text-xs text-blue-600 truncate">{l.articleSourceRef}</p>
                  )}
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    {l.narratorName && <span>{l.narratorName}</span>}
                    {l.recordingDate && <span>{formatDate(l.recordingDate)}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusBadge status={l.approvalStatus} />
                  {l.videoDurationSec && (
                    <span className="text-xs text-muted-foreground">{formatDurationSec(l.videoDurationSec)}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
