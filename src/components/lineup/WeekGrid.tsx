"use client";

import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { DayColumnGroup } from "./DayColumnGroup";
import { SlotCard } from "./SlotCard";
import { LineupWithDays, DayWithSlots, SlotWithLesson } from "@/types";

interface Template { id: string; name: string }

interface WeekGridProps {
  lineup: LineupWithDays;
  templates?: Template[];
}

export function WeekGrid({ lineup, templates = [] }: WeekGridProps) {
  const [days, setDays] = useState<DayWithSlots[]>(lineup.days);
  const [activeSlot, setActiveSlot] = useState<SlotWithLesson | null>(null);

  const dayGroups = useMemo(() => {
    const map = new Map<number, DayWithSlots[]>();
    for (let i = 0; i < 7; i++) map.set(i, []);
    for (const d of days) map.get(d.dayOfWeek)?.push(d);
    Array.from(map.values()).forEach((sessions) =>
      sessions.sort((a: DayWithSlots, b: DayWithSlots) => a.sessionIndex - b.sessionIndex)
    );
    return map;
  }, [days]);

  async function handleAddSession(dayOfWeek: number, lineupId: string) {
    const res = await fetch("/api/days", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineupId, dayOfWeek }),
    });
    if (res.ok) {
      const newDay: DayWithSlots = await res.json();
      setDays((prev) => [...prev, newDay]);
    }
  }

  async function handleDeleteSession(dayId: string) {
    if (!confirm("למחוק שיעור זה וכל פריטיו?")) return;
    const res = await fetch(`/api/days/${dayId}`, { method: "DELETE" });
    if (res.ok) {
      setDays((prev) => prev.filter((d) => d.id !== dayId));
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string;
    const slot = days.flatMap(d => d.slots).find(s => s.id === id) ?? null;
    setActiveSlot(slot);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveSlot(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeDay = days.find((d) => d.slots.some((s) => s.id === activeId));
    if (!activeDay) return;

    // `over` could be a slot id or a day drop zone id like "day-<dayId>"
    const overDayById = overId.startsWith("day-") ? days.find(d => d.id === overId.slice(4)) : null;
    const overDay = overDayById ?? days.find((d) => d.slots.some((s) => s.id === overId));
    if (!overDay) return;

    if (activeDay.id === overDay.id && !overDayById) {
      // ── Intra-day reorder ──
      const oldIndex = activeDay.slots.findIndex((s) => s.id === activeId);
      const newIndex = activeDay.slots.findIndex((s) => s.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const newSlots = arrayMove(activeDay.slots, oldIndex, newIndex);
      setDays(prev => prev.map(d => d.id === activeDay.id ? { ...d, slots: newSlots } : d));

      fetch("/api/slots/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId: activeDay.id, orderedIds: newSlots.map(s => s.id) }),
      }).catch(() => setDays(days));
    } else {
      // ── Cross-day move ──
      const slot = activeDay.slots.find(s => s.id === activeId)!;
      const sourceSlots = activeDay.slots.filter(s => s.id !== activeId);

      let targetSlots: SlotWithLesson[];
      if (overDayById) {
        // Dropped on the column itself → append at end
        targetSlots = [...overDay.slots, slot];
      } else {
        // Dropped on a slot → insert at that position
        const overIndex = overDay.slots.findIndex(s => s.id === overId);
        targetSlots = [
          ...overDay.slots.slice(0, overIndex),
          slot,
          ...overDay.slots.slice(overIndex),
        ];
      }

      // Optimistic update
      setDays(prev => prev.map(d => {
        if (d.id === activeDay.id) return { ...d, slots: sourceSlots };
        if (d.id === overDay.id) return { ...d, slots: targetSlots };
        return d;
      }));

      // Persist: move slot to new day, then reorder both days
      fetch(`/api/slots/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId: overDay.id }),
      }).then(() =>
        Promise.all([
          fetch("/api/slots/reorder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dayId: activeDay.id, orderedIds: sourceSlots.map(s => s.id) }),
          }),
          fetch("/api/slots/reorder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dayId: overDay.id, orderedIds: targetSlots.map(s => s.id) }),
          }),
        ])
      );
    }
  }

  const handleSlotsChange = useCallback((dayId: string, slots: SlotWithLesson[]) => {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, slots } : d)));
  }, []);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(7, 400px)" }}>
        {Array.from({ length: 7 }, (_, dow) => (
          <DayColumnGroup
            key={dow}
            sessions={dayGroups.get(dow) ?? []}
            weekStart={lineup.weekStart}
            templates={templates}
            onSlotsChange={handleSlotsChange}
            onAddSession={handleAddSession}
            onDeleteSession={handleDeleteSession}
          />
        ))}
      </div>
      <DragOverlay>
        {activeSlot ? <SlotCard slot={activeSlot} onEdit={() => {}} onDelete={() => {}} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
