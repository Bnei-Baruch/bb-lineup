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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { parseDurationToSec, formatDurationSec } from "@/lib/time";

interface TemplateSlot {
  id: string;
  type: "fixed" | "lesson" | "article";
  componentId?: string;
  slotType?: string;
  label?: string;
}

interface RuleSet {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  broadcastStartTime: string;
  targetDurationSec: number | null;
  hardMaxDurationSec: number | null;
  splitLongLessons: boolean;
  maxLessonDurationSec: number | null;
  dayTemplate: string;
  preferredSeriesIds: string | null;
  extraInstructions: string | null;
}

interface Props {
  open: boolean;
  ruleSet: RuleSet | null;
  series: { id: string; name: string; color: string | null }[];
  components: { id: string; name: string; slotType: string; category: string; defaultDurationSec: number | null }[];
  onSave: (data: Partial<RuleSet>) => void;
  onClose: () => void;
}

let _idCounter = 0;
function makeId() { return `rs-${++_idCounter}`; }

function addIds(slots: Omit<TemplateSlot, "id">[]): TemplateSlot[] {
  return slots.map((s) => ({ ...s, id: makeId() }));
}

function stripIds(slots: TemplateSlot[]): Omit<TemplateSlot, "id">[] {
  return slots.map(({ id: _id, ...rest }) => rest);
}

interface SortableRowProps {
  slot: TemplateSlot;
  components: Props["components"];
  onUpdate: (patch: Partial<TemplateSlot>) => void;
  onRemove: () => void;
}

function SortableRow({ slot, components, onUpdate, onRemove }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 bg-muted rounded-md px-2 py-1.5">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
        <GripVertical className="h-4 w-4" />
      </button>

      <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
        slot.type === "fixed" ? "bg-blue-100 text-blue-700" :
        slot.type === "lesson" ? "bg-purple-100 text-purple-700" :
        "bg-green-100 text-green-700"
      }`}>
        {slot.type === "fixed" ? "קבוע" : slot.type === "lesson" ? "שיעור" : "מאמר"}
      </span>

      {slot.type === "fixed" ? (
        <select
          value={slot.componentId ?? ""}
          onChange={(e) => onUpdate({ componentId: e.target.value })}
          className="flex-1 text-xs border border-input rounded px-2 py-0.5 bg-background"
        >
          <option value="">בחר קומפוננטה</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      ) : (
        <span className="flex-1 text-xs text-muted-foreground">
          {slot.type === "lesson" ? "AI יבחר שיעור מוקלט" : "AI יבחר מאמר לקריאה"}
        </span>
      )}

      <button type="button" onClick={onRemove} className="text-destructive hover:text-destructive/80 shrink-0">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function RuleSetForm({ open, ruleSet, series, components, onSave, onClose }: Props) {
  const [name, setName] = useState(ruleSet?.name ?? "");
  const [description, setDescription] = useState(ruleSet?.description ?? "");
  const [isDefault, setIsDefault] = useState(ruleSet?.isDefault ?? false);
  const [broadcastStartTime, setBroadcastStartTime] = useState(ruleSet?.broadcastStartTime ?? "02:40");
  const [targetDuration, setTargetDuration] = useState(ruleSet?.targetDurationSec ? formatDurationSec(ruleSet.targetDurationSec) : "");
  const [hardMax, setHardMax] = useState(ruleSet?.hardMaxDurationSec ? formatDurationSec(ruleSet.hardMaxDurationSec) : "");
  const [maxLesson, setMaxLesson] = useState(ruleSet?.maxLessonDurationSec ? formatDurationSec(ruleSet.maxLessonDurationSec) : "");
  const [splitLong, setSplitLong] = useState(ruleSet?.splitLongLessons ?? true);
  const [extraInstructions, setExtraInstructions] = useState(ruleSet?.extraInstructions ?? "");
  const [template, setTemplate] = useState<TemplateSlot[]>(() =>
    ruleSet?.dayTemplate ? addIds(JSON.parse(ruleSet.dayTemplate)) : []
  );
  const [selectedSeriesIds, setSelectedSeriesIds] = useState<string[]>(
    ruleSet?.preferredSeriesIds ? JSON.parse(ruleSet.preferredSeriesIds) : []
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  function addTemplateSlot(type: TemplateSlot["type"]) {
    setTemplate((t) => [...t, { id: makeId(), type }]);
  }

  function removeTemplateSlot(id: string) {
    setTemplate((t) => t.filter((s) => s.id !== id));
  }

  function updateTemplateSlot(id: string, patch: Partial<TemplateSlot>) {
    setTemplate((t) => t.map((s) => s.id === id ? { ...s, ...patch } : s));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setTemplate((t) => {
      const oldIdx = t.findIndex((s) => s.id === active.id);
      const newIdx = t.findIndex((s) => s.id === over.id);
      return oldIdx !== -1 && newIdx !== -1 ? arrayMove(t, oldIdx, newIdx) : t;
    });
  }

  function toggleSeries(id: string) {
    setSelectedSeriesIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleSave() {
    onSave({
      name,
      description: description || null,
      isDefault,
      broadcastStartTime,
      targetDurationSec: parseDurationToSec(targetDuration),
      hardMaxDurationSec: parseDurationToSec(hardMax),
      maxLessonDurationSec: parseDurationToSec(maxLesson),
      splitLongLessons: splitLong,
      dayTemplate: JSON.stringify(stripIds(template)),
      preferredSeriesIds: selectedSeriesIds.length > 0 ? JSON.stringify(selectedSeriesIds) : null,
      extraInstructions: extraInstructions || null,
    } as Partial<RuleSet>);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ruleSet ? "עריכת תבנית" : "תבנית חדשה"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>שם</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שיעור בוקר" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>תיאור</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תבנית לשיעורי בוקר..." />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold border-b pb-1">תזמון</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>שעת התחלה</Label>
                <Input value={broadcastStartTime} onChange={(e) => setBroadcastStartTime(e.target.value)} dir="ltr" placeholder="02:40" />
              </div>
              <div className="space-y-1.5">
                <Label>משך יעד (HH:MM:SS)</Label>
                <Input value={targetDuration} onChange={(e) => setTargetDuration(e.target.value)} dir="ltr" placeholder="03:00:00" />
              </div>
              <div className="space-y-1.5">
                <Label>מקסימום (HH:MM:SS)</Label>
                <Input value={hardMax} onChange={(e) => setHardMax(e.target.value)} dir="ltr" placeholder="03:30:00" />
              </div>
              <div className="space-y-1.5">
                <Label>מקס׳ שיעור ביום</Label>
                <Input value={maxLesson} onChange={(e) => setMaxLesson(e.target.value)} dir="ltr" placeholder="00:45:00" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm mt-2">
              <input type="checkbox" checked={splitLong} onChange={(e) => setSplitLong(e.target.checked)} />
              פצל שיעורים ארוכים על פני ימים
            </label>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold border-b pb-1">סדרות מועדפות</h3>
            <div className="flex flex-wrap gap-2">
              {series.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSeries(s.id)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    selectedSeriesIds.includes(s.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {s.color && <span className="inline-block w-2 h-2 rounded-full me-1" style={{ backgroundColor: s.color }} />}
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold border-b pb-1">תבנית יום</h3>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={template.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {template.map((slot) => (
                    <SortableRow
                      key={slot.id}
                      slot={slot}
                      components={components}
                      onUpdate={(patch) => updateTemplateSlot(slot.id, patch)}
                      onRemove={() => removeTemplateSlot(slot.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="flex gap-2 mt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => addTemplateSlot("fixed")}>
                <Plus className="me-1 h-3 w-3" /> קבוע
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addTemplateSlot("lesson")}>
                <Plus className="me-1 h-3 w-3" /> שיעור מוקלט
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addTemplateSlot("article")}>
                <Plus className="me-1 h-3 w-3" /> קריאת מאמר
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>הוראות נוספות ל-AI</Label>
            <Textarea
              rows={3}
              value={extraInstructions}
              onChange={(e) => setExtraInstructions(e.target.value)}
              placeholder="לדוגמה: יום ראשון תמיד עם שיעור מסדרת רב״ש, שיעורים לא יעברו שעה..."
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            תבנית ברירת מחדל
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSave} disabled={!name}>שמור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
