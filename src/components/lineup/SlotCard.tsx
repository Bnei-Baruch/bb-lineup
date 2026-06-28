"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SlotWithLesson, SLOT_TYPE_LABELS, SLOT_TYPE_COLORS, TRANSITION_LABELS, SlotType, TransitionType, LESSON_SLOT_TYPES } from "@/types";
import { formatDurationSec } from "@/lib/time";
import { timecodeToSeconds } from "@/lib/timecodes";
import { Button } from "@/components/ui/button";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/dates";

function slotDuration(slot: SlotWithLesson): number {
  if (LESSON_SLOT_TYPES.includes(slot.slotType) && slot.lesson) {
    const hasSlotTC = slot.startTimecode && slot.endTimecode;
    const inTC = hasSlotTC ? slot.startTimecode : slot.lesson.startTimecode;
    const outTC = hasSlotTC ? slot.endTimecode : slot.lesson.endTimecode;
    if (inTC && outTC) {
      const dur = timecodeToSeconds(outTC) - timecodeToSeconds(inTC);
      if (dur > 0) return dur;
    }
    return slot.lesson.videoDurationSec ?? 0;
  }
  return slot.durationSec ?? 0;
}

interface SlotCardProps {
  slot: SlotWithLesson;
  onEdit: (slot: SlotWithLesson) => void;
  onDelete: (id: string) => void;
}

export function SlotCard({ slot, onEdit, onDelete }: SlotCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slot.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const colorClass = SLOT_TYPE_COLORS[slot.slotType as SlotType] ?? "border-gray-400 bg-gray-50";
  const typeLabel = SLOT_TYPE_LABELS[slot.slotType as SlotType] || slot.slotType;
  const label = slot.label || slot.component?.name || typeLabel;
  const showTypeLabel = slot.slotType === "article_reading" || label !== typeLabel;
  const dur = slotDuration(slot);

  // Part header renders differently
  if (slot.slotType === "part_header") {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="rounded-md bg-yellow-100 border border-yellow-300 px-2 py-1 select-none flex items-center gap-1"
      >
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground shrink-0">
          <GripVertical className="h-3 w-3" />
        </button>
        <span className="text-xs font-bold flex-1">
          חלק {slot.partNumber ?? "—"} / Part {slot.partNumber ?? "—"}
        </span>
        <div className="flex shrink-0 gap-0.5">
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onEdit(slot)}><Pencil className="h-3 w-3" /></Button>
          <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => onDelete(slot.id)}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border-s-4 border border-border ${colorClass} p-2 select-none`}
    >
      <div className="flex items-start gap-2">
        {/* Grip */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Title + details */}
        <div className="flex-1 min-w-0">
          {showTypeLabel && (
            <p className="text-[10px] text-muted-foreground leading-tight">{typeLabel}</p>
          )}
          <p className="text-sm font-semibold leading-snug">{label}</p>
        </div>

        {/* Duration on the right */}
        <div className="shrink-0 text-right">
          {dur > 0 && (
            <span className="text-sm tabular-nums font-semibold text-foreground">
              {formatDurationSec(dur)}
              {slot.lesson?.videoDurationSec && dur !== slot.lesson.videoDurationSec && (
                <span className="text-xs font-normal text-muted-foreground ms-1">({formatDurationSec(slot.lesson.videoDurationSec)})</span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Details + actions — aligned under title (offset by grip) */}
      <div className="flex gap-2 mt-0.5">
        <div className="shrink-0 w-4" />{/* grip placeholder */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground space-y-0.5">
            {slot.slotType === "transition" && slot.transitionType && (
              <p>{TRANSITION_LABELS[slot.transitionType as TransitionType] ?? slot.transitionType}</p>
            )}
            {LESSON_SLOT_TYPES.includes(slot.slotType) && slot.lesson && (
              <>
                {slot.lesson.sourceRef && <p>{slot.lesson.sourceRef}</p>}
                {slot.lesson.articleSourceRef && <p className="text-blue-600">{slot.lesson.articleSourceRef}</p>}
                <div className="flex gap-2 flex-wrap">
                  {slot.lesson.narratorName && <span>{slot.lesson.narratorName}</span>}
                  {slot.lesson.recordingDate && <span>{formatDate(slot.lesson.recordingDate)}</span>}
                </div>
              </>
            )}
            {slot.slotType === "article_reading" && (
              <>
                {slot.studyMaterialSourceRef && (
                  <p>{slot.studyMaterialSourceRef.split(" | ").slice(0, -1).join(" | ").trim()}</p>
                )}
                {(slot.studyMaterialSource?.bookVolume != null || slot.studyMaterialSource?.bookPage != null) && (
                  <p className="tabular-nums font-medium text-foreground/80">
                    {[
                      slot.studyMaterialSource.bookVolume != null ? `כרך ${slot.studyMaterialSource.bookVolume}` : null,
                      slot.studyMaterialSource.bookPage != null ? `עמוד ${slot.studyMaterialSource.bookPage}` : null,
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
                {(slot.studyMaterialLink || slot.studyMaterialSource?.link) && (
                  <a
                    href={slot.studyMaterialLink ?? slot.studyMaterialSource?.link ?? ""}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    🔗 פתח מאמר
                  </a>
                )}
              </>
            )}
            {slot.openingWords && <p><span className="text-foreground/60">פתיחה:</span> {slot.openingWords}</p>}
            {slot.closingWords && <p><span className="text-foreground/60">סיום:</span> {slot.closingWords}</p>}
            {slot.narratorScript && <p>{slot.narratorScript}</p>}
            {slot.mediaCode && <p className="text-pink-600">{slot.mediaCode}</p>}
            {slot.groupLeader && <p className="text-green-700">{slot.groupLeader}</p>}
            {slot.likutimName && (
              slot.likutimLink
                ? <a href={slot.likutimLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{slot.likutimName}</a>
                : <p>{slot.likutimName}</p>
            )}
            {slot.chevrutaPartners && <p>{JSON.parse(slot.chevrutaPartners).join(", ")}</p>}
            {slot.notes && <p>{slot.notes}</p>}
          </div>
          <div className="flex justify-end gap-0.5 mt-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(slot)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onDelete(slot.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
