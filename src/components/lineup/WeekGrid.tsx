"use client";

import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
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
import { CompactWeekView } from "./CompactWeekView";
import { LineupWithDays, DayWithSlots, SlotWithLesson, LESSON_SLOT_TYPES } from "@/types";
import { DAY_NAMES, dayDate, parseWeekParam, formatDate } from "@/lib/dates";
import { LayoutList, Rows3 } from "lucide-react";

function timeToSec(hhmm: string): number {
  const p = hhmm.split(":").map(Number);
  return p[0] * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0);
}

function slotDur(slot: SlotWithLesson): number {
  if (slot.slotType === "part_header") return 0;
  if (LESSON_SLOT_TYPES.includes(slot.slotType) && slot.lesson) {
    return slot.lesson.videoDurationSec ?? 0;
  }
  return slot.durationSec ?? 0;
}

function sessionPlaylistSec(session: DayWithSlots): number {
  const from = session.contentStartIndex ?? 0;
  const counted = session.contentCutoffIndex != null
    ? session.slots.slice(from, session.contentCutoffIndex)
    : session.slots.slice(from);
  return counted.reduce((sum, s) => sum + slotDur(s), 0);
}

function sessionPreContentSec(session: DayWithSlots): number {
  const from = session.contentStartIndex ?? 0;
  return session.slots.slice(0, from).reduce((sum, s) => sum + slotDur(s), 0);
}

function fmtHHMM(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

interface WeekGridProps {
  lineup: LineupWithDays;
}

export function WeekGrid({ lineup }: WeekGridProps) {
  const [days, setDays] = useState<DayWithSlots[]>(lineup.days);
  const [activeSlot, setActiveSlot] = useState<SlotWithLesson | null>(null);
  // Ordered array: oldest-expanded first. Max 4 at once; opening a 5th evicts the first.
  const [expandedDays, setExpandedDays] = useState<number[]>([0]);
  const [viewMode, setViewMode] = useState<"detailed" | "compact">("detailed");

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

  // Moves the dragged slot into the hovered day/position live, so cross-day drags
  // show a landing preview the same way same-day sortable reordering already does.
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    setDays((prev) => {
      const activeDay = prev.find((d) => d.slots.some((s) => s.id === activeId));
      if (!activeDay) return prev;

      const overDayById = overId.startsWith("day-") ? prev.find((d) => d.id === overId.slice(4)) : null;
      const overDay = overDayById ?? prev.find((d) => d.slots.some((s) => s.id === overId));
      if (!overDay || activeDay.id === overDay.id) return prev;

      const slot = activeDay.slots.find((s) => s.id === activeId);
      if (!slot) return prev;

      const sourceSlots = activeDay.slots.filter((s) => s.id !== activeId);
      const overIndex = overDayById ? overDay.slots.length : overDay.slots.findIndex((s) => s.id === overId);
      const targetSlots: SlotWithLesson[] = [
        ...overDay.slots.slice(0, overIndex),
        slot,
        ...overDay.slots.slice(overIndex),
      ];

      return prev.map((d) => {
        if (d.id === activeDay.id) return { ...d, slots: sourceSlots };
        if (d.id === overDay.id) return { ...d, slots: targetSlots };
        return d;
      });
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const activeId = active.id as string;
    const originalDayId = activeSlot?.dayId ?? null;
    setActiveSlot(null);
    if (!over) return;

    const overId = over.id as string;
    const currentDay = days.find((d) => d.slots.some((s) => s.id === activeId));
    if (!currentDay) return;

    const movedAcrossDays = originalDayId !== null && originalDayId !== currentDay.id;

    let finalSlots = currentDay.slots;
    const oldIndex = currentDay.slots.findIndex((s) => s.id === activeId);
    const newIndex = overId.startsWith("day-") ? -1 : currentDay.slots.findIndex((s) => s.id === overId);
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      finalSlots = arrayMove(currentDay.slots, oldIndex, newIndex);
      setDays((prev) => prev.map((d) => (d.id === currentDay.id ? { ...d, slots: finalSlots } : d)));
    }

    if (!movedAcrossDays && oldIndex === newIndex) return;

    const persistReorder = (dayId: string, orderedIds: string[]) =>
      fetch("/api/slots/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId, orderedIds }),
      });

    persistReorder(currentDay.id, finalSlots.map((s) => s.id));

    if (movedAcrossDays) {
      fetch(`/api/slots/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId: currentDay.id }),
      });
      const originalDay = days.find((d) => d.id === originalDayId);
      if (originalDay) persistReorder(originalDay.id, originalDay.slots.map((s) => s.id));
    }
  }

  const handleSlotsChange = useCallback((dayId: string, slots: SlotWithLesson[]) => {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, slots } : d)));
  }, []);

  const weekStart = parseWeekParam(lineup.weekStart);

  const viewToggle = (
    <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5 bg-card">
      <button
        onClick={() => setViewMode("detailed")}
        title="תצוגה מפורטת"
        className={`p-1.5 rounded transition-colors ${viewMode === "detailed" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        <Rows3 className="h-4 w-4" />
      </button>
      <button
        onClick={() => setViewMode("compact")}
        title="תצוגת שבוע מלא"
        className={`p-1.5 rounded transition-colors ${viewMode === "compact" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        <LayoutList className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex justify-end">{viewToggle}</div>
      {viewMode === "compact" ? (
        <CompactWeekView dayGroups={dayGroups} weekStart={lineup.weekStart} />
      ) : (
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
          const totalPreContentSec = sessions.reduce((sum, s) => sum + sessionPreContentSec(s), 0);
          // Target = broadcast window − pre-content (available time for content)
          const targetContentSec = totalBroadcastSec > 0 ? totalBroadcastSec - totalPreContentSec : 0;
          const hasBroadcastWindow = totalBroadcastSec > 0;
          const isOver = hasBroadcastWindow && totalPlaylistSec > targetContentSec;
          const isUnder = hasBroadcastWindow && totalPlaylistSec < targetContentSec;

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
                onSlotsChange={handleSlotsChange}
                onAddSession={handleAddSession}
                onDeleteSession={handleDeleteSession}
                onCollapse={() => toggleExpand(dow)}
              />
            </div>
          );
        })}
      </div>
      )}
      <DragOverlay>
        {activeSlot ? (
          viewMode === "compact" ? (
            <div className="rounded border-s-4 border px-1.5 py-1.5 text-xs shadow-md bg-card border-border">
              <div className="font-semibold truncate leading-tight">
                {activeSlot.label || activeSlot.component?.name || activeSlot.slotType}
              </div>
            </div>
          ) : (
            <SlotCard slot={activeSlot} onEdit={() => {}} onDelete={() => {}} />
          )
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
