"use client";

import { useState, useEffect } from "react";
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
import { GripVertical, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { parseDurationToSec, formatDurationSec } from "@/lib/time";
import { DAY_NAMES } from "@/lib/dates";
import { TemplateItemV2, SlotType, SLOT_TYPE_LABELS } from "@/types";

type LegacyItem = { type: "fixed" | "lesson" | "article"; componentId?: string; slotType?: string; label?: string };
type EditableItem = TemplateItemV2 & { id: string };
type Category = "fixed-component" | "fixed-custom" | "dynamic-lesson" | "dynamic-live";

const CATEGORY_LABELS: Record<Category, string> = {
  "fixed-component": "קבוע - קומפוננטה",
  "fixed-custom": "קבוע - מותאם",
  "dynamic-lesson": "דינמי - שיעור מסדרה",
  "dynamic-live": "דינמי - תוכן חי",
};

/** Older rule sets may still hold the pre-series-matching template shape (type: "fixed"|"lesson"|
 *  "article", no seriesId). Upgraded to v2 on load so this form only ever edits one shape - a
 *  "lesson"/"article" item has no way to know which series it meant, so it lands as an empty
 *  dynamic-lesson item the user must point at a series. */
function upgradeItem(raw: TemplateItemV2 | LegacyItem): TemplateItemV2 {
  if ("kind" in raw) return raw;
  if (raw.type === "fixed") {
    return { kind: "fixed", slotType: (raw.slotType as SlotType) ?? "custom", componentId: raw.componentId, label: raw.label };
  }
  if (raw.type === "article") {
    return { kind: "dynamic", contentType: "lesson", seriesId: "", part: "article" };
  }
  return { kind: "dynamic", contentType: "lesson", seriesId: "" };
}

function categoryOf(item: TemplateItemV2): Category {
  if (item.kind === "fixed") return item.componentId ? "fixed-component" : "fixed-custom";
  return item.contentType === "lesson" ? "dynamic-lesson" : "dynamic-live";
}

function blankForCategory(cat: Category): TemplateItemV2 {
  switch (cat) {
    case "fixed-component": return { kind: "fixed", slotType: "custom", componentId: "" };
    case "fixed-custom": return { kind: "fixed", slotType: "narrator_read" };
    case "dynamic-lesson": return { kind: "dynamic", contentType: "lesson", seriesId: "" };
    case "dynamic-live": return { kind: "dynamic", contentType: "live", slotType: "study_between_friends", plannedDurationSec: 0 };
  }
}

interface RuleSet {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  broadcastStartTime: string;
  broadcastEndTime?: string | null;
  targetDurationSec: number | null;
  hardMaxDurationSec: number | null;
  splitLongLessons: boolean;
  maxLessonDurationSec: number | null;
  dayTemplate: string;
  preferredSeriesIds: string | null;
  extraInstructions: string | null;
  daysOfWeek: string | null;
}

interface SeriesOption { id: string; name: string; color: string | null; consumptionMode: string }

interface Props {
  open: boolean;
  ruleSet: RuleSet | null;
  series: SeriesOption[];
  components: { id: string; name: string; slotType: string; category: string; defaultDurationSec: number | null }[];
  onSave: (data: Partial<RuleSet>) => void;
  onClose: () => void;
}

let _idCounter = 0;
function makeId() { return `rs-${++_idCounter}`; }

function addIds(slots: (TemplateItemV2 | LegacyItem)[]): EditableItem[] {
  return slots.map((s) => ({ ...upgradeItem(s), id: makeId() }));
}

function stripIds(slots: EditableItem[]): TemplateItemV2[] {
  return slots.map(({ id: _id, ...rest }) => rest);
}

function parseDayTemplate(raw: string): { slots: EditableItem[]; contentStartIndex: number; contentCutoffIndex: number | null } {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { slots: addIds(parsed), contentStartIndex: 0, contentCutoffIndex: null };
    }
    if (parsed && typeof parsed === "object") {
      return {
        slots: addIds(parsed.slots ?? []),
        contentStartIndex: parsed.contentStartIndex ?? 0,
        contentCutoffIndex: parsed.contentCutoffIndex ?? null,
      };
    }
  } catch {
    // ignore
  }
  return { slots: [], contentStartIndex: 0, contentCutoffIndex: null };
}

/** Free-text duration entry (HH:MM:SS) - parsed only on blur, mirroring the form's other
 *  duration fields, so a half-typed value never gets reformatted out from under the cursor. */
function DurationField({ valueSec, onCommit, placeholder }: {
  valueSec: number | undefined; onCommit: (sec: number | undefined) => void; placeholder?: string;
}) {
  const [text, setText] = useState(valueSec != null ? formatDurationSec(valueSec) : "");
  useEffect(() => { setText(valueSec != null ? formatDurationSec(valueSec) : ""); }, [valueSec]);
  return (
    <input
      type="text"
      dir="ltr"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text.trim() ? (parseDurationToSec(text.trim()) ?? undefined) : undefined)}
      placeholder={placeholder ?? "00:00:00"}
      className="w-24 text-xs border border-input rounded px-2 py-0.5 bg-background tabular-nums shrink-0"
    />
  );
}

function SlotTypeSelect({ value, onChange }: { value: string; onChange: (v: SlotType) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SlotType)}
      className="text-xs border border-input rounded px-2 py-0.5 bg-background shrink-0"
    >
      {Object.entries(SLOT_TYPE_LABELS).map(([k, label]) => (
        <option key={k} value={k}>{label}</option>
      ))}
    </select>
  );
}

/** Per-weekday lineup-link editor for a "live" dynamic item - a single template can be shared
 *  across several weekdays (e.g. "יום שני-חמישי"), each needing its own link, keyed by the
 *  rule set's own daysOfWeek selection above. */
function LiveLinksEditor({ links, daysOfWeek, onChange }: {
  links: Record<string, string> | undefined;
  daysOfWeek: number[];
  onChange: (links: Record<string, string> | undefined) => void;
}) {
  function setLink(dow: number, url: string) {
    const next = { ...(links ?? {}) };
    if (url.trim()) next[String(dow)] = url.trim();
    else delete next[String(dow)];
    onChange(Object.keys(next).length > 0 ? next : undefined);
  }

  if (daysOfWeek.length === 0) {
    return <p className="text-[11px] text-muted-foreground">בחר ימים בתבנית (מעלה) כדי להגדיר קישור ליינאפ לכל יום</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {daysOfWeek.map((dow) => (
        <div key={dow} className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground w-6 shrink-0">{DAY_NAMES[dow]}</span>
          <input
            type="text"
            dir="ltr"
            defaultValue={links?.[String(dow)] ?? ""}
            onBlur={(e) => setLink(dow, e.target.value)}
            placeholder="קישור ליינאפ"
            className="w-40 text-[11px] border border-input rounded px-1.5 py-0.5 bg-background"
          />
        </div>
      ))}
    </div>
  );
}

interface SortableRowProps {
  item: EditableItem;
  series: SeriesOption[];
  components: Props["components"];
  daysOfWeek: number[];
  onUpdate: (patch: Partial<TemplateItemV2>) => void;
  onCategoryChange: (cat: Category) => void;
  onRemove: () => void;
}

function SortableRow({ item, series, components, daysOfWeek, onUpdate, onCategoryChange, onRemove }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const cat = categoryOf(item);

  const badgeColor =
    cat === "fixed-component" || cat === "fixed-custom" ? "bg-blue-100 text-blue-700" :
    cat === "dynamic-lesson" ? "bg-purple-100 text-purple-700" :
    "bg-amber-100 text-amber-700";

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col gap-1.5 bg-muted rounded-md px-2 py-1.5">
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
          <GripVertical className="h-4 w-4" />
        </button>

        <select
          value={cat}
          onChange={(e) => onCategoryChange(e.target.value as Category)}
          className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 border-0 ${badgeColor}`}
        >
          {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>

        {cat === "fixed-component" && item.kind === "fixed" && (
          <select
            value={item.componentId ?? ""}
            onChange={(e) => onUpdate({ componentId: e.target.value })}
            className="flex-1 text-xs border border-input rounded px-2 py-0.5 bg-background"
          >
            <option value="">בחר קומפוננטה</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        {cat === "fixed-custom" && item.kind === "fixed" && (
          <>
            <SlotTypeSelect value={item.slotType} onChange={(slotType) => onUpdate({ slotType })} />
            <input
              type="text"
              value={item.label ?? ""}
              onChange={(e) => onUpdate({ label: e.target.value || undefined })}
              placeholder="תווית (אופציונלי)"
              className="flex-1 text-xs border border-input rounded px-2 py-0.5 bg-background min-w-0"
            />
            <DurationField valueSec={item.durationSec} onCommit={(sec) => onUpdate({ durationSec: sec })} />
          </>
        )}

        {cat === "dynamic-lesson" && item.kind === "dynamic" && item.contentType === "lesson" && (
          <>
            <select
              value={item.seriesId}
              onChange={(e) => onUpdate({ seriesId: e.target.value })}
              className={`flex-1 text-xs border rounded px-2 py-0.5 bg-background min-w-0 ${!item.seriesId ? "border-destructive" : "border-input"}`}
            >
              <option value="">בחר סדרה</option>
              {series.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {s.consumptionMode === "continuous" ? "רציף" : "בחירה חכמה"}</option>
              ))}
            </select>
            <select
              value={item.part ?? ""}
              onChange={(e) => onUpdate({ part: (e.target.value || undefined) as "article" | "video" | undefined })}
              className="text-xs border border-input rounded px-2 py-0.5 bg-background shrink-0"
            >
              <option value="">ללא (עצמאי)</option>
              <option value="article">מאמר (חלק א׳)</option>
              <option value="video">וידאו (חלק ב׳)</option>
            </select>
          </>
        )}

        {cat === "dynamic-live" && item.kind === "dynamic" && item.contentType === "live" && (
          <>
            <SlotTypeSelect value={item.slotType} onChange={(slotType) => onUpdate({ slotType })} />
            <input
              type="text"
              value={item.label ?? ""}
              onChange={(e) => onUpdate({ label: e.target.value || undefined })}
              placeholder="תווית"
              className="flex-1 text-xs border border-input rounded px-2 py-0.5 bg-background min-w-0"
            />
            <DurationField valueSec={item.plannedDurationSec} onCommit={(sec) => onUpdate({ plannedDurationSec: sec ?? 0 })} placeholder="משך מתוכנן" />
          </>
        )}

        <label className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
          <input type="checkbox" checked={!!item.nested} onChange={(e) => onUpdate({ nested: e.target.checked || undefined })} />
          מקונן
        </label>

        <button type="button" onClick={onRemove} className="text-destructive hover:text-destructive/80 shrink-0">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {cat === "dynamic-live" && item.kind === "dynamic" && item.contentType === "live" && (
        <div className="ps-8">
          <LiveLinksEditor
            links={item.lineupLinksByDay}
            daysOfWeek={daysOfWeek}
            onChange={(links) => onUpdate({ lineupLinksByDay: links })}
          />
        </div>
      )}
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

export function RuleSetForm({ open, ruleSet, series, components, onSave, onClose }: Props) {
  const [name, setName] = useState(ruleSet?.name ?? "");
  const [description, setDescription] = useState(ruleSet?.description ?? "");
  const [isDefault, setIsDefault] = useState(ruleSet?.isDefault ?? false);
  const [broadcastStartTime, setBroadcastStartTime] = useState(ruleSet?.broadcastStartTime ?? "02:40");
  const [broadcastEndTime, setBroadcastEndTime] = useState(ruleSet?.broadcastEndTime ?? "");
  const [targetDuration, setTargetDuration] = useState(ruleSet?.targetDurationSec ? formatDurationSec(ruleSet.targetDurationSec) : "");
  const [hardMax, setHardMax] = useState(ruleSet?.hardMaxDurationSec ? formatDurationSec(ruleSet.hardMaxDurationSec) : "");
  const [maxLesson, setMaxLesson] = useState(ruleSet?.maxLessonDurationSec ? formatDurationSec(ruleSet.maxLessonDurationSec) : "");
  const [splitLong, setSplitLong] = useState(ruleSet?.splitLongLessons ?? true);
  const [extraInstructions, setExtraInstructions] = useState(ruleSet?.extraInstructions ?? "");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    ruleSet?.daysOfWeek ? JSON.parse(ruleSet.daysOfWeek) : []
  );

  const [{ initSlots, initStart, initCutoff }] = useState(() => {
    const p = ruleSet?.dayTemplate ? parseDayTemplate(ruleSet.dayTemplate) : { slots: [], contentStartIndex: 0, contentCutoffIndex: null };
    return { initSlots: p.slots, initStart: p.contentStartIndex, initCutoff: p.contentCutoffIndex };
  });
  const [template, setTemplate] = useState<EditableItem[]>(initSlots);
  const [contentStartIndex, setContentStartIndex] = useState(initStart);
  const [contentCutoffIndex, setContentCutoffIndex] = useState<number | null>(initCutoff);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  function addTemplateSlot(cat: Category) {
    setTemplate((t) => [...t, { ...blankForCategory(cat), id: makeId() }]);
  }

  function removeTemplateSlot(id: string) {
    setTemplate((t) => {
      const idx = t.findIndex((s) => s.id === id);
      const newSlots = t.filter((s) => s.id !== id);
      const newLen = newSlots.length;
      if (idx !== -1) {
        if (idx < contentStartIndex) setContentStartIndex((v) => Math.max(0, v - 1));
        else setContentStartIndex((v) => Math.min(v, newLen));
        const cutoff = contentCutoffIndex;
        if (cutoff !== null) {
          if (idx < cutoff) setContentCutoffIndex(Math.max(contentStartIndex, cutoff - 1));
          else setContentCutoffIndex(Math.min(cutoff, newLen));
        }
      }
      return newSlots;
    });
  }

  function updateTemplateSlot(id: string, patch: Partial<TemplateItemV2>) {
    setTemplate((t) => t.map((s) => (s.id === id ? ({ ...s, ...patch } as EditableItem) : s)));
  }

  function changeTemplateSlotCategory(id: string, cat: Category) {
    setTemplate((t) => t.map((s) => (s.id === id ? { ...blankForCategory(cat), id: s.id } : s)));
  }

  function toggleDayOfWeek(dow: number) {
    setDaysOfWeek((prev) => (prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort((a, b) => a - b)));
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

  function handleSave() {
    const dayTemplateObj = {
      slots: stripIds(template),
      contentStartIndex,
      contentCutoffIndex,
    };
    onSave({
      name,
      description: description || null,
      isDefault,
      broadcastStartTime,
      broadcastEndTime: broadcastEndTime || null,
      targetDurationSec: parseDurationToSec(targetDuration),
      hardMaxDurationSec: parseDurationToSec(hardMax),
      maxLessonDurationSec: parseDurationToSec(maxLesson),
      splitLongLessons: splitLong,
      dayTemplate: JSON.stringify(dayTemplateObj),
      // No longer editable here (superseded by each dynamic item's own seriesId) - passed through
      // unchanged so saving doesn't silently wipe out whatever an older workflow left behind.
      preferredSeriesIds: ruleSet?.preferredSeriesIds ?? null,
      extraInstructions: extraInstructions || null,
      daysOfWeek: daysOfWeek.length > 0 ? JSON.stringify(daysOfWeek) : null,
    } as Partial<RuleSet>);
  }

  const cutoffIdx = contentCutoffIndex ?? template.length;

  function renderSlotList() {
    const elements: React.ReactNode[] = [];
    for (let i = 0; i <= template.length; i++) {
      if (i === contentStartIndex) {
        elements.push(
          <ContentLine key="start-line" label="תחילת תוכן" color="blue"
            canUp={contentStartIndex > 0}
            canDown={contentStartIndex < cutoffIdx}
            onUp={() => setContentStartIndex((v) => Math.max(0, v - 1))}
            onDown={() => setContentStartIndex((v) => Math.min(cutoffIdx, v + 1))}
          />
        );
      }
      if (i === cutoffIdx && cutoffIdx !== contentStartIndex) {
        elements.push(
          <ContentLine key="cutoff-line" label="סוף תוכן" color="orange"
            canUp={cutoffIdx > contentStartIndex}
            canDown={cutoffIdx < template.length}
            onUp={() => setContentCutoffIndex(Math.max(contentStartIndex, cutoffIdx - 1))}
            onDown={() => {
              const next = cutoffIdx + 1;
              setContentCutoffIndex(next >= template.length ? null : next);
            }}
          />
        );
      }
      if (i < template.length) {
        const item = template[i];
        elements.push(
          <SortableRow
            key={item.id}
            item={item}
            series={series}
            components={components}
            daysOfWeek={daysOfWeek}
            onUpdate={(patch) => updateTemplateSlot(item.id, patch)}
            onCategoryChange={(cat) => changeTemplateSlotCategory(item.id, cat)}
            onRemove={() => removeTemplateSlot(item.id)}
          />
        );
      }
    }
    return elements;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl sm:max-w-6xl w-[95vw] max-h-[85vh] overflow-y-auto">
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
            <h3 className="text-sm font-semibold border-b pb-1">ימים בשבוע</h3>
            <p className="text-[11px] text-muted-foreground">
              אילו ימים תבנית זו חלה עליהם - קובע גם באיזה יום נבחר הקישור המתאים לתוכן החי (מטה).
            </p>
            <div className="flex flex-wrap gap-2">
              {DAY_NAMES.map((label, dow) => (
                <button
                  key={dow}
                  type="button"
                  onClick={() => toggleDayOfWeek(dow)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    daysOfWeek.includes(dow)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold border-b pb-1">תזמון</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="space-y-1.5">
                <Label>שעת התחלה</Label>
                <Input value={broadcastStartTime} onChange={(e) => setBroadcastStartTime(e.target.value)} dir="ltr" placeholder="02:40" />
              </div>
              <div className="space-y-1.5">
                <Label>שעת סיום</Label>
                <Input value={broadcastEndTime} onChange={(e) => setBroadcastEndTime(e.target.value)} dir="ltr" placeholder="05:20" />
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
            <h3 className="text-sm font-semibold border-b pb-1">תבנית יום</h3>
            <p className="text-[11px] text-muted-foreground">
              פריט &quot;דינמי - שיעור מסדרה&quot; מתנהג כרציף/בחירה חכמה לפי מה שמוגדר על הסדרה עצמה (בניהול סדרות).
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={template.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {renderSlotList()}
                </div>
              </SortableContext>
            </DndContext>

            <div className="flex flex-wrap gap-2 mt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => addTemplateSlot("fixed-component")}>
                <Plus className="me-1 h-3 w-3" /> קבוע - קומפוננטה
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addTemplateSlot("fixed-custom")}>
                <Plus className="me-1 h-3 w-3" /> קבוע - מותאם
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addTemplateSlot("dynamic-lesson")}>
                <Plus className="me-1 h-3 w-3" /> דינמי - שיעור מסדרה
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addTemplateSlot("dynamic-live")}>
                <Plus className="me-1 h-3 w-3" /> דינמי - תוכן חי
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
