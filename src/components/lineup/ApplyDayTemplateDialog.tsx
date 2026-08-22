"use client";

import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDurationSec } from "@/lib/time";
import { distributeSlack } from "@/lib/day-budget";
import { SlotWithLesson } from "@/types";

interface RuleSet {
  id: string;
  name: string;
}

interface PreviewFixedItem { index: number; kind: "fixed" | "legacy"; slotType: string; durationSec: number; partNumber: number | null; }
interface PreviewLiveItem { index: number; kind: "live"; slotType: string; durationSec: number; label?: string; }
interface PreviewContinuousItem {
  index: number; kind: "continuous"; seriesId: string;
  next: {
    lessonId: string; sourceRef: string; recordingDate: string | null;
    resumeFromSec: number; alreadyReadArticle: boolean;
    startSec: number; endSec: number; partDurationSec: number;
  } | null;
}
interface PreviewCandidate {
  lessonId: string; sourceRef: string;
  videoDurationSec: number | null; articleReadingSec: number | null; recordingDate: string | null;
  totalSec: number; diffSec: number;
}
interface PreviewPickableItem { index: number; kind: "pickable"; seriesId: string; part?: "article" | "video"; candidates: PreviewCandidate[]; assignedLessonId: string | null; }
interface PreviewPickableLinkedItem { index: number; kind: "pickable-linked"; seriesId: string; linkedIndex: number; }
type PreviewItem = PreviewFixedItem | PreviewLiveItem | PreviewContinuousItem | PreviewPickableItem | PreviewPickableLinkedItem;

interface Props {
  open: boolean;
  onClose: () => void;
  dayId: string;
  onApplied: (slots: SlotWithLesson[], contentStartIndex: number | null, contentCutoffIndex: number | null) => void;
}

export function ApplyDayTemplateDialog({ open, onClose, dayId, onApplied }: Props) {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [clearExisting, setClearExisting] = useState(false);
  const [step, setStep] = useState<"select" | "preview">("select");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [remainingForPickableSec, setRemainingForPickableSec] = useState<number | null>(null);
  const [liveInWindow, setLiveInWindow] = useState<{ index: number; authoredSec: number }[]>([]);
  const [picked, setPicked] = useState<Record<number, string>>({});

  useEffect(() => {
    if (open) {
      setSelectedId("");
      setClearExisting(false);
      setStep("select");
      setPreview(null);
      setPicked({});
      fetch("/api/lineup-rules").then((r) => r.json()).then(setRuleSets);
    }
  }, [open]);

  async function handlePreview() {
    if (!selectedId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/lineup-rules/${selectedId}/apply-day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId, clearExisting, dryRun: true }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const items = (data.preview ?? []) as PreviewItem[];
      setPreview(items);
      setRemainingForPickableSec(data.remainingForPickableSec ?? null);
      setLiveInWindow(data.liveInWindow ?? []);
      const initialPicked: Record<number, string> = {};
      for (const item of items) {
        if (item.kind === "pickable" && item.candidates[0]) initialPicked[item.index] = item.candidates[0].lessonId;
      }
      setPicked(initialPicked);
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setLoading(true);
    try {
      const resolutions: Record<number, { lessonId: string }> = {};
      for (const [index, lessonId] of Object.entries(picked)) resolutions[Number(index)] = { lessonId };
      const res = await fetch(`/api/lineup-rules/${selectedId}/apply-day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId, clearExisting, dryRun: false, resolutions }),
      });
      if (!res.ok) return;
      const { contentStartIndex, contentCutoffIndex } = await res.json();
      const slotsRes = await fetch(`/api/days/${dayId}/slots`);
      const slots = slotsRes.ok ? await slotsRes.json() : [];
      onApplied(slots, contentStartIndex ?? null, contentCutoffIndex ?? null);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const fixedCount = preview?.filter((p) => p.kind === "fixed" || p.kind === "legacy").length ?? 0;
  const dynamicItems = preview?.filter((p) => p.kind !== "fixed" && p.kind !== "legacy") ?? [];

  // Live segments' real duration depends on whichever candidate ends up picked for the pickable
  // slot(s) - recomputed here (same shared logic the server uses at commit time) so the preview
  // always shows what will actually happen, not just the flat authored estimate.
  const liveAdjustments = useMemo(() => {
    if (!preview || remainingForPickableSec == null) return new Map<number, number>();
    let totalSlackSec = 0;
    for (const item of preview) {
      if (item.kind !== "pickable") continue;
      const chosenId = picked[item.index];
      const candidate = item.candidates.find((c) => c.lessonId === chosenId);
      if (!candidate) continue;
      totalSlackSec += remainingForPickableSec - candidate.totalSec;
    }
    return distributeSlack(liveInWindow, totalSlackSec);
  }, [preview, picked, remainingForPickableSec, liveInWindow]);

  // Which day-part (1, 2, ...) each item falls under, per the template's part_header markers.
  const partOfIndex = useMemo(() => {
    const map = new Map<number, number | null>();
    if (!preview) return map;
    let currentPart: number | null = null;
    for (const item of preview) {
      if ((item.kind === "fixed" || item.kind === "legacy") && item.slotType === "part_header" && item.partNumber != null) {
        currentPart = item.partNumber;
      }
      map.set(item.index, currentPart);
    }
    return map;
  }, [preview]);

  // Running total of just the dynamic items shown as cards within each day-part (live segments
  // before/after + the recorded lesson) - deliberately excludes fixed items (transitions, song,
  // closing) that aren't rendered here, so the header always matches what's visibly summed.
  const partTotals = useMemo(() => {
    const totals = new Map<number | null, number>();
    if (!preview) return totals;
    for (const item of preview) {
      if (item.kind === "fixed" || item.kind === "legacy") continue;
      const part = partOfIndex.get(item.index) ?? null;
      let sec = 0;
      if (item.kind === "live") sec = liveAdjustments.get(item.index) ?? item.durationSec;
      else if (item.kind === "continuous") sec = item.next?.partDurationSec ?? 0;
      else if (item.kind === "pickable") {
        const candidate = item.candidates.find((c) => c.lessonId === picked[item.index]);
        if (candidate) sec = item.part === "article" ? (candidate.articleReadingSec ?? 0) : candidate.totalSec;
      } else if (item.kind === "pickable-linked") {
        const linked = preview.find((p) => p.index === item.linkedIndex);
        if (linked && linked.kind === "pickable") {
          const candidate = linked.candidates.find((c) => c.lessonId === picked[linked.index]);
          if (candidate) sec = candidate.videoDurationSec ?? 0;
        }
      }
      totals.set(part, (totals.get(part) ?? 0) + sec);
    }
    return totals;
  }, [preview, picked, liveAdjustments, partOfIndex]);

  const seenParts = new Set<number | null>();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>החל תבנית AI</DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <>
            {ruleSets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                אין תבניות — צור תבנית דרך &quot;שמור כתבנית AI&quot;
              </p>
            ) : (
              <div className="space-y-2">
                {ruleSets.map((rs) => (
                  <button
                    key={rs.id}
                    onClick={() => setSelectedId(rs.id)}
                    className={`w-full text-start px-3 py-2 rounded-md border text-sm transition-colors ${selectedId === rs.id ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-accent"}`}
                  >
                    {rs.name}
                  </button>
                ))}
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={clearExisting} onChange={(e) => setClearExisting(e.target.checked)} className="rounded" />
              נקה פריטים קיימים לפני ההחלה
            </label>
          </>
        )}

        {step === "preview" && preview && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {fixedCount} פריטים קבועים יתווספו ללא שינוי.
            </p>

            {dynamicItems.length === 0 && (
              <p className="text-sm text-muted-foreground">אין פריטים דינמיים בתבנית הזו.</p>
            )}

            {dynamicItems.map((item) => {
              const part = partOfIndex.get(item.index) ?? null;
              const isNewPart = !seenParts.has(part);
              seenParts.add(part);
              return (
              <div key={item.index}>
                {isNewPart && (
                  <div className="text-xs text-muted-foreground font-medium px-1 pt-1">
                    {part != null ? `חלק ${part}` : "פריטים"}
                    {" — סה״כ: "}<span className="text-foreground font-semibold tabular-nums">{formatDurationSec(Math.round(partTotals.get(part) ?? 0))}</span>
                  </div>
                )}
                <div className="border border-border rounded-md p-3 space-y-2">
                {item.kind === "live" && (() => {
                  const adjusted = liveAdjustments.get(item.index);
                  return (
                    <div className="text-sm">
                      <span className="font-medium">{item.label ?? "תוכן חי"}</span>
                      {adjusted != null ? (
                        <span className="text-muted-foreground">
                          {" — "}<span className="text-foreground font-semibold tabular-nums">{formatDurationSec(Math.round(adjusted))}</span>
                          {" בפועל (הערכה: "}{formatDurationSec(item.durationSec)}{")"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground"> — {formatDurationSec(item.durationSec)} (הערכה)</span>
                      )}
                    </div>
                  );
                })()}

                {item.kind === "continuous" && (
                  item.next ? (
                    <div className="text-sm">
                      <div className="text-xs text-muted-foreground mb-1">שיעור רצוף — הבא בתור:</div>
                      <div className="font-medium">
                        {item.next.sourceRef}
                        {item.next.recordingDate && <span className="text-muted-foreground font-normal"> ({item.next.recordingDate})</span>}
                      </div>
                      <div className="text-muted-foreground tabular-nums">
                        {formatDurationSec(item.next.startSec)} ← {formatDurationSec(item.next.endSec)}
                        {item.next.resumeFromSec > item.next.startSec && " (המשך משיעור קודם)"}
                      </div>
                      <div className="text-muted-foreground tabular-nums">
                        {"משך השיעור המוקלט: "}<span className="text-foreground font-semibold">{formatDurationSec(item.next.partDurationSec)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-amber-600">⚠️ לא נמצא שיעור נוסף בסדרה הזו</div>
                  )
                )}

                {item.kind === "pickable" && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      {item.part === "article" ? "שיעור לבחירה (מאמר + שיעור מוקלט)" : "שיעור לבחירה"}
                      {" — נותרו "}{remainingForPickableSec != null ? formatDurationSec(remainingForPickableSec) : "?"} ליום
                    </div>
                    {item.candidates.length === 0 ? (
                      <div className="text-sm text-amber-600">⚠️ לא נמצאו שיעורים מתאימים בסדרה הזו</div>
                    ) : (
                      item.candidates.map((c) => (
                        <button
                          key={c.lessonId}
                          onClick={() => setPicked((p) => ({ ...p, [item.index]: c.lessonId }))}
                          className={`w-full text-start px-3 py-2 rounded-md border text-sm transition-colors ${picked[item.index] === c.lessonId ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}
                        >
                          <div className="font-medium">
                            {c.lessonId === item.assignedLessonId && (
                              <span className="text-white bg-green-600 rounded px-1.5 py-0.5 text-[10px] font-semibold me-1.5 align-middle">משויך לתאריך זה</span>
                            )}
                            {c.sourceRef}
                            {c.recordingDate && <span className="text-muted-foreground font-normal"> ({c.recordingDate})</span>}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {"שיעור מוקלט: "}{formatDurationSec(c.videoDurationSec ?? 0)}
                            {c.articleReadingSec != null && <>{"  +  מאמר: "}{formatDurationSec(c.articleReadingSec)}</>}
                            {"  =  "}<span className="text-foreground font-semibold">{formatDurationSec(c.totalSec)}</span>
                            {" ("}{c.diffSec > 0 ? "+" : "-"}{formatDurationSec(Math.abs(c.diffSec))} {c.diffSec > 0 ? "חריגה" : "נותר"}{")"}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {item.kind === "pickable-linked" && (
                  <div className="text-sm text-muted-foreground">
                    שיעור מוקלט — לפי הבחירה שנעשתה מעלה (מאמר + שיעור)
                  </div>
                )}
                </div>
              </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={step === "preview" ? () => setStep("select") : onClose}>
            {step === "preview" ? "חזור" : "ביטול"}
          </Button>
          {step === "select" ? (
            <Button onClick={handlePreview} disabled={!selectedId || loading}>
              {loading ? "טוען..." : "המשך לתצוגה מקדימה"}
            </Button>
          ) : (
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? "מייצר..." : "צור"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
