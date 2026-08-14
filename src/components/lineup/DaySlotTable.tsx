"use client";

import React from "react";
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
import { GripVertical, Trash2, ChevronUp, ChevronDown, CornerDownRight, CornerUpLeft } from "lucide-react";
import {
  COLS, TABLE_STYLE, Colgroup, SLOT_ROW_COLORS, TableLink,
  timeToSec, secToHHMMSS, itemLabel, contentText, linkifyText,
} from "./slot-table-shared";
import { parseCustomLinks } from "@/lib/custom-links";

interface DaySlotTableProps {
  slots: SlotWithLesson[];
  startTime: string;
  startIndex: number;
  cutoffIndex: number;
  onRowClick: (slot: SlotWithLesson) => void;
  onDelete: (id: string) => void;
  onReorder: (newSlots: SlotWithLesson[]) => void;
  onNestToggle: (slotId: string, parentSlotId: string | null) => void;
  onInlineEdit: (slotId: string, data: Partial<SlotWithLesson>) => void;
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

/** Click-to-edit text cell — a plain textarea while editing, saved on blur.
 *  onClick stops propagation so it doesn't also trigger the row's own click
 *  (which opens the full SlotEditor). */
function EditableCell({ value, onSave }: { value: string; onSave: (newValue: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (editing) { ref.current?.focus(); ref.current?.select(); }
  }, [editing]);

  function startEditing(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(value);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        rows={2}
        className="w-full resize-y rounded border border-input bg-background px-1.5 py-1 text-xs leading-snug"
      />
    );
  }

  return (
    <div
      onClick={startEditing}
      className={`min-h-[1.5em] -m-1 rounded p-1 leading-snug transition-colors hover:bg-accent/40 ${!value ? "text-muted-foreground/40" : ""}`}
      title="לחץ לעריכה"
    >
      {value ? linkifyText(value) : "—"}
    </div>
  );
}

function SlotRow({ slot, clockTime, endTime, isChild, canNest, altBg, onRowClick, onDelete, onNestToggle, onInlineEdit }: {
  slot: SlotWithLesson;
  clockTime: string;
  endTime: string;
  isChild: boolean;
  canNest: boolean;
  altBg: string;
  onRowClick: (slot: SlotWithLesson) => void;
  onDelete: (id: string) => void;
  onNestToggle: () => void;
  onInlineEdit: (data: Partial<SlotWithLesson>) => void;
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
  const rowBg = isChild ? "bg-indigo-100/70" : altBg;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      onClick={() => onRowClick(slot)}
      className={`hover:brightness-95 transition-colors cursor-pointer ${isChild ? "border-t-0 border-s-4" : "border-t border-s-2"} ${
        isChild ? "border-s-indigo-500" : `${rowColor} border-border`
      } ${rowBg}`}
    >
      {/* שעות — sticky to inline-end; drag handle on the time line, delete + nest toggle on a line below */}
      <td dir="ltr" className={`px-3 py-3 text-right tabular-nums font-semibold sticky end-0 z-10 border-s border-border group/timecell ${isChild ? "text-indigo-700" : "text-foreground"} ${rowBg}`}>
        <div className="flex items-center justify-end gap-1.5">
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
        <div className={`flex items-center justify-end gap-1.5 mt-0.5 transition-opacity ${isChild ? "opacity-100" : "opacity-0 group-hover/timecell:opacity-100"}`}>
          {(isChild || canNest) && (
            <button
              onClick={(e) => { e.stopPropagation(); onNestToggle(); }}
              className={`shrink-0 ${isChild ? "text-indigo-500 hover:text-indigo-700" : "text-muted-foreground hover:text-indigo-600"}`}
              title={isChild ? "בטל קינון" : "קנן תחת הפריט הקודם"}
            >
              {isChild ? <CornerUpLeft className="h-3.5 w-3.5" /> : <CornerDownRight className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(slot.id); }}
            className="shrink-0 text-muted-foreground hover:text-destructive"
            title="מחק פריט"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </td>
      {/* אייטם */}
      <td className={`px-3 py-3 font-medium whitespace-normal leading-snug border-s-2 border-s-slate-300 ${isChild ? "ps-8" : ""}`}>
        {isChild && <span className="text-indigo-400 font-bold me-1">↳</span>}
        {itemLabel(slot)}
      </td>
      {/* תוכן */}
      <td className="px-3 py-3 whitespace-pre-wrap leading-snug border-s-2 border-s-slate-300">
        {slot.slotType === "article_reading" ? (
          (() => { const { main, sub } = contentText(slot); return (<><span className="block">{main}</span>{sub && <span className="block text-[10px] text-muted-foreground mt-0.5">{sub}</span>}</>); })()
        ) : (
          <EditableCell
            value={contentText(slot).main}
            onSave={(v) => onInlineEdit({ narratorScript: v || null })}
          />
        )}
        {slot.lesson?.recordingDate && (
          <span className="block text-[10px] text-muted-foreground tabular-nums mt-0.5">
            {slot.lesson.recordingDate.slice(0, 10)}
          </span>
        )}
      </td>
      {/* הערות */}
      <td className="px-3 py-3 whitespace-pre-wrap leading-snug text-muted-foreground border-s-2 border-s-slate-300">
        {slot.groupLeader && <span className="block font-medium text-foreground">מנחים: {slot.groupLeader}</span>}
        <EditableCell value={slot.notes ?? ""} onSave={(v) => onInlineEdit({ notes: v || null })} />
      </td>
      {/* חומר לימוד */}
      <td className="px-3 py-3 border-s-2 border-s-slate-300">
        <div className="flex flex-col gap-1.5">
          {(slot.lineupLink ?? slot.component?.defaultLineupLink) && (
            <TableLink
              href={(slot.lineupLink ?? slot.component?.defaultLineupLink)!}
              label={slot.component?.name === "הודעות לסיום" ? "הודעות קריין" : "ליינאפ"}
            />
          )}
          {(slot.slidesLink ?? slot.component?.defaultSlidesLink) && (
            <TableLink href={(slot.slidesLink ?? slot.component?.defaultSlidesLink)!} label="שקופיות" />
          )}
          {(slot.studyMaterialLink || slot.lesson?.articleSourceLink) && (
            <TableLink href={slot.studyMaterialLink ?? slot.lesson?.articleSourceLink ?? ""} label="מאמר" />
          )}
          {slot.likutimLink && <TableLink href={slot.likutimLink} label={slot.likutimName ?? "ליקוטים"} />}
          {parseCustomLinks(slot.customLinks).map((link, i) => (
            <div key={i} className="w-full mt-1">
              <TableLink href={link.url} label={link.name || "קישור"} />
            </div>
          ))}
          {slot.lesson?.transcriptionLink && <TableLink href={slot.lesson.transcriptionLink} label="תמליל" />}
          {(slot.recordedLessonLink || slot.lesson?.kmPageLink) && (
            <TableLink href={slot.recordedLessonLink ?? slot.lesson?.kmPageLink ?? ""} label="וידאו" />
          )}
        </div>
      </td>
      {/* החל מדקה */}
      <td className="px-3 py-3 tabular-nums text-muted-foreground border-s-2 border-s-slate-300">
        {LESSON_SLOT_TYPES.includes(slot.slotType as SlotType)
          ? (() => { const hasSlotTC = slot.startTimecode && slot.endTimecode; return hasSlotTC ? slot.startTimecode : (slot.lesson?.startTimecode || "00:00:00"); })()
          : (slot.startTimecode ?? "")}
      </td>
      {/* דבר המתחיל */}
      <td className="px-3 py-3 whitespace-pre-wrap leading-snug text-muted-foreground border-s-2 border-s-slate-300">
        {slot.openingWords ?? ""}
      </td>
      {/* עד דקה */}
      <td className="px-3 py-3 tabular-nums text-muted-foreground border-s-2 border-s-slate-300">
        {LESSON_SLOT_TYPES.includes(slot.slotType as SlotType)
          ? (() => { const hasSlotTC = slot.startTimecode && slot.endTimecode; return hasSlotTC ? slot.endTimecode : (slot.lesson?.endTimecode || (slot.lesson?.videoDurationSec ? formatDurationSec(slot.lesson.videoDurationSec) : "")); })()
          : (slot.endTimecode ?? "")}
      </td>
      {/* דברי סיום */}
      <td className="px-3 py-3 whitespace-pre-wrap leading-snug text-muted-foreground border-s-2 border-s-slate-300">
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
      <td className="px-3 py-3 tabular-nums text-muted-foreground border-s-2 border-s-slate-300">{endTime}</td>
      {/* כתוביות */}
      <td className="px-3 py-3 text-center border-s-2 border-s-slate-300">
        {slot.hasSubtitles && <span className="text-green-600">✓</span>}
      </td>
      {/* סדנה */}
      <td className="px-3 py-3 text-center border-s-2 border-s-slate-300">
        {slot.hasWorkshopQuestions && <span className="text-green-600">✓</span>}
      </td>
      {/* שפה */}
      <td className="px-3 py-3 text-muted-foreground overflow-hidden border-s-2 border-s-slate-300">{slot.language ?? ""}</td>
    </tr>
  );
}

export function DaySlotTable({
  slots, startTime, startIndex, cutoffIndex,
  onRowClick, onDelete, onReorder, onNestToggle, onInlineEdit,
  onStartMoveUp, onStartMoveDown, onCutoffMoveUp, onCutoffMoveDown,
}: DaySlotTableProps) {
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

  let running = timeToSec(startTime);
  const slotClockSecs = new Map<string, number>();
  let _altIdx = 0;
  let prevTopLevelId: string | null = null;

  const rows = slots.map((slot) => {
    const isChild = !!slot.parentSlotId;
    const dur = slotEffectiveDuration(slot);
    const slotStartSec = isChild ? (slotClockSecs.get(slot.parentSlotId!) ?? running) : running;
    if (!isChild) {
      slotClockSecs.set(slot.id, running);
      running += dur;
    }
    const altIdx = slot.slotType === "part_header" ? -1 : _altIdx++;
    const row = {
      slot, isChild,
      clockTime: secToHHMMSS(slotStartSec),
      endTime: secToHHMMSS(slotStartSec + dur),
      altBg: altIdx % 2 !== 0 ? "bg-muted" : "bg-card",
      prevTopLevelId,
    };
    if (!isChild && slot.slotType !== "part_header") prevTopLevelId = slot.id;
    return row;
  });

  return (
    <table className="text-xs whitespace-nowrap border-separate border-spacing-0" style={TABLE_STYLE}>
      <Colgroup />
      <thead>
        <tr className="bg-muted">
          {COLS.map((c) => (
            <th key={c.key} className={`sticky top-0 z-20 px-3 py-3 text-start bg-muted ${c.sep ? "border-s-2 border-s-slate-300" : ""} ${c.cls}`}>
              <div className="font-semibold text-foreground leading-tight">{c.label}</div>
              <div className="font-normal text-muted-foreground text-xs leading-tight">{c.en}</div>
            </th>
          ))}
        </tr>
      </thead>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <tbody>
            {clampedStart === 0 && (
              <CutoffBannerRow color="blue" label="▶ תחילת תוכן" onMoveUp={onStartMoveUp} onMoveDown={onStartMoveDown} />
            )}
            {rows.map(({ slot, clockTime, endTime, isChild, altBg, prevTopLevelId }, i) => (
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
                  canNest={!isChild && slot.slotType !== "part_header" && prevTopLevelId !== null}
                  altBg={altBg}
                  onRowClick={onRowClick}
                  onDelete={onDelete}
                  onNestToggle={() => onNestToggle(slot.id, isChild ? null : prevTopLevelId)}
                  onInlineEdit={(data) => onInlineEdit(slot.id, data)}
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
  );
}
