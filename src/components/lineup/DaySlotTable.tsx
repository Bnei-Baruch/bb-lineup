"use client";

import React, { useRef } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SlotWithLesson, SlotType, LESSON_SLOT_TYPES } from "@/types";
import { timecodeDuration } from "@/lib/timecodes";
import { formatDurationSec } from "@/lib/time";
import { slotEffectiveDuration } from "@/lib/slot-duration";
import { GripVertical, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import {
  COLS, TABLE_STYLE, Colgroup, SLOT_ROW_COLORS, TableLink,
  timeToSec, secToHHMMSS, itemLabel, contentText,
} from "./slot-table-shared";

interface DaySlotTableProps {
  slots: SlotWithLesson[];
  startTime: string;
  startIndex: number;
  cutoffIndex: number;
  onRowClick: (slot: SlotWithLesson) => void;
  onDelete: (id: string) => void;
  onReorder: (newSlots: SlotWithLesson[]) => void;
  onStartMoveUp: () => void;
  onStartMoveDown: () => void;
  onCutoffMoveUp: () => void;
  onCutoffMoveDown: () => void;
}

function CutoffBannerRow({ color, label, onMoveUp, onMoveDown }: {
  color: "orange" | "blue"; label: string; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const colors = color === "orange"
    ? { border: "border-orange-400", bg: "bg-orange-100", text: "text-orange-700", btn: "text-orange-500 hover:text-orange-700 hover:bg-orange-200" }
    : { border: "border-blue-400", bg: "bg-blue-100", text: "text-blue-700", btn: "text-blue-500 hover:text-blue-700 hover:bg-blue-200" };
  return (
    <tr>
      <td colSpan={COLS.length} className={`px-0 py-0 border-y-2 ${colors.border} ${colors.bg}`}>
        <div className="flex items-center justify-center gap-2 px-4 py-1.5">
          <span className={`text-xs font-bold tracking-wide ${colors.text}`}>{label}</span>
          <div className="flex gap-0.5">
            <button onClick={onMoveUp} className={`p-0.5 rounded transition-colors ${colors.btn}`} title="הזז למעלה">
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button onClick={onMoveDown} className={`p-0.5 rounded transition-colors ${colors.btn}`} title="הזז למטה">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function SlotRow({ slot, clockTime, endTime, isChild, childCount, altBg, onRowClick, onDelete }: {
  slot: SlotWithLesson;
  clockTime: string;
  endTime: string;
  isChild: boolean;
  childCount: number;
  altBg: string;
  onRowClick: (slot: SlotWithLesson) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (slot.slotType === "part_header") {
    return (
      <tr ref={setNodeRef} style={style} className="bg-yellow-100 border-t-2 border-yellow-400 cursor-pointer" onClick={() => onRowClick(slot)}>
        <td colSpan={COLS.length} className="px-3 py-3 font-bold text-sm text-yellow-900 tracking-wide">
          <div className="flex items-center gap-2">
            <button {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} className="cursor-grab active:cursor-grabbing text-yellow-700/60 hover:text-yellow-900 shrink-0">
              <GripVertical className="h-4 w-4" />
            </button>
            <span className="flex-1">חלק {slot.partNumber ?? "—"} / Part {slot.partNumber ?? "—"}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(slot.id); }}
              className="text-yellow-700/60 hover:text-destructive shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  const rowColor = SLOT_ROW_COLORS[slot.slotType] ?? "border-s-border";
  const rowBg = isChild ? "bg-indigo-50/70" : altBg;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      onClick={() => onRowClick(slot)}
      className={`border-s-2 hover:brightness-95 transition-colors cursor-pointer ${isChild ? "border-t-0" : "border-t"} ${
        isChild ? "border-s-indigo-300" : `${rowColor} border-border`
      } ${rowBg}`}
    >
      {/* שעות — sticky to inline-end; drag handle + delete live here */}
      <td dir="ltr" className={`px-3 py-3 text-right tabular-nums font-semibold sticky end-0 z-10 border-s border-border group/timecell ${isChild ? "text-indigo-600/80" : "text-foreground"} ${rowBg}`}>
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(slot.id); }}
            className="opacity-0 group-hover/timecell:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
            title="מחק פריט"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <span className={isChild ? "italic text-muted-foreground" : ""}>{clockTime}</span>
          <button
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
            title="גרור לשינוי סדר"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
      {/* אייטם */}
      <td className={`px-3 py-3 font-medium whitespace-normal leading-snug border-s-2 border-s-slate-300 ${isChild ? "ps-8 italic text-indigo-700/80" : ""}`}>
        {childCount > 0 && (
          <span className="inline-flex items-center gap-0.5 me-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 align-middle">
            {childCount === 1 ? "מקנן פריט" : `מקנן ${childCount} פריטים`}
          </span>
        )}
        {itemLabel(slot)}
      </td>
      {/* תוכן */}
      <td className="px-3 py-3 whitespace-pre-wrap leading-snug">
        {(() => { const { main, sub } = contentText(slot); return (<><span className="block">{main}</span>{sub && <span className="block text-[10px] text-muted-foreground mt-0.5">{sub}</span>}</>); })()}
        {slot.lesson?.recordingDate && (
          <span className="block text-[10px] text-muted-foreground tabular-nums mt-0.5">
            {slot.lesson.recordingDate.slice(0, 10)}
          </span>
        )}
        {slot.lineupLink && <TableLink href={slot.lineupLink} label="ליינאפ" />}
      </td>
      {/* הערות */}
      <td className="px-3 py-3 whitespace-pre-wrap leading-snug text-muted-foreground border-s-2 border-s-slate-300">
        {slot.notes ?? ""}
      </td>
      {/* חומר לימוד */}
      <td className="px-3 py-3 border-s-2 border-s-slate-300">
        <div className="flex flex-col gap-1">
          {(slot.studyMaterialLink || slot.lesson?.articleSourceLink) && (
            <TableLink href={slot.studyMaterialLink ?? slot.lesson?.articleSourceLink ?? ""} label="מאמר" />
          )}
          {slot.likutimLink && <TableLink href={slot.likutimLink} label={slot.likutimName ?? "ליקוטים"} />}
          {slot.lesson?.transcriptionLink && <TableLink href={slot.lesson.transcriptionLink} label="תמליל" />}
        </div>
      </td>
      {/* שיעור מוקלט */}
      <td className="px-3 py-3 border-s-2 border-s-slate-300">
        {(slot.recordedLessonLink || slot.lesson?.kmPageLink) && (
          <TableLink href={slot.recordedLessonLink ?? slot.lesson?.kmPageLink ?? ""} label="וידאו" />
        )}
      </td>
      {/* החל מדקה */}
      <td className="px-3 py-3 tabular-nums text-muted-foreground border-s-2 border-s-slate-300">
        {LESSON_SLOT_TYPES.includes(slot.slotType as SlotType)
          ? (() => { const hasSlotTC = slot.startTimecode && slot.endTimecode; return hasSlotTC ? slot.startTimecode : (slot.lesson?.startTimecode || "00:00:00"); })()
          : (slot.startTimecode ?? "")}
      </td>
      {/* דבר המתחיל */}
      <td className="px-3 py-3 whitespace-pre-wrap leading-snug text-muted-foreground">
        {slot.openingWords ?? ""}
      </td>
      {/* עד דקה */}
      <td className="px-3 py-3 tabular-nums text-muted-foreground">
        {LESSON_SLOT_TYPES.includes(slot.slotType as SlotType)
          ? (() => { const hasSlotTC = slot.startTimecode && slot.endTimecode; return hasSlotTC ? slot.endTimecode : (slot.lesson?.endTimecode || (slot.lesson?.videoDurationSec ? formatDurationSec(slot.lesson.videoDurationSec) : "")); })()
          : (slot.endTimecode ?? "")}
      </td>
      {/* דברי סיום */}
      <td className="px-3 py-3 whitespace-pre-wrap leading-snug text-muted-foreground">
        {slot.closingWords ?? ""}
      </td>
      {/* משך */}
      <td className="px-3 py-3 tabular-nums font-medium border-s-2 border-s-slate-300">
        {(() => {
          const hasSlotTCr = slot.startTimecode && slot.endTimecode;
          const rInTC = hasSlotTCr ? slot.startTimecode : slot.lesson?.startTimecode;
          const rOutTC = hasSlotTCr ? slot.endTimecode : slot.lesson?.endTimecode;
          const recordedTime = rInTC && rOutTC ? timecodeDuration(rInTC, rOutTC) : null;
          const dur = slotEffectiveDuration(slot);
          return recordedTime ?? (dur > 0 ? formatDurationSec(dur) : "");
        })()}
      </td>
      {/* שעת סיום */}
      <td className="px-3 py-3 tabular-nums text-muted-foreground">{endTime}</td>
      {/* כתוביות */}
      <td className="px-3 py-3 text-center border-s-2 border-s-slate-300">
        {slot.hasSubtitles && <span className="text-green-600">✓</span>}
      </td>
      {/* סדנה */}
      <td className="px-3 py-3 text-center">
        {slot.hasWorkshopQuestions && <span className="text-green-600">✓</span>}
      </td>
      {/* שפה */}
      <td className="px-3 py-3 text-muted-foreground overflow-hidden">{slot.language ?? ""}</td>
    </tr>
  );
}

export function DaySlotTable({
  slots, startTime, startIndex, cutoffIndex,
  onRowClick, onDelete, onReorder,
  onStartMoveUp, onStartMoveDown, onCutoffMoveUp, onCutoffMoveDown,
}: DaySlotTableProps) {
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  function onBodyScroll() {
    if (headerScrollRef.current && bodyScrollRef.current) {
      headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = slots.findIndex((s) => s.id === active.id);
    const newIndex = slots.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(slots, oldIndex, newIndex));
  }

  const clampedStart = Math.min(startIndex, slots.length);
  const clampedCutoff = Math.min(cutoffIndex, slots.length);

  const childCountBySlotId = new Map<string, number>();
  for (const s of slots) {
    if (s.parentSlotId) childCountBySlotId.set(s.parentSlotId, (childCountBySlotId.get(s.parentSlotId) ?? 0) + 1);
  }

  let running = timeToSec(startTime);
  const slotClockSecs = new Map<string, number>();
  let _altIdx = 0;

  const rows = slots.map((slot) => {
    const isChild = !!slot.parentSlotId;
    const dur = slotEffectiveDuration(slot);
    const slotStartSec = isChild ? (slotClockSecs.get(slot.parentSlotId!) ?? running) : running;
    if (!isChild) {
      slotClockSecs.set(slot.id, running);
      running += dur;
    }
    const altIdx = slot.slotType === "part_header" ? -1 : _altIdx++;
    return {
      slot, isChild,
      clockTime: secToHHMMSS(slotStartSec),
      endTime: secToHHMMSS(slotStartSec + dur),
      altBg: altIdx % 2 !== 0 ? "bg-muted" : "bg-card",
    };
  });

  return (
    <div className="relative">
      {/* Sticky column header — overflow-x hidden, scrollLeft synced by JS with body */}
      <div
        ref={headerScrollRef}
        className="sticky top-0 z-20 overflow-x-hidden border border-border rounded-t-lg bg-muted"
      >
        <table className="text-xs whitespace-nowrap border-separate border-spacing-0" style={TABLE_STYLE}>
          <Colgroup />
          <thead>
            <tr className="bg-muted">
              {COLS.map((c) => (
                <th key={c.key} className={`px-3 py-3 text-start bg-muted ${c.sep ? "border-s-2 border-s-slate-300" : ""} ${c.cls}`}>
                  <div className="font-semibold text-foreground leading-tight">{c.label}</div>
                  <div className="font-normal text-muted-foreground text-xs leading-tight">{c.en}</div>
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>

      {/* Body — horizontally scrollable; drives header scroll via onBodyScroll */}
      <div
        ref={bodyScrollRef}
        className="overflow-x-auto border-x border-b border-border rounded-b-lg shadow-sm"
        onScroll={onBodyScroll}
      >
        <table className="text-xs whitespace-nowrap border-separate border-spacing-0" style={TABLE_STYLE}>
          <Colgroup />
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <tbody>
                {clampedStart === 0 && (
                  <CutoffBannerRow color="blue" label="▶ תחילת תוכן" onMoveUp={onStartMoveUp} onMoveDown={onStartMoveDown} />
                )}
                {rows.map(({ slot, clockTime, endTime, isChild, altBg }, i) => (
                  <React.Fragment key={slot.id}>
                    {i === clampedStart && clampedStart > 0 && (
                      <CutoffBannerRow color="blue" label="▶ תחילת תוכן" onMoveUp={onStartMoveUp} onMoveDown={onStartMoveDown} />
                    )}
                    {i === clampedCutoff && (
                      <CutoffBannerRow color="orange" label="■ סוף תוכן" onMoveUp={onCutoffMoveUp} onMoveDown={onCutoffMoveDown} />
                    )}
                    <SlotRow
                      slot={slot}
                      clockTime={clockTime}
                      endTime={endTime}
                      isChild={isChild}
                      childCount={childCountBySlotId.get(slot.id) ?? 0}
                      altBg={altBg}
                      onRowClick={onRowClick}
                      onDelete={onDelete}
                    />
                  </React.Fragment>
                ))}
                {clampedCutoff === rows.length && (
                  <CutoffBannerRow color="orange" label="■ סוף תוכן" onMoveUp={onCutoffMoveUp} onMoveDown={onCutoffMoveDown} />
                )}
                {slots.length === 0 && (
                  <tr>
                    <td colSpan={COLS.length} className="px-4 py-12 text-center text-muted-foreground">
                      <p>אין פריטים ביום זה</p>
                      <p className="text-xs mt-1">הוסף תוכן מהתפריט למעלה</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      </div>
    </div>
  );
}
