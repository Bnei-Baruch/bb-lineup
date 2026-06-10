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
import { LineupWithDays, DayWithSlots, SlotWithLesson, LESSON_SLOT_TYPES } from "@/types";
import { DAY_NAMES, dayDate, parseWeekParam, formatDate } from "@/lib/dates";
import { timecodeToSeconds } from "@/lib/timecodes";

function timeToSec(hhmm: string): number {
  const p = hhmm.split(":").map(Number);
  return p[0] * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0);
}

function sessionPlaylistSec(session: DayWithSlots): number {
  const from = session.contentStartIndex ?? 0;
  const counted = session.contentCutoffIndex != null
    ? session.slots.slice(from, session.contentCutoffIndex)
    : session.slots.slice(from);
  let total = 0;
  for (const slot of counted) {
    if (slot.slotType === "part_header") continue;
    if (LESSON_SLOT_TYPES.includes(slot.slotType) && slot.lesson) {
      if (slot.startTimecode && slot.endTimecode) {
        const dur = timecodeToSeconds(slot.endTimecode) - timecodeToSeconds(slot.startTimecode);
        total += dur > 0 ? dur : (slot.lesson.videoDurationSec ?? 0);
      } else {
        total += slot.lesson.videoDurationSec ?? 0;
      }
    } else {
      total += slot.durationSec ?? 0;
    }
  }
  return total;
}

function fmtHHMM(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

interface Template { id: string; name: string }

interface WeekGridProps {
  lineup: LineupWithDays;
  templates?: Template[];
}

export function WeekGrid({ lineup, templates = [] }: WeekGridProps) {
  const [days, setDays] = useState<DayWithSlots[]>(lineup.days);
  const [activeSlot, setActiveSlot] = useState<SlotWithLesson | null>(null);
  // Ordered array: oldest-expanded first. Max 4 at once; opening a 5th evicts the first.
  const [expandedDays, setExpandedDays] = useState<number[]>([0]);

  const dayGroups = useMemo(() => {
    const map = new Map<number, DayWithSlots[]>();
    for (let i = 0; i < 7; i++) map.set(i, []);
    for (const d of days) map.get(d.dayOfWeek)?.push(d);
    Array.from(map.values()).forEach((sessions) =>
      sessions.sort((a: DayWithSlots, b: DayWithSlots) => a.sessionIndex - b.sessionIndex)
    );
    return map;
  }, [days]);

  const MAX_EXPANDED = 4;

  function toggleExpand(dow: number) {
    setExpandedDays((prev) => {
      if (prev.includes(dow)) return prev.filter((d) => d !== dow);
      const next = [...prev, dow];
      return next.length > MAX_EXPANDED ? next.slice(next.length - MAX_EXPANDED) : next;
    });
  }

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

    const overDayById = overId.startsWith("day-") ? days.find(d => d.id === overId.slice(4)) : null;
    const overDay = overDayById ?? days.find((d) => d.slots.some((s) => s.id === overId));
    if (!overDay) return;

    if (activeDay.id === overDay.id && !overDayById) {
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
      const slot = activeDay.slots.find(s => s.id === activeId)!;
      const sourceSlots = activeDay.slots.filter(s => s.id !== activeId);

      let targetSlots: SlotWithLesson[];
      if (overDayById) {
        targetSlots = [...overDay.slots, slot];
      } else {
        const overIndex = overDay.slots.findIndex(s => s.id === overId);
        targetSlots = [
          ...overDay.slots.slice(0, overIndex),
          slot,
          ...overDay.slots.slice(overIndex),
        ];
      }

      setDays(prev => prev.map(d => {
        if (d.id === activeDay.id) return { ...d, slots: sourceSlots };
        if (d.id === overDay.id) return { ...d, slots: targetSlots };
        return d;
      }));

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

  const weekStart = parseWeekParam(lineup.weekStart);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-2 items-stretch" style={{ minHeight: "calc(100vh - 160px)" }}>
        {Array.from({ length: 7 }, (_, dow) => {
          const sessions = dayGroups.get(dow) ?? [];
          const isExpanded = expandedDays.includes(dow);
          const date = dayDate(weekStart, dow);
          const primarySession = sessions[0];
          const totalPlaylistSec = sessions.reduce((sum, s) => sum + sessionPlaylistSec(s), 0);
          const totalBroadcastSec = sessions.reduce((sum, s) => {
            if (!s.broadcastStartTime || !s.broadcastEndTime) return sum;
            let diff = timeToSec(s.broadcastEndTime) - timeToSec(s.broadcastStartTime);
            if (diff < 0) diff += 24 * 3600;
            return sum + diff;
          }, 0);
          const hasBroadcastWindow = totalBroadcastSec > 0;
          const isOver = hasBroadcastWindow && totalPlaylistSec > totalBroadcastSec;
          const isUnder = hasBroadcastWindow && totalPlaylistSec < totalBroadcastSec;

          if (!isExpanded) {
            return (
              <button
                key={dow}
                onClick={() => toggleExpand(dow)}
                title={`${DAY_NAMES[dow]} — לחץ להרחבה`}
                className="w-10 shrink-0 flex flex-col items-center py-3 gap-3 border border-border rounded-lg bg-card hover:bg-muted transition-colors"
              >
                <span
                  className="text-xs font-semibold text-foreground"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {DAY_NAMES[dow]}
                </span>
                <span
                  className="text-xs text-muted-foreground tabular-nums"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {formatDate(date).slice(0, 5)}
                </span>
                {primarySession?.broadcastStartTime && (
                  <span
                    className="text-xs text-foreground/60 tabular-nums"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    {primarySession.broadcastStartTime.slice(0, 5)}
                  </span>
                )}
                {totalPlaylistSec > 0 && (
                  <span
                    className={`mt-auto text-xs tabular-nums font-semibold ${
                      isOver ? "text-red-500" : isUnder ? "text-green-600" : "text-foreground/60"
                    }`}
                    style={{ writingMode: "vertical-rl" }}
                  >
                    {fmtHHMM(totalPlaylistSec)}
                  </span>
                )}
              </button>
            );
          }

          return (
            <div key={dow} className="flex-1 min-w-0">
              <DayColumnGroup
                sessions={sessions}
                weekStart={lineup.weekStart}
                templates={templates}
                onSlotsChange={handleSlotsChange}
                onAddSession={handleAddSession}
                onDeleteSession={handleDeleteSession}
                onCollapse={() => toggleExpand(dow)}
              />
            </div>
          );
        })}
      </div>
      <DragOverlay>
        {activeSlot ? <SlotCard slot={activeSlot} onEdit={() => {}} onDelete={() => {}} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
