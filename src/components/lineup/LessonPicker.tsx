"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/library/StatusBadge";
import { formatDate } from "@/lib/dates";
import { formatDurationSec } from "@/lib/time";
import { timecodeToSeconds } from "@/lib/timecodes";
import { LessonSummary, LessonPartSummary } from "@/types";
import { ChevronRight, ChevronLeft, Play } from "lucide-react";

const PAGE_SIZE = 50;

interface LessonPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (lesson: LessonSummary, part?: LessonPartSummary) => void;
}

export function LessonPicker({ open, onClose, onSelect }: LessonPickerProps) {
  const [q, setQ] = useState("");
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [partsFor, setPartsFor] = useState<LessonSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    setPage(1);
    setPartsFor(null);
  }, [open, q]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lessons?q=${encodeURIComponent(q)}&page=${page}&pageSize=${PAGE_SIZE}`);
        const data = await res.json();
        setLessons(data.lessons ?? []);
        setTotal(data.total ?? 0);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [q, page, open]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{partsFor ? `בחירת חלק — ${partsFor.sourceRef ?? ""}` : "בחירת שיעור"}</DialogTitle>
        </DialogHeader>

        {partsFor ? (
          <>
            <Button variant="ghost" size="sm" className="self-start gap-1.5" onClick={() => setPartsFor(null)}>
              <ChevronRight className="h-4 w-4" />
              חזרה לרשימת שיעורים
            </Button>
            <div className="flex-1 overflow-y-auto border border-border rounded-md divide-y divide-border min-h-0">
              {(partsFor.parts ?? []).map((p) => {
                const cutSec = p.startTimecode && p.endTimecode
                  ? timecodeToSeconds(p.endTimecode) - timecodeToSeconds(p.startTimecode)
                  : null;
                return (
                  <button
                    key={p.id}
                    className="w-full text-start px-4 py-3 hover:bg-accent transition-colors flex items-center gap-3"
                    onClick={() => { onSelect(partsFor, p); onClose(); }}
                  >
                    <Play className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">חלק {p.partNumber}</p>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                        {p.broadcastDate && <span>{formatDate(p.broadcastDate)}</span>}
                        {(p.startTimecode || p.endTimecode) && (
                          <span dir="ltr">{p.startTimecode ?? "—"}–{p.endTimecode ?? "—"}</span>
                        )}
                      </div>
                      {p.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{p.notes}</p>}
                    </div>
                    {cutSec != null && cutSec > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">{formatDurationSec(cutSec)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש לפי שם, קריין, תגיות..."
              autoFocus
            />

            <div className="flex-1 overflow-y-auto border border-border rounded-md divide-y divide-border min-h-0">
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
                  onClick={() => {
                    if (l.parts && l.parts.length > 0) setPartsFor(l);
                    else { onSelect(l); onClose(); }
                  }}
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
                        {l.parts && l.parts.length > 0 && (
                          <span className="text-primary font-medium">{l.parts.length} חלקים</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusBadge status={l.approvalStatus} />
                      {l.videoDurationSec && (() => {
                        const cutSec = l.startTimecode && l.endTimecode
                          ? timecodeToSeconds(l.endTimecode) - timecodeToSeconds(l.startTimecode)
                          : null;
                        return (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {cutSec != null && cutSec > 0
                              ? <>{formatDurationSec(cutSec)} <span className="opacity-60">({formatDurationSec(l.videoDurationSec)})</span></>
                              : formatDurationSec(l.videoDurationSec)
                            }
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {!partsFor && totalPages > 1 && (
          <div className="flex items-center justify-between text-sm shrink-0">
            <span className="text-muted-foreground">
              {total} שיעורים · עמוד {page} מתוך {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline" size="icon" className="h-7 w-7"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline" size="icon" className="h-7 w-7"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
