"use client";

import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SlotCard } from "./SlotCard";
import { AddSlotMenu } from "./AddSlotMenu";
import { SlotEditor } from "./SlotEditor";
import { DayTimeSummary } from "./DayTimeSummary";
import { DayWithSlots, SlotWithLesson, SlotType } from "@/types";
import { DAY_NAMES, formatDate, dayDate, parseWeekParam } from "@/lib/dates";
import Link from "next/link";
import { Eye } from "lucide-react";

interface DayColumnProps {
  day: DayWithSlots;
  weekStart: string;
  onSlotsChange: (dayId: string, slots: SlotWithLesson[]) => void;
}

export function DayColumn({ day, weekStart, onSlotsChange }: DayColumnProps) {
  const [editingSlot, setEditingSlot] = useState<(Partial<SlotWithLesson> & { dayId: string; slotType: SlotType }) | null>(null);

  const date = dayDate(parseWeekParam(weekStart), day.dayOfWeek);

  async function handleAdd(slotType: SlotType) {
    setEditingSlot({ dayId: day.id, slotType });
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

  return (
    <div className="flex flex-col min-h-0 border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-muted border-b border-border flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">{DAY_NAMES[day.dayOfWeek]}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{formatDate(date)}</div>
        </div>
        <Link
          href={`/lineup/${weekStart}/day/${day.dayOfWeek}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="תצוגת יום"
        >
          <Eye className="h-4 w-4" />
        </Link>
      </div>

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
      <DayTimeSummary slots={day.slots} />
      <div className="border-t border-border">
        <AddSlotMenu onAdd={handleAdd} />
      </div>

      {/* Editor */}
      {editingSlot && (
        <SlotEditor
          slot={editingSlot}
          open={true}
          onClose={() => setEditingSlot(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
