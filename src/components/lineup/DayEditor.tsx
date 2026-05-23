"use client";

import { useState } from "react";
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
import { Wand2 } from "lucide-react";
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

export function DayEditor({ day: initialDay, components, series }: DayEditorProps) {
  const [slots, setSlots] = useState<SlotWithLesson[]>(initialDay.slots);
  const [editingSlot, setEditingSlot] = useState<(Partial<SlotWithLesson> & { dayId: string; slotType: SlotType }) | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"components" | "series">("components");
  const [startTime, setStartTime] = useState(initialDay.broadcastStartTime ?? "03:00");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  async function handleStartTimeBlur() {
    await fetch(`/api/days/${initialDay.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ broadcastStartTime: startTime }),
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  async function handleAddFromLesson(lessonId: string, durationSec: number | null) {
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
      setSlots((prev) => [...prev, slot]);
    }
  }

  async function handleAddFromComponent(componentId: string) {
    const res = await fetch("/api/slots/from-component", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ componentId, dayId: initialDay.id }),
    });
    if (res.ok) {
      const slot = await res.json();
      setSlots((prev) => [...prev, slot]);
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
      setSlots((prev) => [...prev, slot]);
    } else {
      const res = await fetch(`/api/slots/${editingSlot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const updated = await res.json();
      setSlots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("למחוק פריט זה?")) return;
    await fetch(`/api/slots/${id}`, { method: "DELETE" });
    setSlots((prev) => prev.filter((s) => s.id !== id));
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
    <div className="flex gap-4 min-h-[60vh]">
      {/* Slot list (main area) */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">שעת התחלה:</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              onBlur={handleStartTimeBlur}
              className="h-7 rounded border border-input bg-background px-2 text-sm tabular-nums"
              dir="ltr"
            />
          </div>
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {(() => {
                let running = startTime;
                return slots.map((slot) => {
                  const clockTime = running;
                  const dur = LESSON_SLOT_TYPES.includes(slot.slotType as SlotType) && slot.lesson
                    ? (slot.startTimecode && slot.endTimecode
                        ? Math.max(0, timecodeToSeconds(slot.endTimecode) - timecodeToSeconds(slot.startTimecode)) || (slot.lesson.videoDurationSec ?? 0)
                        : (slot.lesson.videoDurationSec ?? 0))
                    : (slot.durationSec ?? 0);
                  running = addSecondsToTime(running, dur);
                  return (
                    <DaySlotRow
                      key={slot.id}
                      slot={slot}
                      clockTime={clockTime}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  );
                });
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

        <div className="mt-2 border border-border rounded-lg">
          <DayTimeSummary slots={slots} />
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-56 shrink-0 border border-border rounded-lg bg-card max-h-[80vh] flex flex-col">
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
        <div className="overflow-y-auto flex-1 p-3">
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
      />
    </div>
  );
}
