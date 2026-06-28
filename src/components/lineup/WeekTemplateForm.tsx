"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GripVertical, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { parseDurationToSec, formatDurationSec } from "@/lib/time";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

interface WeekTemplateSlot {
  id: string;
  slotType: string;
  componentId?: string;
  label?: string;
  durationSec?: number;
}

interface DayState {
  slots: WeekTemplateSlot[];
  contentStartIndex: number;
  contentCutoffIndex: number | null;
}

interface WeekTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  days: string;
}

interface Props {
  open: boolean;
  template: WeekTemplate | null;
  components: { id: string; name: string; slotType: string; defaultDurationSec: number | null }[];
  onSave: (data: Partial<WeekTemplate>) => void;
  onClose: () => void;
}

let _idCounter = 0;
function makeId() { return `slot-${++_idCounter}`; }

function addIds(slots: Omit<WeekTemplateSlot, "id">[]): WeekTemplateSlot[] {
  return slots.map((s) => ({ ...s, id: makeId() }));
}

function stripIds(slots: WeekTemplateSlot[]): Omit<WeekTemplateSlot, "id">[] {
  return slots.map(({ id: _id, ...rest }) => rest);
}

function parseDayState(raw: unknown): DayState {
  if (Array.isArray(raw)) {
    return { slots: addIds(raw as Omit<WeekTemplateSlot, "id">[]), contentStartIndex: 0, contentCutoffIndex: null };
  }
  if (raw && typeof raw === "object") {
    const r = raw as { slots?: unknown[]; contentStartIndex?: number; contentCutoffIndex?: number | null };
    return {
      slots: addIds((r.slots ?? []) as Omit<WeekTemplateSlot, "id">[]),
      contentStartIndex: r.contentStartIndex ?? 0,
      contentCutoffIndex: r.contentCutoffIndex ?? null,
    };
  }
  return { slots: [], contentStartIndex: 0, contentCutoffIndex: null };
}

interface SortableRowProps {
  slot: WeekTemplateSlot;
  index: number;
  components: Props["components"];
  onUpdate: (patch: Partial<WeekTemplateSlot>) => void;
  onRemove: () => void;
}

function SortableRow({ slot, index: _index, components, onUpdate, onRemove }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const badge =
    slot.componentId ? { label: "קבוע", cls: "bg-blue-100 text-blue-700" }
    : slot.slotType === "recorded_lesson" ? { label: "שיעור", cls: "bg-purple-100 text-purple-700" }
    : slot.slotType === "article_reading" ? { label: "מאמר", cls: "bg-green-100 text-green-700" }
    : { label: "מותאם", cls: "bg-gray-100 text-gray-700" };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 bg-muted rounded-md px-2 py-1.5">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
        <GripVertical className="h-4 w-4" />
      </button>

      <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${badge.cls}`}>{badge.label}</span>

      {slot.componentId ? (
        <select
          value={slot.componentId}
          onChange={(e) => onUpdate({ componentId: e.target.value || undefined })}
          className="flex-1 text-xs border border-input rounded px-2 py-0.5 bg-background"
        >
          <option value="">בחר קומפוננטה</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      ) : (
        <Input
          value={slot.label ?? ""}
          onChange={(e) => onUpdate({ label: e.target.value || undefined })}
          placeholder="תווית (אופציונלי)"
          className="flex-1 h-6 text-xs px-2"
        />
      )}

      <Input
        value={slot.durationSec ? formatDurationSec(slot.durationSec) : ""}
        onChange={(e) => onUpdate({ durationSec: parseDurationToSec(e.target.value) ?? undefined })}
        placeholder="משך"
        className="w-20 h-6 text-xs px-2"
        dir="ltr"
      />

      <button type="button" onClick={onRemove} className="text-destructive hover:text-destructive/80 shrink-0">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ContentLine({ label, color, onUp, onDown, canUp, canDown }: {
  label: string; color: "blue" | "orange";
  onUp: () => void; onDown: () => void; canUp: boolean; canDown: boolean;
}) {
  const cls = color === "blue"
    ? "border-blue-400 text-blue-700 bg-blue-50"
    : "border-orange-400 text-orange-700 bg-orange-50";
  return (
    <div className={`flex items-center gap-1 border-y py-0.5 px-2 text-[11px] font-semibold ${cls}`}>
      <button type="button" onClick={onUp} disabled={!canUp} className="disabled:opacity-30 hover:opacity-70">
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onDown} disabled={!canDown} className="disabled:opacity-30 hover:opacity-70">
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <span>{label}</span>
    </div>
  );
}

export function WeekTemplateForm({ open, template, components, onSave, onClose }: Props) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [activeDay, setActiveDay] = useState(0);
  const [daysState, setDaysState] = useState<Record<string, DayState>>(() => {
    if (template?.days) {
      try {
        const parsed: Record<string, unknown> = JSON.parse(template.days);
        return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, parseDayState(v)]));
      } catch {
        return {};
      }
    }
    return {};
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  function getDayState(day: number): DayState {
    return daysState[String(day)] ?? { slots: [], contentStartIndex: 0, contentCutoffIndex: null };
  }

  function setDayState(day: number, patch: Partial<DayState>) {
    setDaysState((prev) => {
      const cur = prev[String(day)] ?? { slots: [], contentStartIndex: 0, contentCutoffIndex: null };
      return { ...prev, [String(day)]: { ...cur, ...patch } };
    });
  }

  function addSlot(day: number, slotType: string, componentId?: string) {
    const comp = componentId ? components.find((c) => c.id === componentId) : null;
    const state = getDayState(day);
    setDayState(day, {
      slots: [...state.slots, { id: makeId(), slotType, componentId: componentId ?? undefined, durationSec: comp?.defaultDurationSec ?? undefined }],
    });
  }

  function removeSlot(day: number, index: number) {
    const state = getDayState(day);
    const newSlots = state.slots.filter((_, i) => i !== index);
    const newLen = newSlots.length;
    setDayState(day, {
      slots: newSlots,
      contentStartIndex: Math.min(state.contentStartIndex, newLen),
      contentCutoffIndex: state.contentCutoffIndex !== null ? Math.min(state.contentCutoffIndex, newLen) : null,
    });
  }

  function updateSlot(day: number, index: number, patch: Partial<WeekTemplateSlot>) {
    const state = getDayState(day);
    setDayState(day, { slots: state.slots.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const state = getDayState(activeDay);
    const oldIdx = state.slots.findIndex((s) => s.id === active.id);
    const newIdx = state.slots.findIndex((s) => s.id === over.id);
    if (oldIdx !== -1 && newIdx !== -1) setDayState(activeDay, { slots: arrayMove(state.slots, oldIdx, newIdx) });
  }

  function handleSave() {
    const stripped = Object.fromEntries(
      Object.entries(daysState).map(([k, v]) => [k, {
        slots: stripIds(v.slots),
        contentStartIndex: v.contentStartIndex,
        contentCutoffIndex: v.contentCutoffIndex,
      }])
    );
    onSave({ name, description: description || null, isDefault, days: JSON.stringify(stripped) } as Partial<WeekTemplate>);
  }

  const activeDayState = getDayState(activeDay);
  const currentSlots = activeDayState.slots;
  const startIdx = activeDayState.contentStartIndex;
  const cutoffIdx = activeDayState.contentCutoffIndex ?? currentSlots.length;

  function renderSlotList() {
    const elements: React.ReactNode[] = [];
    for (let i = 0; i <= currentSlots.length; i++) {
      if (i === startIdx) {
        elements.push(
          <ContentLine key="start-line" label="תחילת תוכן" color="blue"
            canUp={startIdx > 0}
            canDown={startIdx < cutoffIdx}
            onUp={() => setDayState(activeDay, { contentStartIndex: Math.max(0, startIdx - 1) })}
            onDown={() => setDayState(activeDay, { contentStartIndex: Math.min(cutoffIdx, startIdx + 1) })}
          />
        );
      }
      if (i === cutoffIdx && cutoffIdx !== startIdx) {
        elements.push(
          <ContentLine key="cutoff-line" label="סוף תוכן" color="orange"
            canUp={cutoffIdx > startIdx}
            canDown={cutoffIdx < currentSlots.length}
            onUp={() => setDayState(activeDay, { contentCutoffIndex: Math.max(startIdx, cutoffIdx - 1) })}
            onDown={() => {
              const next = cutoffIdx + 1;
              setDayState(activeDay, { contentCutoffIndex: next >= currentSlots.length ? null : next });
            }}
          />
        );
      }
      if (i < currentSlots.length) {
        const slot = currentSlots[i];
        elements.push(
          <SortableRow
            key={slot.id}
            slot={slot}
            index={i}
            components={components}
            onUpdate={(patch) => updateSlot(activeDay, i, patch)}
            onRemove={() => removeSlot(activeDay, i)}
          />
        );
      }
    }
    return elements;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "עריכת תבנית שבועית" : "תבנית שבועית חדשה"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>שם</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="תבנית רגילה" />
            </div>
            <div className="space-y-1.5">
              <Label>תיאור</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תבנית לשבוע רגיל..." />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              תבנית ברירת מחדל
            </label>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold border-b pb-1">מבנה ימים</h3>

            <div className="flex flex-wrap gap-1">
              {DAY_NAMES.map((dayName, i) => {
                const count = getDayState(i).slots.length;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveDay(i)}
                    className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                      activeDay === i
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-accent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {dayName}
                    {count > 0 && (
                      <span className={`ms-1 text-[10px] ${activeDay === i ? "opacity-80" : "text-primary"}`}>({count})</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5 min-h-[60px]">
              {currentSlots.length === 0 && (
                <p className="text-xs text-muted-foreground py-3 text-center">אין פריטים ליום {DAY_NAMES[activeDay]}</p>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={currentSlots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  {renderSlotList()}
                </SortableContext>
              </DndContext>
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              <Button type="button" variant="outline" size="sm"
                onClick={() => { const c = components[0]; if (c) addSlot(activeDay, c.slotType, c.id); }}
                disabled={components.length === 0}
              >
                <Plus className="me-1 h-3 w-3" /> הוסף קומפוננטה
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addSlot(activeDay, "recorded_lesson")}>
                <Plus className="me-1 h-3 w-3" /> הוסף שיעור
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addSlot(activeDay, "article_reading")}>
                <Plus className="me-1 h-3 w-3" /> הוסף מאמר
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSave} disabled={!name}>שמור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
