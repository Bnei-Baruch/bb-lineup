"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/components/providers/KeycloakProvider";
import { DayWithSlots, SlotWithLesson, SLOT_TYPE_LABELS, SLOT_TYPE_COLORS, SlotType } from "@/types";
import { slotEffectiveDuration } from "@/lib/slot-duration";
import { formatDurationSec } from "@/lib/time";
import { addSecondsToTime } from "@/lib/timecodes";
import { computeDayTotalSec } from "@/lib/day-budget";
import { DAY_NAMES, dayDate, formatDate, parseWeekParam } from "@/lib/dates";

function slotDur(slot: SlotWithLesson): number {
  if (slot.parentSlotId) return 0;
  return slotEffectiveDuration(slot);
}

function sessionBounds(session: DayWithSlots): { startIndex: number; cutoffIndex: number } {
  return {
    startIndex: Math.min(session.contentStartIndex ?? 0, session.slots.length),
    cutoffIndex: Math.min(session.contentCutoffIndex ?? session.slots.length, session.slots.length),
  };
}

function sessionPreContentSec(session: DayWithSlots): number {
  const { startIndex } = sessionBounds(session);
  return session.slots.slice(0, startIndex).reduce((sum, s) => sum + slotDur(s), 0);
}

function sessionContentTotalSec(session: DayWithSlots): number {
  const { startIndex, cutoffIndex } = sessionBounds(session);
  return session.slots.slice(startIndex, cutoffIndex).reduce((sum, s) => sum + slotDur(s), 0);
}

function diffColor(diff: number | null): string {
  if (diff === null) return "text-muted-foreground";
  if (diff > 0) return "text-red-500";
  return "text-green-600";
}

function slotTitle(slot: SlotWithLesson): string {
  if (slot.slotType === "part_header") return `חלק ${slot.partNumber ?? "—"}`;
  return slot.label || slot.component?.name || SLOT_TYPE_LABELS[slot.slotType as SlotType] || slot.slotType;
}

interface CompactSlotBlockProps {
  slot: SlotWithLesson;
  clockTime: string;
  dur: number;
  draggable: boolean;
}

function CompactSlotBlock({ slot, clockTime, dur, draggable }: CompactSlotBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.id,
    disabled: !draggable,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const dragProps = draggable ? { ...attributes, ...listeners } : {};
  const dragCursor = draggable ? "cursor-grab active:cursor-grabbing" : "";

  if (slot.slotType === "part_header") {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...dragProps}
        className={`rounded bg-yellow-100 border border-yellow-300 px-1.5 py-0.5 text-[11px] font-bold flex items-center justify-between gap-1 select-none ${dragCursor}`}
      >
        <span className="truncate">{slotTitle(slot)}</span>
        <span className="tabular-nums text-muted-foreground shrink-0">{clockTime.slice(0, 5)}</span>
      </div>
    );
  }

  const colorClass = SLOT_TYPE_COLORS[slot.slotType as SlotType] ?? "border-gray-400 bg-gray-50";
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragProps}
      className={`rounded border-s-4 border px-1.5 py-1.5 text-xs select-none ${dragCursor} ${colorClass}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="tabular-nums text-muted-foreground shrink-0">{clockTime.slice(0, 5)}</span>
        {dur > 0 && <span className="tabular-nums text-muted-foreground shrink-0">{formatDurationSec(dur)}</span>}
      </div>
      <div className="font-semibold truncate leading-tight">{slotTitle(slot)}</div>
    </div>
  );
}

interface CompactSessionProps {
  session: DayWithSlots;
  isAdmin: boolean;
}

function CompactSession({ session, isAdmin }: CompactSessionProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${session.id}`, disabled: !isAdmin });

  const { startIndex, cutoffIndex } = sessionBounds(session);
  const contentTotalSec = sessionContentTotalSec(session);
  const targetSec = session.broadcastStartTime && session.broadcastEndTime
    ? computeDayTotalSec(session.broadcastStartTime, session.broadcastEndTime) - sessionPreContentSec(session)
    : null;
  const diff = targetSec !== null ? contentTotalSec - targetSec : null;
  const totalColor = diffColor(diff);

  const startLine = (
    <div key="start-line" className="flex items-center gap-1.5 py-0.5 select-none">
      <div className="flex-1 border-t-2 border-dashed border-blue-400" />
      <span className="text-[9px] font-semibold text-blue-500 whitespace-nowrap">תחילת תוכן</span>
      <div className="flex-1 border-t-2 border-dashed border-blue-400" />
    </div>
  );
  const cutoffLine = (
    <div key="cutoff-line" className="flex flex-col gap-0.5 py-0.5 select-none">
      <div className="flex items-center gap-1.5">
        <div className="flex-1 border-t-2 border-dashed border-orange-400" />
        <span className="text-[9px] font-semibold text-orange-500 whitespace-nowrap">סוף תוכן</span>
        <div className="flex-1 border-t-2 border-dashed border-orange-400" />
      </div>
      <div className={`text-[10px] font-bold tabular-nums text-center ${totalColor}`}>
        {formatDurationSec(contentTotalSec)}
        {diff !== null && diff !== 0 && (
          <span className="font-normal ms-1">
            ({diff > 0 ? "+" : ""}{formatDurationSec(Math.abs(diff)).replace(/^00:/, "")})
          </span>
        )}
      </div>
    </div>
  );

  let running = session.broadcastStartTime ?? "03:00";
  const items: ReactNode[] = [];
  if (startIndex === 0) items.push(startLine);

  session.slots.forEach((slot, i) => {
    if (i === startIndex && startIndex > 0) items.push(startLine);
    if (i === cutoffIndex) items.push(cutoffLine);

    const clockTime = running;
    const dur = slotEffectiveDuration(slot);
    running = addSecondsToTime(running, dur);

    items.push(<CompactSlotBlock key={slot.id} slot={slot} clockTime={clockTime} dur={dur} draggable={isAdmin} />);
  });

  if (cutoffIndex === session.slots.length) items.push(cutoffLine);

  return (
    <SortableContext items={session.slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`space-y-2 rounded transition-colors ${isOver ? "bg-primary/5" : ""}`}
      >
        {items}
      </div>
    </SortableContext>
  );
}

interface CompactWeekViewProps {
  dayGroups: Map<number, DayWithSlots[]>;
  weekStart: string;
}

export function CompactWeekView({ dayGroups, weekStart }: CompactWeekViewProps) {
  const { isAdmin } = useAuth();
  const parsedWeekStart = parseWeekParam(weekStart);

  return (
    <div className="grid grid-cols-7 gap-2">
      {Array.from({ length: 7 }, (_, dow) => {
        const sessions = dayGroups.get(dow) ?? [];
        const date = dayDate(parsedWeekStart, dow);

        const dayContentTotalSec = sessions.reduce((sum, s) => sum + sessionContentTotalSec(s), 0);
        const dayPreContentSec = sessions.reduce((sum, s) => sum + sessionPreContentSec(s), 0);
        const dayBroadcastSec = sessions.reduce((sum, s) => {
          if (!s.broadcastStartTime || !s.broadcastEndTime) return sum;
          return sum + computeDayTotalSec(s.broadcastStartTime, s.broadcastEndTime);
        }, 0);
        const dayTargetSec = dayBroadcastSec > 0 ? dayBroadcastSec - dayPreContentSec : null;
        const dayDiff = dayTargetSec !== null ? dayContentTotalSec - dayTargetSec : null;

        return (
          <div key={dow} className="flex flex-col border border-border rounded-lg overflow-hidden bg-card min-w-0">
            <div className="px-2 py-1.5 bg-muted border-b border-border flex items-center justify-between gap-1">
              <div>
                <div className="font-semibold text-sm">{DAY_NAMES[dow]}</div>
                <div className="text-xs text-muted-foreground tabular-nums">{formatDate(date)}</div>
              </div>
              {dayContentTotalSec > 0 && (
                <div className={`text-xs font-bold tabular-nums ${diffColor(dayDiff)}`}>
                  {formatDurationSec(dayContentTotalSec)}
                </div>
              )}
            </div>
            <div className="flex-1 p-1.5 space-y-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
              {sessions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">אין תוכן</p>
              )}
              {sessions.map((session) => (
                <div key={session.id}>
                  {sessions.length > 1 && (
                    <div className="text-[10px] font-semibold text-muted-foreground mb-1 truncate">
                      {session.sessionLabel ?? `שיעור ${session.sessionIndex + 1}`}
                    </div>
                  )}
                  <CompactSession session={session} isAdmin={isAdmin} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
