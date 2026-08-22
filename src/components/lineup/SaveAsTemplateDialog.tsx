"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SlotWithLesson, LESSON_SLOT_TYPES, TemplateItemV2 } from "@/types";
import { timecodeToSeconds } from "@/lib/timecodes";

// Real facilitated-discussion slot types whose duration is genuinely unpredictable until
// broadcast - mirrors the same list the original template migration used (src/types' consumers).
const LIVE_SLOT_TYPES = new Set([
  "study_between_friends", "building_spiritual_society", "management",
  "conversations_on_way", "holiday_study", "chevruta", "group_study",
]);

interface RuleSet {
  id: string;
  name: string;
  dayTemplate: string;
  broadcastStartTime?: string;
  broadcastEndTime?: string;
}

function getSlotDurationSec(slot: SlotWithLesson): number | undefined {
  if (LESSON_SLOT_TYPES.includes(slot.slotType) && slot.lesson) {
    if (slot.startTimecode && slot.endTimecode) {
      const dur = timecodeToSeconds(slot.endTimecode) - timecodeToSeconds(slot.startTimecode);
      return dur > 0 ? dur : (slot.lesson.videoDurationSec ?? undefined);
    }
    return slot.lesson.videoDurationSec ?? undefined;
  }
  return slot.durationSec ?? undefined;
}

/** A slot backed by a lesson from a series with a real consumption mode ("continuous"/"pickable")
 *  came from the dynamic matcher (or should be treated as if it did) - saving it as a frozen
 *  snapshot would silently downgrade the rule set back to the old placeholder-only v1 shape and
 *  lose the matching behavior entirely. Detected by lessonId + the lesson's own series, not by
 *  any flag on the slot itself (none exists), so this is a best-effort inference. */
function seriesModeOf(slot: SlotWithLesson): "continuous" | "pickable" | null {
  if (!slot.lessonId || !slot.lesson?.seriesId || !slot.lesson.series) return null;
  return slot.lesson.series.consumptionMode;
}

function slotsToTemplate(slots: SlotWithLesson[], dayOfWeek: number): TemplateItemV2[] {
  // Pickable pairs: an article_reading slot and a recorded_lesson/conversations_on_way slot
  // sharing the same lessonId are the two halves of one dynamic pickable item, wherever they sit.
  const lessonIdHasArticle = new Set(slots.filter((s) => s.slotType === "article_reading" && s.lessonId).map((s) => s.lessonId!));
  const lessonIdHasVideo = new Set(slots.filter((s) => LESSON_SLOT_TYPES.includes(s.slotType) && s.lessonId).map((s) => s.lessonId!));

  return slots.map((s): TemplateItemV2 => {
    const item = ((): TemplateItemV2 => {
      if (s.slotType === "part_header") {
        return { kind: "fixed", slotType: "part_header", partNumber: s.partNumber ?? undefined };
      }

      const mode = seriesModeOf(s);

      if (mode === "continuous" && LESSON_SLOT_TYPES.includes(s.slotType)) {
        return { kind: "dynamic", contentType: "lesson", seriesId: s.lesson!.seriesId! };
      }

      if (mode === "pickable" && (s.slotType === "article_reading" || LESSON_SLOT_TYPES.includes(s.slotType))) {
        const isArticle = s.slotType === "article_reading";
        const hasOtherHalf = isArticle ? lessonIdHasVideo.has(s.lessonId!) : lessonIdHasArticle.has(s.lessonId!);
        return {
          kind: "dynamic", contentType: "lesson", seriesId: s.lesson!.seriesId!,
          ...(hasOtherHalf ? { part: isArticle ? "article" : "video" } : {}),
        };
      }

      // Live content — duration is only known once broadcast, so its current actual length
      // becomes the new planned estimate rather than being frozen as a fixed slot. Its
      // reference link is a fixed-per-weekday constant (not something that varies week to
      // week), keyed here by this specific weekday - merged with other weekdays' links for
      // this same item when saving over an existing template (see mergeLineupLinks below).
      if (LIVE_SLOT_TYPES.has(s.slotType) && !s.lessonId) {
        return {
          kind: "dynamic", contentType: "live", slotType: s.slotType,
          plannedDurationSec: getSlotDurationSec(s) ?? 0,
          label: s.label ?? undefined,
          ...(s.lineupLink ? { lineupLinksByDay: { [String(dayOfWeek)]: s.lineupLink } } : {}),
        };
      }

      // Component-based slot — save only the reference, pull defaults at apply time.
      if (s.componentId) {
        return { kind: "fixed", componentId: s.componentId, slotType: s.slotType };
      }

      // Custom fixed slot — save full details
      const durationSec = getSlotDurationSec(s);
      const hasTimecodes = LESSON_SLOT_TYPES.includes(s.slotType) && s.startTimecode && s.endTimecode;
      return {
        kind: "fixed",
        slotType: s.slotType,
        label: s.label ?? undefined,
        durationSec,
        ...(hasTimecodes && { startTimecode: s.startTimecode!, endTimecode: s.endTimecode! }),
        narratorScript: s.narratorScript ?? undefined,
        transitionType: s.transitionType ?? undefined,
        mediaCode: s.mediaCode ?? undefined,
        language: s.language ?? undefined,
        hasSubtitles: s.hasSubtitles ?? undefined,
        hasWorkshopQuestions: s.hasWorkshopQuestions ?? undefined,
        notes: s.notes ?? undefined,
      };
    })();

    // Nested under the nearest preceding non-nested item (mirrors DaySlotTable's isChild/
    // prevTopLevelId convention) - captured here so re-applying the template restores it.
    return s.parentSlotId ? { ...item, nested: true } : item;
  });
}

/** A single save only knows this one weekday's live links. When updating an existing rule
 *  set (shared across possibly several weekdays, e.g. "יום שני-חמישי"), merge this weekday's
 *  entries into whatever the existing template already had for other weekdays, positionally
 *  matching live items by index - rather than overwriting the whole map and losing them. */
function mergeLineupLinks(newTemplate: TemplateItemV2[], existingDayTemplateJson: string): TemplateItemV2[] {
  try {
    const parsed = JSON.parse(existingDayTemplateJson);
    const oldSlots: TemplateItemV2[] = Array.isArray(parsed) ? parsed : (parsed?.slots ?? []);
    return newTemplate.map((item, i) => {
      const old = oldSlots[i];
      if (item.kind === "dynamic" && item.contentType === "live" && old?.kind === "dynamic" && old.contentType === "live") {
        const mergedLinks = { ...old.lineupLinksByDay, ...item.lineupLinksByDay };
        return Object.keys(mergedLinks).length > 0 ? { ...item, lineupLinksByDay: mergedLinks } : item;
      }
      return item;
    });
  } catch {
    return newTemplate; // existing template unparsable - fall back to just this weekday's link
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  slots: SlotWithLesson[];
  startIndex?: number;
  cutoffIndex?: number;
  startTime?: string;
  endTime?: string;
  dayOfWeek: number;
}

export function SaveAsTemplateDialog({ open, onClose, slots, startIndex, cutoffIndex, startTime, endTime, dayOfWeek }: Props) {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [selectedId, setSelectedId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setSaved(false);
      fetch("/api/lineup-rules").then((r) => r.json()).then(setRuleSets);
    }
  }, [open]);

  const template = slotsToTemplate(slots, dayOfWeek);

  async function handleSave() {
    setSaving(true);
    try {
      if (mode === "new") {
        const payload = {
          dayTemplate: JSON.stringify({
            slots: template,
            contentStartIndex: startIndex ?? 0,
            contentCutoffIndex: cutoffIndex ?? slots.length,
          }),
          broadcastStartTime: startTime || "02:40",
          broadcastEndTime: endTime || null,
        };
        await fetch("/api/lineup-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName, ...payload }),
        });
      } else {
        const rs = ruleSets.find((r) => r.id === selectedId);
        if (!rs) return;
        const mergedTemplate = mergeLineupLinks(template, rs.dayTemplate);
        const payload = {
          dayTemplate: JSON.stringify({
            slots: mergedTemplate,
            contentStartIndex: startIndex ?? 0,
            contentCutoffIndex: cutoffIndex ?? slots.length,
          }),
          broadcastStartTime: startTime || "02:40",
          broadcastEndTime: endTime || null,
        };
        await fetch(`/api/lineup-rules/${selectedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...rs, ...payload }),
        });
      }
      setSaved(true);
      setTimeout(onClose, 800);
    } finally {
      setSaving(false);
    }
  }

  const canSave = mode === "new" ? newName.trim().length > 0 : !!selectedId;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>שמור כתבנית AI</DialogTitle>
        </DialogHeader>

        {/* Time info */}
        {(startTime || endTime) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
            {startTime && <span>התחלה: <span className="font-mono text-foreground">{startTime}</span></span>}
            {endTime && <span>סיום: <span className="font-mono text-foreground">{endTime}</span></span>}
          </div>
        )}

        {/* Template preview */}
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">מבנה הלינאפ ({template.length} פריטים)</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
          {template.map((t, i) => {
            const color =
              t.kind === "fixed" ? "bg-blue-100 text-blue-700" :
              t.contentType === "live" ? "bg-amber-100 text-amber-700" :
              "bg-purple-100 text-purple-700";
            const lbl =
              t.kind === "fixed" ? (t.label ?? t.slotType ?? "קבוע") :
              t.contentType === "live" ? `תוכן חי דינמי${t.label ? " · " + t.label : ""}` :
              `שיעור דינמי${t.part ? " (" + (t.part === "article" ? "מאמר" : "וידאו") + ")" : ""}`;
            const durSec = t.kind === "fixed" ? t.durationSec : t.contentType === "live" ? t.plannedDurationSec : undefined;
            const dur = durSec
              ? ` · ${Math.floor(durSec / 60)}:${String(durSec % 60).padStart(2, "0")}`
              : "";
            return (
              <div key={i} className={`flex items-center gap-2 ${t.nested ? "ms-4" : ""}`}>
                <span className="text-[10px] text-muted-foreground w-4 tabular-nums">{i + 1}.</span>
                {t.nested && <span className="text-[10px] text-muted-foreground">↳</span>}
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${color}`}>{lbl}</span>
                {dur && <span className="text-[10px] text-muted-foreground tabular-nums">{dur}</span>}
              </div>
            );
          })}
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode("pick")}
            className={`flex-1 text-sm py-1.5 rounded-md border transition-colors ${mode === "pick" ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            עדכן תבנית קיימת
          </button>
          <button
            onClick={() => setMode("new")}
            className={`flex-1 text-sm py-1.5 rounded-md border transition-colors ${mode === "new" ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            תבנית חדשה
          </button>
        </div>

        {mode === "pick" ? (
          <div className="space-y-2">
            {ruleSets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">אין תבניות — צור תבנית חדשה</p>
            ) : (
              ruleSets.map((rs) => (
                <button
                  key={rs.id}
                  onClick={() => setSelectedId(rs.id)}
                  className={`w-full text-start px-3 py-2 rounded-md border text-sm transition-colors ${selectedId === rs.id ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-accent"}`}
                >
                  {rs.name}
                  {selectedId === rs.id && <span className="text-xs text-muted-foreground ms-2">← יוחלף</span>}
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>שם התבנית</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="למשל: לינאפ בוקר רגיל"
              autoFocus
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saved ? "✓ נשמר" : saving ? "שומר..." : "שמור תבנית"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
