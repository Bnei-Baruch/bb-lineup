"use client";

import { useState, useRef } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SlotCard } from "./SlotCard";
import { AddSlotMenu } from "./AddSlotMenu";
import { SlotEditor } from "./SlotEditor";
import { LessonPicker } from "./LessonPicker";
import { DayTimeSummary } from "./DayTimeSummary";
import { DayWithSlots, LessonSummary, SlotWithLesson, SlotType } from "@/types";
import { DAY_NAMES, formatDate, dayDate, parseWeekParam } from "@/lib/dates";
import Link from "next/link";
import { Eye, LayoutTemplate, X, Trash2, Pencil } from "lucide-react";

interface Template { id: string; name: string }

interface Component {
  id: string; name: string; slotType: string; category: string;
  defaultLabel: string | null; defaultDurationSec: number | null;
  defaultNarratorScript: string | null; defaultTransitionType: string | null;
  defaultMediaCode: string | null; defaultLanguage: string | null;
  defaultHasSubtitles: boolean; defaultHasWorkshopQuestions: boolean;
  defaultNotes: string | null; defaultPartNumber: number | null;
}

interface DayColumnProps {
  day: DayWithSlots;
  weekStart: string;
  templates?: Template[];
  onSlotsChange: (dayId: string, slots: SlotWithLesson[]) => void;
}

export function DayColumn({ day, weekStart, templates = [], onSlotsChange }: DayColumnProps) {
  const [editingSlot, setEditingSlot] = useState<(Partial<SlotWithLesson> & { dayId: string; slotType: SlotType }) | null>(null);
  const [lessonPickerOpen, setLessonPickerOpen] = useState(false);
  const [addedLabel, setAddedLabel] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [clearExisting, setClearExisting] = useState(false);
  const [applying, setApplying] = useState(false);

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

  async function handleAddLesson(lesson: LessonSummary) {
    setLessonPickerOpen(false);
    const maxSlot = day.slots.length > 0 ? Math.max(...day.slots.map((s) => s.sortOrder ?? 0)) : -1;
    const res = await fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dayId: day.id,
        slotType: "recorded_lesson",
        lessonId: lesson.id,
        sortOrder: maxSlot + 1,
      }),
    });
    if (res.ok) {
      const slot = await res.json();
      onSlotsChange(day.id, [...day.slots, slot]);
      flashAdded(lesson.sourceRef ?? "שיעור");
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

  async function handleApplyTemplate() {
    if (!selectedTemplateId) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/lineup-rules/${selectedTemplateId}/apply-day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId: day.id, clearExisting }),
      });
      if (!res.ok) return;
      const dayRes = await fetch(`/api/days/${day.id}/slots`);
      if (dayRes.ok) {
        const slots = await dayRes.json();
        onSlotsChange(day.id, slots);
      }
      setTemplateOpen(false);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-col min-h-0 border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-muted border-b border-border flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">{DAY_NAMES[day.dayOfWeek]}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{formatDate(date)}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTemplateOpen((v) => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="החל תבנית"
          >
            <LayoutTemplate className="h-4 w-4" />
          </button>
          <button
            onClick={handleClearDay}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="נקה יום"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <Link
            href={`/lineup/${weekStart}/day/${day.dayOfWeek}/edit`}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="עריכת יום"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <Link
            href={`/lineup/${weekStart}/day/${day.dayOfWeek}`}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="תצוגת יום"
          >
            <Eye className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Template picker (inline) */}
      {templateOpen && (
        <div className="px-3 py-2 bg-background border-b border-border space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">החל תבנית</span>
            <button onClick={() => setTemplateOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {templates.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              אין תבניות.{" "}
              <a href="/settings/week-templates" className="underline hover:text-foreground">צור תבנית</a>
            </p>
          ) : (
            <>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full border border-input rounded px-2 py-1 bg-background text-xs"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={clearExisting}
                  onChange={(e) => setClearExisting(e.target.checked)}
                  className="h-3 w-3"
                />
                נקה קיימים
              </label>
              <button
                onClick={handleApplyTemplate}
                disabled={applying || !selectedTemplateId}
                className="w-full rounded bg-primary text-primary-foreground text-xs py-1 font-medium disabled:opacity-50"
              >
                {applying ? "מחיל..." : "החל"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Slots */}
      <div className="flex-1 p-2 space-y-2 min-h-[80px]">
        <SortableContext items={day.slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {day.slots.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </SortableContext>
      </div>

      {/* Footer */}
      <DayTimeSummary slots={day.slots} startTime={day.broadcastStartTime ?? undefined} endTime={day.broadcastEndTime ?? undefined} />
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

      {/* Editor */}
      <SlotEditor
        slot={editingSlot ?? { dayId: day.id, slotType: "narrator_announcement" as SlotType }}
        open={!!editingSlot}
        onClose={() => setEditingSlot(null)}
        onSave={handleSave}
      />
      <LessonPicker
        open={lessonPickerOpen}
        onClose={() => setLessonPickerOpen(false)}
        onSelect={handleAddLesson}
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
