"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ComponentPalette } from "./ComponentPalette";
import { SeriesLessonPalette } from "./SeriesLessonPalette";
import { DaySlotTable } from "./DaySlotTable";
import { SlotEditor } from "./SlotEditor";
import { DayTimeSummary } from "./DayTimeSummary";
import { SaveAsTemplateDialog } from "./SaveAsTemplateDialog";
import { ApplyDayTemplateDialog } from "./ApplyDayTemplateDialog";
import { DayWithSlots, SlotWithLesson, SlotType } from "@/types";
import { UndoAction, buildSlotsUndo } from "@/lib/slot-undo";
import { Wand2, Trash2, Plus, LayoutTemplate, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface PaletteComponent {
  id: string;
  name: string;
  category: string;
  slotType: string;
  defaultDurationSec: number | null;
}

interface SeriesLessonPart {
  id: string;
  partNumber: number;
  startTimecode: string | null;
  endTimecode: string | null;
  broadcastDate: string | null;
  notes: string | null;
}

interface SeriesLessonRow {
  id: string;
  sourceRef: string | null;
  recordingDate: string | null;
  videoDurationSec: number | null;
  narratorName: string | null;
  approvalStatus: string;
  parts: SeriesLessonPart[];
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

export function DayEditor({ day: initialDay, components, series }: DayEditorProps) {
  const router = useRouter();
  const [slots, setSlots] = useState<SlotWithLesson[]>(initialDay.slots);
  const [editingSlot, setEditingSlot] = useState<(Partial<SlotWithLesson> & { dayId: string; slotType: SlotType }) | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"components" | "series">("components");
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [startIndex, setStartIndex] = useState<number>(
    () => initialDay.contentStartIndex ?? 0
  );
  const startSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateStartIndex(newIndex: number) {
    setStartIndex(newIndex);
    if (startSaveTimer.current) clearTimeout(startSaveTimer.current);
    startSaveTimer.current = setTimeout(() => {
      fetch(`/api/days/${initialDay.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentStartIndex: newIndex }),
      });
    }, 600);
  }

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
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);

  // Single-level undo, scoped to this browser session — the last mutation only.
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);

  function registerUndo(oldSlots: SlotWithLesson[], newSlots: SlotWithLesson[]) {
    const undo = buildSlotsUndo(initialDay.id, oldSlots, newSlots, setSlots);
    if (undo) setUndoAction(undo);
  }

  function handleTemplateApplied(newSlots: SlotWithLesson[], contentStartIndex: number | null, contentCutoffIndex: number | null) {
    registerUndo(slots, newSlots);
    setSlots(newSlots);
    if (contentStartIndex != null) setStartIndex(contentStartIndex);
    if (contentCutoffIndex != null) setCutoffIndex(contentCutoffIndex);
    router.refresh();
  }

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

  async function handleAddFromLesson(lessonId: string, durationSec: number | null, label?: string, part?: SeriesLessonPart) {
    const res = await fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayId: initialDay.id,
        slotType: "recorded_lesson",
        lessonId,
        lessonPartId: part?.id ?? null,
        startTimecode: part?.startTimecode ?? null,
        endTimecode: part?.endTimecode ?? null,
        durationSec: durationSec ?? undefined,
      }),
    });
    if (res.ok) {
      const slot = await res.json();
      const newSlots = insertSlotBeforeCutoff(slots, slot, cutoffIndex);
      registerUndo(slots, newSlots);
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
      registerUndo(slots, newSlots);
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
      registerUndo(slots, newSlots);
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
      const newSlots = slots.map((s) => (s.id === updated.id ? updated : s));
      registerUndo(slots, newSlots);
      setSlots(newSlots);
      router.refresh();
    }
  }

  async function handleClearDay() {
    if (!confirm("למחוק את כל הפריטים ביום זה?")) return;
    await fetch(`/api/days/${initialDay.id}/slots`, { method: "DELETE" });
    registerUndo(slots, []);
    setSlots([]);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("למחוק פריט זה?")) return;
    await fetch(`/api/slots/${id}`, { method: "DELETE" });
    const idx = slots.findIndex((s) => s.id === id);
    if (idx !== -1 && idx < startIndex) updateStartIndex(Math.max(0, startIndex - 1));
    if (idx !== -1 && idx < cutoffIndex) updateCutoff(Math.max(0, cutoffIndex - 1));
    const newSlots = slots.filter((s) => s.id !== id);
    registerUndo(slots, newSlots);
    setSlots(newSlots);
    router.refresh();
  }

  function handleEdit(slot: SlotWithLesson) {
    setEditingSlot({ ...slot, dayId: initialDay.id, slotType: slot.slotType as SlotType });
  }

  async function handleNestToggle(slotId: string, parentSlotId: string | null) {
    const res = await fetch(`/api/slots/${slotId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentSlotId }),
    });
    if (res.ok) {
      const updated = await res.json();
      const newSlots = slots.map((s) => (s.id === updated.id ? updated : s));
      registerUndo(slots, newSlots);
      setSlots(newSlots);
    }
  }

  async function handleInlineEdit(slotId: string, data: Partial<SlotWithLesson>) {
    const res = await fetch(`/api/slots/${slotId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      const newSlots = slots.map((s) => (s.id === updated.id ? updated : s));
      registerUndo(slots, newSlots);
      setSlots(newSlots);
    }
  }

  function handleReorder(newSlots: SlotWithLesson[]) {
    registerUndo(slots, newSlots);
    setSlots(newSlots);
    fetch("/api/slots/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayId: initialDay.id, orderedIds: newSlots.map((s) => s.id) }),
    }).catch(() => setSlots(slots));
  }

  return (
    <div className="flex flex-col min-h-0" style={{ height: "calc(100vh - 134px)" }}>
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
              className="gap-1.5 text-xs"
              onClick={() => {
                if (!undoAction) return;
                undoAction.perform();
                setUndoAction(null);
              }}
              disabled={!undoAction}
              title={undoAction ? `בטל: ${undoAction.label}` : "אין פעולה לביטול"}
            >
              <Undo2 className="h-3.5 w-3.5" />
              בטל
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setAddPanelOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              הוסף תוכן
            </Button>
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
              onClick={() => setApplyTemplateOpen(true)}
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              החל תבנית AI
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
        <div className="flex-1 min-h-0 overflow-auto border border-border rounded-lg shadow-sm scrollbar-visible">
          <DaySlotTable
            slots={slots}
            startTime={startTime}
            startIndex={startIndex}
            cutoffIndex={cutoffIndex}
            onRowClick={handleEdit}
            onDelete={handleDelete}
            onReorder={handleReorder}
            onNestToggle={handleNestToggle}
            onInlineEdit={handleInlineEdit}
            onStartMoveUp={() => updateStartIndex(Math.max(0, startIndex - 1))}
            onStartMoveDown={() => updateStartIndex(Math.min(Math.min(cutoffIndex, slots.length), startIndex + 1))}
            onCutoffMoveUp={() => updateCutoff(Math.max(Math.min(startIndex, slots.length), cutoffIndex - 1))}
            onCutoffMoveDown={() => updateCutoff(Math.min(slots.length, cutoffIndex + 1))}
          />
        </div>{/* end scrollable slot list */}

        <div className="shrink-0 mt-2 border border-border rounded-lg overflow-hidden bg-background">
          <DayTimeSummary slots={slots} startIndex={startIndex} cutoffIndex={cutoffIndex < slots.length ? cutoffIndex : undefined} startTime={startTime} endTime={endTime || undefined} />
        </div>
      </div>

      {/* Add-content slide-in panel */}
      <Sheet open={addPanelOpen} onOpenChange={setAddPanelOpen}>
        <SheetContent className="flex flex-col p-0 gap-0">
          <SheetHeader className="p-4 pb-0">
            <SheetTitle>הוסף תוכן</SheetTitle>
          </SheetHeader>
          {addedLabel && (
            <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-green-200 bg-green-50 text-green-800 text-sm font-medium shrink-0">
              <span>✓</span>
              <span>{addedLabel} נוסף ללינאפ</span>
            </div>
          )}
          <div className="flex border-b border-border shrink-0 mt-3">
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
        </SheetContent>
      </Sheet>

      {/* Slot editor panel */}
      {editingSlot && (
        <SlotEditor
          slot={editingSlot}
          allSlots={slots}
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
        startIndex={startIndex}
        cutoffIndex={cutoffIndex}
        startTime={startTime}
        endTime={endTime || undefined}
        dayOfWeek={initialDay.dayOfWeek}
      />

      {/* Apply AI template dialog */}
      <ApplyDayTemplateDialog
        open={applyTemplateOpen}
        onClose={() => setApplyTemplateOpen(false)}
        dayId={initialDay.id}
        onApplied={handleTemplateApplied}
      />
    </div>
  );
}
