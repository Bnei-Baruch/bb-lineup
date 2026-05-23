"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SlotWithLesson, SLOT_TYPE_LABELS, SLOT_TYPE_COLORS, TRANSITION_LABELS, SlotType, TransitionType, LESSON_SLOT_TYPES } from "@/types";
import { formatDurationSec } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/dates";

function slotDuration(slot: SlotWithLesson): number {
  if (LESSON_SLOT_TYPES.includes(slot.slotType) && slot.lesson) {
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
  const label = slot.label || typeLabel;
  const showTypeLabel = (!!slot.label && slot.label !== typeLabel) || slot.slotType === "article_reading";
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
      <div className="flex items-start gap-1">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0">
              {showTypeLabel && (
                <p className="text-[10px] text-muted-foreground leading-tight">{typeLabel}</p>
              )}
              <span className="text-xs font-semibold truncate block">{label}</span>
            </div>
            {dur > 0 && (
              <span className="text-xs tabular-nums font-medium text-muted-foreground shrink-0">
                {formatDurationSec(dur)}
              </span>
            )}
          </div>

          {/* Transition type */}
          {slot.slotType === "transition" && slot.transitionType && (
            <p className="text-xs text-muted-foreground">
              {TRANSITION_LABELS[slot.transitionType as TransitionType] ?? slot.transitionType}
            </p>
          )}

          {/* Recorded lesson details */}
          {LESSON_SLOT_TYPES.includes(slot.slotType) && slot.lesson && (
            <div className="mt-0.5 text-xs text-muted-foreground space-y-0.5">
              {slot.lesson.sourceRef && <p className="truncate">{slot.lesson.sourceRef}</p>}
              {slot.lesson.articleSourceRef && <p className="truncate text-blue-600">{slot.lesson.articleSourceRef}</p>}
              <div className="flex gap-2">
                {slot.lesson.narratorName && <span>{slot.lesson.narratorName}</span>}
                {slot.lesson.recordingDate && <span>{formatDate(slot.lesson.recordingDate)}</span>}
              </div>
            </div>
          )}

          {/* Article source ref */}
          {slot.slotType === "article_reading" && slot.studyMaterialSourceRef && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{slot.studyMaterialSourceRef.split("|").slice(0, -1).join("|").trim()}</p>
          )}

          {/* Narrator script preview */}
          {slot.narratorScript && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{slot.narratorScript}</p>
          )}

          {/* Media code */}
          {slot.mediaCode && (
            <p className="text-xs text-pink-600 truncate mt-0.5">{slot.mediaCode}</p>
          )}

          {/* Group leader */}
          {slot.groupLeader && (
            <p className="text-xs text-green-700 truncate mt-0.5">{slot.groupLeader}</p>
          )}

          {/* Chevruta partners */}
          {slot.chevrutaPartners && (
            <p className="text-xs text-muted-foreground truncate">
              {JSON.parse(slot.chevrutaPartners).join(", ")}
            </p>
          )}

          {/* Notes */}
          {slot.notes && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{slot.notes}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(slot)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onDelete(slot.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
