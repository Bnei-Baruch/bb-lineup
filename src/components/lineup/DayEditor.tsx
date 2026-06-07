"use client";

import React, { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { ComponentPalette } from "./ComponentPalette";
import { SeriesLessonPalette } from "./SeriesLessonPalette";
import { DaySlotRow } from "./DaySlotRow";
import { SlotEditor } from "./SlotEditor";
import { DayTimeSummary } from "./DayTimeSummary";
import { SaveAsTemplateDialog } from "./SaveAsTemplateDialog";
import { DayWithSlots, SlotWithLesson, SlotType, LESSON_SLOT_TYPES } from "@/types";
import { addSecondsToTime, timecodeToSeconds } from "@/lib/timecodes";
import { Wand2, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaletteComponent {
  id: string;
  name: string;
  category: string;
  slotType: string;
  defaultDurationSec: number | null;
}

interface SeriesLessonRow {
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
  lessons: SeriesLessonRow[];
}

interface DayEditorProps {
  day: DayWithSlots;
  components: PaletteComponent[];
  series: SeriesRow[];
}

function CutoffLine({ onMoveUp, onMoveDown }: { onMoveUp: () => void; onMoveDown: () => void }) {
  return (
    <div className="flex items-center gap-2 py-1 select-none group">
      <div className="flex-1 border-t-2 border-dashed border-orange-400" />
      <span className="text-xs font-semibold text-orange-500 whitespace-nowrap">סוף תוכן</span>
      <div className="flex gap-0.5">
        <button onClick={onMoveUp} className="p-0.5 rounded text-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors" title="הזז למעלה">
          <ChevronUp className="h-4 w-4" />
        </button>
        <button onClick={onMoveDown} className="p-0.5 rounded text-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors" title="הזז למטה">
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 border-t-2 border-dashed border-orange-400" />
    </div>
  );
}

export function DayEditor({ day: initialDay, components, series }: DayEditorProps) {
  const router = useRouter();
  const [slots, setSlots] = useState<SlotWithLesson[]>(initialDay.slots);
  const [editingSlot, setEditingSlot] = useState<(Partial<SlotWithLesson> & { dayId: string; slotType: SlotType }) | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"components" | "series">("components");
  const [sidebarWidth, setSidebarWidth] = useState(600);
  const [cutoffIndex, setCutoffIndex] = useState<number>(
    () => initialDay.contentCutoffIndex ?? initialDay.slots.length
  );
  const cutoffSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateCutoff(newIndex: number) {
    setCutoffIndex(newIndex);
    if (cutoffSaveTimer.current) clearTimeout(cutoffSaveTimer.current);
    cutoffSaveTimer.current = setTimeout(() => {
      fetch(`/api/days/${initialDay.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentCutoffIndex: newIndex }),
      });
    }, 600);
  }
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarRef.current?.getBoundingClientRect().width ?? sidebarWidth;

    function onMove(ev: MouseEvent) {
      // sidebar is on the left in RTL; drag handle is on its right edge
      // moving mouse right = wider, left = narrower
      const delta = ev.clientX - startX;
      setSidebarWidth(Math.max(180, Math.min(600, startWidth + delta)));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);
  const [addedLabel, setAddedLabel] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashAdded(label: string) {
    setAddedLabel(label);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAddedLabel(null), 2000);
  }
  const [startTime, setStartTime] = useState(initialDay.broadcastStartTime ?? "03:00");
  const [endTime, setEndTime] = useState(initialDay.broadcastEndTime ?? "");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  async function handleStartTimeBlur() {
    await fetch(`/api/days/${initialDay.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ broadcastStartTime: startTime }),
    });
  }

  async function handleEndTimeBlur() {
    await fetch(`/api/days/${initialDay.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ broadcastEndTime: endTime || null }),
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  function insertSlotBeforeCutoff(currentSlots: SlotWithLesson[], newSlot: SlotWithLesson, currentCutoff: number): SlotWithLesson[] {
    const insertAt = Math.min(currentCutoff, currentSlots.length);
    return [...currentSlots.slice(0, insertAt), newSlot, ...currentSlots.slice(insertAt)];
  }

  function reorderSlots(newSlots: SlotWithLesson[]) {
    fetch("/api/slots/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayId: initialDay.id, orderedIds: newSlots.map((s) => s.id) }),
    }).catch(() => {});
  }

  async function handleAddFromLesson(lessonId: string, durationSec: number | null, label?: string) {
    const res = await fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayId: initialDay.id,
        slotType: "recorded_lesson",
        lessonId,
        durationSec: durationSec ?? undefined,
      }),
    });
    if (res.ok) {
      const slot = await res.json();
      const newSlots = insertSlotBeforeCutoff(slots, slot, cutoffIndex);
      setSlots(newSlots);
      updateCutoff(cutoffIndex + 1);
      reorderSlots(newSlots);
      flashAdded(label ?? "שיעור");
      router.refresh();
    }
  }

  async function handleAddFromComponent(componentId: string, name?: string) {
    const res = await fetch("/api/slots/from-component", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ componentId, dayId: initialDay.id }),
    });
    if (res.ok) {
      const slot = await res.json();
      const newSlots = insertSlotBeforeCutoff(slots, slot, cutoffIndex);
      setSlots(newSlots);
      updateCutoff(cutoffIndex + 1);
      reorderSlots(newSlots);
      flashAdded(name ?? "רכיב");
      router.refresh();
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
      const newSlots = insertSlotBeforeCutoff(slots, slot, cutoffIndex);
      setSlots(newSlots);
      updateCutoff(cutoffIndex + 1);
      reorderSlots(newSlots);
      router.refresh();
    } else {
      const res = await fetch(`/api/slots/${editingSlot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const updated = await res.json();
      setSlots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      router.refresh();
    }
  }

  async function handleClearDay() {
    if (!confirm("למחוק את כל הפריטים ביום זה?")) return;
    await fetch(`/api/days/${initialDay.id}/slots`, { method: "DELETE" });
    setSlots([]);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("למחוק פריט זה?")) return;
    await fetch(`/api/slots/${id}`, { method: "DELETE" });
    setSlots((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx !== -1 && idx < cutoffIndex) updateCutoff(Math.max(0, cutoffIndex - 1));
      return prev.filter((s) => s.id !== id);
    });
    router.refresh();
  }

  function handleEdit(slot: SlotWithLesson) {
    setEditingSlot({ ...slot, dayId: initialDay.id, slotType: slot.slotType as SlotType });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = slots.findIndex((s) => s.id === active.id);
    const newIndex = slots.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newSlots = arrayMove(slots, oldIndex, newIndex);
    setSlots(newSlots);

    fetch("/api/slots/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayId: initialDay.id, orderedIds: newSlots.map((s) => s.id) }),
    }).catch(() => setSlots(slots));
  }

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 134px)" }}>
      {/* Slot list (main area) */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="shrink-0 flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">התחלה:</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              onBlur={handleStartTimeBlur}
              className="h-7 rounded border border-input bg-background px-2 text-sm tabular-nums"
              dir="ltr"
            />
            <span className="text-muted-foreground">סיום:</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              onBlur={handleEndTimeBlur}
              className="h-7 rounded border border-input bg-background px-2 text-sm tabular-nums"
              dir="ltr"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={handleClearDay}
              disabled={slots.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5" />
              נקה יום
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setSaveTemplateOpen(true)}
              disabled={slots.length === 0}
            >
              <Wand2 className="h-3.5 w-3.5" />
              שמור כתבנית AI
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {(() => {
                const clampedCutoff = Math.min(cutoffIndex, slots.length);
                let running = startTime;
                const items: React.ReactNode[] = [];

                slots.forEach((slot, i) => {
                  if (i === clampedCutoff) {
                    items.push(<CutoffLine key="cutoff" onMoveUp={() => updateCutoff(Math.max(0, cutoffIndex - 1))} onMoveDown={() => updateCutoff(Math.min(slots.length, cutoffIndex + 1))} />);
                  }
                  const clockTime = running;
                  const dur = LESSON_SLOT_TYPES.includes(slot.slotType as SlotType) && slot.lesson
                    ? (slot.startTimecode && slot.endTimecode
                        ? Math.max(0, timecodeToSeconds(slot.endTimecode) - timecodeToSeconds(slot.startTimecode)) || (slot.lesson.videoDurationSec ?? 0)
                        : (slot.lesson.videoDurationSec ?? 0))
                    : (slot.durationSec ?? 0);
                  running = addSecondsToTime(running, dur);
                  items.push(
                    <div key={slot.id} className={i >= clampedCutoff ? "opacity-40" : undefined}>
                      <DaySlotRow slot={slot} clockTime={clockTime} onEdit={handleEdit} onDelete={handleDelete} />
                    </div>
                  );
                });

                if (clampedCutoff === slots.length) {
                  items.push(<CutoffLine key="cutoff" onMoveUp={() => updateCutoff(Math.max(0, cutoffIndex - 1))} onMoveDown={() => updateCutoff(Math.min(slots.length, cutoffIndex + 1))} />);
                }

                return items;
              })()}
            </div>
          </SortableContext>
        </DndContext>

        {slots.length === 0 && (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-lg">
            <p>אין פריטים ביום זה</p>
            <p className="text-xs mt-1">הוסף קומפוננטות מהפאנל או פריט חדש</p>
          </div>
        )}
        </div>{/* end scrollable slot list */}

        <div className="shrink-0 mt-2 border border-border rounded-lg overflow-hidden bg-background">
          <DayTimeSummary slots={slots.slice(0, Math.min(cutoffIndex, slots.length))} startTime={startTime} endTime={endTime || undefined} />
        </div>
      </div>

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className="shrink-0 border border-border rounded-lg bg-card flex flex-col relative h-full"
        style={{width: sidebarWidth}}
      >
        {/* Drag-to-resize handle on the right edge */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize hover:bg-primary/20 rounded-r-lg transition-colors z-10"
        />

        {/* Tab switcher */}
        <div className="flex border-b border-border shrink-0">
          <button
            onClick={() => setSidebarTab("components")}
            className={`flex-1 text-xs py-2 font-medium transition-colors ${sidebarTab === "components" ? "text-foreground border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}
          >
            רכיבים
          </button>
          <button
            onClick={() => setSidebarTab("series")}
            className={`flex-1 text-xs py-2 font-medium transition-colors ${sidebarTab === "series" ? "text-foreground border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}
          >
            סדרות
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          {sidebarTab === "components" ? (
            <ComponentPalette components={components} onAdd={handleAddFromComponent} />
          ) : (
            <SeriesLessonPalette series={series} onAdd={handleAddFromLesson} />
          )}
        </div>
      </div>

      {/* Slot editor dialog */}
      {editingSlot && (
        <SlotEditor
          slot={editingSlot}
          open={true}
          onClose={() => setEditingSlot(null)}
          onSave={handleSave}
        />
      )}

      {/* Save as AI template dialog */}
      <SaveAsTemplateDialog
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        slots={slots}
        startTime={startTime}
        endTime={endTime || undefined}
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
