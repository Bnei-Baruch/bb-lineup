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
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { parseDurationToSec, formatDurationSec } from "@/lib/time";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

interface WeekTemplateSlot {
  id: string; // stable key for dnd
  slotType: string;
  componentId?: string;
  label?: string;
  durationSec?: number;
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

export function WeekTemplateForm({ open, template, components, onSave, onClose }: Props) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [activeDay, setActiveDay] = useState(0);
  const [daysState, setDaysState] = useState<Record<string, WeekTemplateSlot[]>>(() => {
    if (template?.days) {
      try {
        const parsed: Record<string, Omit<WeekTemplateSlot, "id">[]> = JSON.parse(template.days);
        return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, addIds(v)]));
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

  function getSlotsForDay(day: number): WeekTemplateSlot[] {
    return daysState[String(day)] ?? [];
  }

  function setSlotsForDay(day: number, slots: WeekTemplateSlot[]) {
    setDaysState((prev) => ({ ...prev, [String(day)]: slots }));
  }

  function addSlot(day: number, slotType: string, componentId?: string) {
    const comp = componentId ? components.find((c) => c.id === componentId) : null;
    setSlotsForDay(day, [
      ...getSlotsForDay(day),
      { id: makeId(), slotType, componentId: componentId ?? undefined, durationSec: comp?.defaultDurationSec ?? undefined },
    ]);
  }

  function removeSlot(day: number, index: number) {
    setSlotsForDay(day, getSlotsForDay(day).filter((_, i) => i !== index));
  }

  function updateSlot(day: number, index: number, patch: Partial<WeekTemplateSlot>) {
    setSlotsForDay(day, getSlotsForDay(day).map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const slots = getSlotsForDay(activeDay);
    const oldIdx = slots.findIndex((s) => s.id === active.id);
    const newIdx = slots.findIndex((s) => s.id === over.id);
    if (oldIdx !== -1 && newIdx !== -1) setSlotsForDay(activeDay, arrayMove(slots, oldIdx, newIdx));
  }

  function handleSave() {
    const stripped = Object.fromEntries(
      Object.entries(daysState).map(([k, v]) => [k, stripIds(v)])
    );
    onSave({ name, description: description || null, isDefault, days: JSON.stringify(stripped) } as Partial<WeekTemplate>);
  }

  const currentSlots = getSlotsForDay(activeDay);

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
                const count = getSlotsForDay(i).length;
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
                  {currentSlots.map((slot, i) => (
                    <SortableRow
                      key={slot.id}
                      slot={slot}
                      index={i}
                      components={components}
                      onUpdate={(patch) => updateSlot(activeDay, i, patch)}
                      onRemove={() => removeSlot(activeDay, i)}
                    />
                  ))}
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
