"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SlotWithLesson, SLOT_TYPE_LABELS, SLOT_TYPE_COLORS, TRANSITION_LABELS, SlotType, TransitionType, LESSON_SLOT_TYPES } from "@/types";
import { formatDurationSec } from "@/lib/time";
import { timecodeToSeconds } from "@/lib/timecodes";
import { Button } from "@/components/ui/button";
import { GripVertical, Pencil, Trash2 } from "lucide-react";

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

interface DaySlotRowProps {
  slot: SlotWithLesson;
  clockTime?: string;
  onEdit: (slot: SlotWithLesson) => void;
  onDelete: (id: string) => void;
}

export function DaySlotRow({ slot, clockTime, onEdit, onDelete }: DaySlotRowProps) {
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

  if (slot.slotType === "part_header") {
    return (
      <div ref={setNodeRef} style={style} className="bg-yellow-100 border-2 border-yellow-400 rounded-md px-3 py-2 select-none flex items-center gap-2">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground shrink-0">
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="font-bold text-sm flex-1">חלק {slot.partNumber ?? "—"} / Part {slot.partNumber ?? "—"}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{clockTime}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(slot)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(slot.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className={`border-s-4 border border-border ${colorClass} rounded-md p-3 select-none`}>
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground shrink-0">
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xs tabular-nums text-muted-foreground shrink-0">{clockTime}</span>
              <div className="min-w-0">
                {showTypeLabel && <p className="text-[10px] text-muted-foreground leading-none mb-0.5">{typeLabel}</p>}
                <span className="text-sm font-semibold">{label}</span>
              </div>
              {slot.slotType === "transition" && slot.transitionType && (
                <span className="text-xs text-muted-foreground">({TRANSITION_LABELS[slot.transitionType as TransitionType] ?? slot.transitionType})</span>
              )}
            </div>
            {dur > 0 && (
              <span className="text-sm tabular-nums font-medium text-muted-foreground shrink-0">
                {formatDurationSec(dur)}
              </span>
            )}
          </div>

          {/* Narrator script */}
          {slot.narratorScript && (
            <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{slot.narratorScript}</p>
          )}

          {/* Opening / closing words */}
          {(slot.openingWords || slot.closingWords) && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              {slot.openingWords && <p><span className="text-foreground/60">פתיחה:</span> {slot.openingWords}</p>}
              {slot.closingWords && <p><span className="text-foreground/60">סיום:</span> {slot.closingWords}</p>}
            </div>
          )}

          {/* Links row */}
          {(slot.lineupLink || slot.likutimLink) && (
            <div className="flex gap-2 flex-wrap">
              {slot.lineupLink && (
                <a
                  href={slot.lineupLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-blue-600 hover:underline"
                >
                  ליינאפ
                </a>
              )}
              {slot.likutimLink && (
                <a
                  href={slot.likutimLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {slot.likutimName ?? "ליקוטים"}
                </a>
              )}
            </div>
          )}

          {/* Lesson info */}
          {slot.lesson?.sourceRef && (
            <p className="text-xs truncate">{slot.lesson.sourceRef}</p>
          )}

          {/* Timecodes */}
          {LESSON_SLOT_TYPES.includes(slot.slotType as SlotType) && (
            <div className="flex gap-3 text-xs text-muted-foreground tabular-nums">
              {(() => {
                const hasSlotTC = slot.startTimecode && slot.endTimecode;
                const inTC = hasSlotTC ? slot.startTimecode : (slot.lesson?.startTimecode || "00:00:00");
                const outTC = hasSlotTC ? slot.endTimecode : (slot.lesson?.endTimecode || (slot.lesson?.videoDurationSec ? formatDurationSec(slot.lesson.videoDurationSec) : "—"));
                return (<><span>מ: {inTC}</span><span>עד: {outTC}</span></>);
              })()}
            </div>
          )}

          {/* Media */}
          {slot.mediaCode && (
            <p className="text-xs text-pink-600">{slot.mediaCode}</p>
          )}

          {/* Group leader */}
          {slot.groupLeader && (
            <p className="text-xs text-green-700">{slot.groupLeader}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(slot)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(slot.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
