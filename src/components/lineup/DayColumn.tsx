"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/components/providers/KeycloakProvider";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SlotCard } from "./SlotCard";
import { AddSlotMenu } from "./AddSlotMenu";
import { SlotEditor } from "./SlotEditor";
import { LessonPicker } from "./LessonPicker";
import { DayTimeSummary } from "./DayTimeSummary";
import { ApplyDayTemplateDialog } from "./ApplyDayTemplateDialog";
import { DayWithSlots, LessonSummary, LessonPartSummary, SlotWithLesson, SlotType, LESSON_SLOT_TYPES } from "@/types";
import { DAY_NAMES, formatDate, dayDate, parseWeekParam } from "@/lib/dates";
import { addSecondsToTime, timecodeToSeconds } from "@/lib/timecodes";

function getIsraelTimeSec(): number {
  const parts = new Intl.DateTimeFormat("he", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === "hour")?.value ?? "0");
  const m = parseInt(parts.find(p => p.type === "minute")?.value ?? "0");
  const s = parseInt(parts.find(p => p.type === "second")?.value ?? "0");
  return h * 3600 + m * 60 + s;
}

function timeStrToSec(t: string): number {
  const p = t.split(":").map(Number);
  return (p[0] ?? 0) * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0);
}
import Link from "next/link";
import { Eye, LayoutTemplate, X, Trash2, Pencil, Plus, ChevronsRight, ChevronUp, ChevronDown } from "lucide-react";

interface Component {
  id: string; name: string; slotType: string; category: string;
  defaultLabel: string | null; defaultDurationSec: number | null;
  defaultNarratorScript: string | null; defaultLineupLink: string | null; defaultSlidesLink: string | null; defaultTransitionType: string | null;
  defaultMediaCode: string | null; defaultLanguage: string | null;
  defaultHasSubtitles: boolean; defaultHasWorkshopQuestions: boolean;
  defaultNotes: string | null; defaultPartNumber: number | null;
}

interface DayColumnProps {
  day: DayWithSlots;
  weekStart: string;
  onSlotsChange: (dayId: string, slots: SlotWithLesson[]) => void;
  onAddSession?: () => void;
  onDeleteSession?: () => void;
  onCollapse?: () => void;
}

export function DayColumn({ day, weekStart, onSlotsChange, onAddSession, onDeleteSession, onCollapse }: DayColumnProps) {
  const { isAdmin } = useAuth();
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `day-${day.id}` });
  const [editingSlot, setEditingSlot] = useState<(Partial<SlotWithLesson> & { dayId: string; slotType: SlotType }) | null>(null);
  const [lessonPickerOpen, setLessonPickerOpen] = useState(false);
  const [addedLabel, setAddedLabel] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);

  const [nowSec, setNowSec] = useState<number>(getIsraelTimeSec);
  useEffect(() => {
    const id = setInterval(() => setNowSec(getIsraelTimeSec()), 10_000);
    return () => clearInterval(id);
  }, []);

  // Content boundary lines
  const [startIndex, setStartIndex] = useState<number>(day.contentStartIndex ?? 0);
  const startSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function updateStartIndex(newIndex: number) {
    setStartIndex(newIndex);
    if (startSaveTimer.current) clearTimeout(startSaveTimer.current);
    startSaveTimer.current = setTimeout(() => {
      fetch(`/api/days/${day.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentStartIndex: newIndex }),
      });
    }, 600);
  }

  const [cutoffIndex, setCutoffIndex] = useState<number>(day.contentCutoffIndex ?? day.slots.length);
  const cutoffSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function updateCutoff(newIndex: number) {
    setCutoffIndex(newIndex);
    if (cutoffSaveTimer.current) clearTimeout(cutoffSaveTimer.current);
    cutoffSaveTimer.current = setTimeout(() => {
      fetch(`/api/days/${day.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentCutoffIndex: newIndex }),
      });
    }, 600);
  }

  const date = dayDate(parseWeekParam(weekStart), day.dayOfWeek);

  function flashAdded(label: string) {
    setAddedLabel(label);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAddedLabel(null), 2000);
  }

  function handleAdd(slotType: SlotType) {
    setEditingSlot({ dayId: day.id, slotType });
  }

  async function handleAddComponent(component: Component) {
    const maxSlot = day.slots.length > 0 ? Math.max(...day.slots.map((s) => s.sortOrder ?? 0)) : -1;
    const res = await fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayId: day.id,
        slotType: component.slotType,
        componentId: component.id,
        label: component.defaultLabel,
        durationSec: component.defaultDurationSec,
        narratorScript: component.defaultNarratorScript,
        lineupLink: component.defaultLineupLink,
        slidesLink: component.defaultSlidesLink,
        transitionType: component.defaultTransitionType,
        mediaCode: component.defaultMediaCode,
        language: component.defaultLanguage,
        hasSubtitles: component.defaultHasSubtitles,
        hasWorkshopQuestions: component.defaultHasWorkshopQuestions,
        notes: component.defaultNotes,
        partNumber: component.defaultPartNumber,
        sortOrder: maxSlot + 1,
      }),
    });
    if (res.ok) {
      const slot = await res.json();
      onSlotsChange(day.id, [...day.slots, slot]);
      flashAdded(component.name);
    }
  }

  async function handleAddLesson(lesson: LessonSummary, part?: LessonPartSummary) {
    setLessonPickerOpen(false);
    const maxSlot = day.slots.length > 0 ? Math.max(...day.slots.map((s) => s.sortOrder ?? 0)) : -1;
    const res = await fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayId: day.id,
        slotType: "recorded_lesson",
        lessonId: lesson.id,
        lessonPartId: part?.id ?? null,
        startTimecode: part?.startTimecode ?? null,
        endTimecode: part?.endTimecode ?? null,
        sortOrder: maxSlot + 1,
      }),
    });
    if (res.ok) {
      const slot = await res.json();
      onSlotsChange(day.id, [...day.slots, slot]);
      flashAdded(part ? `${lesson.sourceRef ?? "שיעור"} - חלק ${part.partNumber}` : (lesson.sourceRef ?? "שיעור"));
    }
  }

  async function handleSave(data: Partial<SlotWithLesson>) {
    if (!editingSlot) return;
    const isNew = !editingSlot.id;

    if (isNew) {
      const res = await fetch("/api/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId: editingSlot.dayId, slotType: editingSlot.slotType, ...data }),
      });
      const slot = await res.json();
      onSlotsChange(day.id, [...day.slots, slot]);
    } else {
      const res = await fetch(`/api/slots/${editingSlot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const updated = await res.json();
      onSlotsChange(day.id, day.slots.map((s) => (s.id === updated.id ? updated : s)));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("למחוק פריט זה?")) return;
    await fetch(`/api/slots/${id}`, { method: "DELETE" });
    onSlotsChange(day.id, day.slots.filter((s) => s.id !== id));
  }

  function handleEdit(slot: SlotWithLesson) {
    setEditingSlot({ ...slot, dayId: day.id, slotType: slot.slotType as SlotType });
  }

  async function handleClearDay() {
    if (!confirm("למחוק את כל הפריטים ביום זה?")) return;
    await fetch(`/api/days/${day.id}/slots`, { method: "DELETE" });
    onSlotsChange(day.id, []);
  }

  function handleTemplateApplied(newSlots: SlotWithLesson[], contentStartIndex: number | null, contentCutoffIndex: number | null) {
    onSlotsChange(day.id, newSlots);
    if (contentStartIndex != null) setStartIndex(contentStartIndex);
    if (contentCutoffIndex != null) setCutoffIndex(contentCutoffIndex);
  }

  return (
    <div className="flex flex-col bg-card" style={{ maxHeight: "calc(100vh - 140px)" }}>
      {/* Header */}
      <div className="px-3 py-2 bg-muted border-b border-border flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">{DAY_NAMES[day.dayOfWeek]}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{formatDate(date)}</div>
          {(day.broadcastStartTime || day.broadcastEndTime) && (
            <div className="text-xs tabular-nums text-foreground/70">
              {day.broadcastStartTime?.slice(0, 5)}
              {day.broadcastEndTime && <>–{day.broadcastEndTime.slice(0, 5)}</>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="כווץ"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          )}
          {isAdmin && onAddSession && (
            <button
              onClick={onAddSession}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="הוסף שיעור נוסף"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          {isAdmin && onDeleteSession && (
            <button
              onClick={onDeleteSession}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="מחק שיעור זה"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setApplyTemplateOpen(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="החל תבנית"
            >
              <LayoutTemplate className="h-4 w-4" />
            </button>
          )}
          {isAdmin && (
            <button
              onClick={handleClearDay}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="נקה יום"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {isAdmin && (
            <Link
              href={`/lineup/${weekStart}/day/${day.dayOfWeek}/${day.sessionIndex ?? 0}/edit`}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="עריכת יום"
            >
              <Pencil className="h-4 w-4" />
            </Link>
          )}
          <Link
            href={`/lineup/${weekStart}/day/${day.dayOfWeek}/${day.sessionIndex ?? 0}`}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="תצוגת יום"
          >
            <Eye className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Slots */}
      <div ref={setDropRef} className={`flex-1 p-2 space-y-2 min-h-[80px] overflow-y-auto transition-colors ${isOver ? "bg-primary/5" : ""}`}>
        <SortableContext items={day.slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {(() => {
            const clampedStart = Math.min(startIndex, day.slots.length);
            const clampedCutoff = Math.min(cutoffIndex, day.slots.length);
            const items: React.ReactNode[] = [];

            // Compute running clock times and active state for each slot
            const startTime = day.broadcastStartTime ?? "03:00";
            let running = startTime;
            let runningSec = timeStrToSec(startTime);
            const clockTimes: string[] = [];
            const activeSlots: boolean[] = [];
            day.slots.forEach((slot) => {
              const t = running;
              const slotStartSec = runningSec;
              let dur = 0;
              if (LESSON_SLOT_TYPES.includes(slot.slotType) && slot.lesson) {
                const hasSlotTC = slot.startTimecode && slot.endTimecode;
                const inTC = hasSlotTC ? slot.startTimecode : slot.lesson.startTimecode;
                const outTC = hasSlotTC ? slot.endTimecode : slot.lesson.endTimecode;
                if (inTC && outTC) {
                  const d = timecodeToSeconds(outTC) - timecodeToSeconds(inTC);
                  if (d > 0) dur = d;
                }
                if (dur === 0) dur = slot.lesson.videoDurationSec ?? 0;
              } else {
                dur = slot.durationSec ?? 0;
              }
              running = addSecondsToTime(running, dur);
              runningSec += dur;
              clockTimes.push(t);
              activeSlots.push(dur > 0 && nowSec >= slotStartSec && nowSec < runningSec);
            });

            const startLine = (
              <div key="start-line" className="flex items-center gap-2 py-1 select-none">
                <div className="flex-1 border-t-2 border-dashed border-blue-400" />
                <span className="text-xs font-semibold text-blue-500 whitespace-nowrap">תחילת תוכן</span>
                {isAdmin && (
                  <div className="flex gap-0.5">
                    <button onClick={() => updateStartIndex(Math.max(0, startIndex - 1))} className="p-0.5 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="הזז למעלה"><ChevronUp className="h-4 w-4" /></button>
                    <button onClick={() => updateStartIndex(Math.min(clampedCutoff, startIndex + 1))} className="p-0.5 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="הזז למטה"><ChevronDown className="h-4 w-4" /></button>
                  </div>
                )}
                <div className="flex-1 border-t-2 border-dashed border-blue-400" />
              </div>
            );

            const cutoffLine = (
              <div key="cutoff-line" className="flex items-center gap-2 py-1 select-none">
                <div className="flex-1 border-t-2 border-dashed border-orange-400" />
                <span className="text-xs font-semibold text-orange-500 whitespace-nowrap">סוף תוכן</span>
                {isAdmin && (
                  <div className="flex gap-0.5">
                    <button onClick={() => updateCutoff(Math.max(clampedStart, cutoffIndex - 1))} className="p-0.5 rounded text-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors" title="הזז למעלה"><ChevronUp className="h-4 w-4" /></button>
                    <button onClick={() => updateCutoff(Math.min(day.slots.length, cutoffIndex + 1))} className="p-0.5 rounded text-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors" title="הזז למטה"><ChevronDown className="h-4 w-4" /></button>
                  </div>
                )}
                <div className="flex-1 border-t-2 border-dashed border-orange-400" />
              </div>
            );

            if (clampedStart === 0) items.push(startLine);

            day.slots.forEach((slot, i) => {
              if (i === clampedStart && clampedStart > 0) items.push(startLine);
              if (i === clampedCutoff) items.push(cutoffLine);
              items.push(
                <div key={slot.id}>
                  <SlotCard slot={slot} clockTime={clockTimes[i]} isActive={activeSlots[i]} readOnly={!isAdmin} onEdit={handleEdit} onDelete={handleDelete} />
                </div>
              );
            });

            if (clampedCutoff === day.slots.length) items.push(cutoffLine);

            return items;
          })()}
        </SortableContext>
      </div>

      {/* Footer */}
      <DayTimeSummary slots={day.slots} startTime={day.broadcastStartTime ?? undefined} endTime={day.broadcastEndTime ?? undefined} startIndex={startIndex} cutoffIndex={cutoffIndex} />
      {isAdmin && (
      <div className="border-t border-border flex">
        <AddSlotMenu onAdd={handleAdd} onAddComponent={handleAddComponent} />
        <button
          onClick={() => setLessonPickerOpen(true)}
          className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border-s border-border"
          title="הוסף שיעור מהספרייה"
        >
          מהספרייה
        </button>
      </div>
      )}

      {/* Editor */}
      {isAdmin && (
      <SlotEditor
        slot={editingSlot ?? { dayId: day.id, slotType: "narrator_announcement" as SlotType }}
        open={!!editingSlot}
        onClose={() => setEditingSlot(null)}
        onSave={handleSave}
      />
      )}
      <LessonPicker
        open={lessonPickerOpen}
        onClose={() => setLessonPickerOpen(false)}
        onSelect={handleAddLesson}
      />
      <ApplyDayTemplateDialog
        open={applyTemplateOpen}
        onClose={() => setApplyTemplateOpen(false)}
        dayId={day.id}
        onApplied={handleTemplateApplied}
      />

      {/* Fixed corner toast — visible regardless of scroll position */}
      {addedLabel && (
        <div className="fixed bottom-5 left-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg border border-green-200 bg-green-50 text-green-800 text-sm font-medium pointer-events-none">
          <span>✓</span>
          <span>{addedLabel}</span>
        </div>
      )}
    </div>
  );
}
