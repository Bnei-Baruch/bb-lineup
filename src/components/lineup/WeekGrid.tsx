"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { DayColumn } from "./DayColumn";
import { LineupWithDays, DayWithSlots, SlotWithLesson } from "@/types";

interface WeekGridProps {
  lineup: LineupWithDays;
}

export function WeekGrid({ lineup }: WeekGridProps) {
  const [days, setDays] = useState<DayWithSlots[]>(lineup.days);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Find which day this slot belongs to
    const day = days.find((d) => d.slots.some((s) => s.id === active.id));
    if (!day) return;

    const oldIndex = day.slots.findIndex((s) => s.id === active.id);
    const newIndex = day.slots.findIndex((s) => s.id === over.id);
    if (oldIndex === newIndex) return;

    const newSlots = arrayMove(day.slots, oldIndex, newIndex);
    const newDays = days.map((d) => (d.id === day.id ? { ...d, slots: newSlots } : d));
    setDays(newDays); // optimistic update

    // Persist
    fetch("/api/slots/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayId: day.id, orderedIds: newSlots.map((s) => s.id) }),
    }).catch(() => {
      // Rollback on error
      setDays(days);
    });
  }

  const handleSlotsChange = useCallback((dayId: string, slots: SlotWithLesson[]) => {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, slots } : d)));
  }, []);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-7 gap-2" style={{ minWidth: "900px" }}>
        {days.map((day) => (
          <DayColumn
            key={day.id}
            day={day}
            weekStart={lineup.weekStart}
            onSlotsChange={handleSlotsChange}
          />
        ))}
      </div>
    </DndContext>
  );
}
