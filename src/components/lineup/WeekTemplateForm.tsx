"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { parseDurationToSec, formatDurationSec } from "@/lib/time";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

interface WeekTemplateSlot {
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

export function WeekTemplateForm({ open, template, components, onSave, onClose }: Props) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [activeDay, setActiveDay] = useState(0);
  const [daysState, setDaysState] = useState<Record<string, WeekTemplateSlot[]>>(() => {
    if (template?.days) {
      try {
        return JSON.parse(template.days);
      } catch {
        return {};
      }
    }
    return {};
  });

  function getSlotsForDay(day: number): WeekTemplateSlot[] {
    return daysState[String(day)] ?? [];
  }

  function setSlotsForDay(day: number, slots: WeekTemplateSlot[]) {
    setDaysState((prev) => ({ ...prev, [String(day)]: slots }));
  }

  function addSlot(day: number, slotType: string, componentId?: string) {
    const current = getSlotsForDay(day);
    const comp = componentId ? components.find((c) => c.id === componentId) : null;
    setSlotsForDay(day, [
      ...current,
      {
        slotType,
        componentId: componentId ?? undefined,
        durationSec: comp?.defaultDurationSec ?? undefined,
      },
    ]);
  }

  function removeSlot(day: number, index: number) {
    const current = getSlotsForDay(day);
    setSlotsForDay(day, current.filter((_, i) => i !== index));
  }

  function updateSlot(day: number, index: number, patch: Partial<WeekTemplateSlot>) {
    const current = getSlotsForDay(day);
    setSlotsForDay(
      day,
      current.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  }

  function handleSave() {
    onSave({
      name,
      description: description || null,
      isDefault,
      days: JSON.stringify(daysState),
    } as Partial<WeekTemplate>);
  }

  const currentSlots = getSlotsForDay(activeDay);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "עריכת תבנית שבועית" : "תבנית שבועית חדשה"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Basic info */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>שם</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="תבנית רגילה" />
            </div>
            <div className="space-y-1.5">
              <Label>תיאור</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="תבנית לשבוע רגיל..."
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              תבנית ברירת מחדל
            </label>
          </div>

          {/* Per-day slot editor */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold border-b pb-1">מבנה ימים</h3>

            {/* Day tabs */}
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
                      <span className={`ms-1 text-[10px] ${activeDay === i ? "opacity-80" : "text-primary"}`}>
                        ({count})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Slots for active day */}
            <div className="space-y-1.5 min-h-[60px]">
              {currentSlots.length === 0 && (
                <p className="text-xs text-muted-foreground py-3 text-center">
                  אין פריטים ליום {DAY_NAMES[activeDay]}
                </p>
              )}
              {currentSlots.map((slot, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted rounded-md px-2 py-1.5">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                      slot.componentId
                        ? "bg-blue-100 text-blue-700"
                        : slot.slotType === "recorded_lesson"
                        ? "bg-purple-100 text-purple-700"
                        : slot.slotType === "article_reading"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {slot.componentId
                      ? "קבוע"
                      : slot.slotType === "recorded_lesson"
                      ? "שיעור"
                      : slot.slotType === "article_reading"
                      ? "מאמר"
                      : "מותאם"}
                  </span>

                  {slot.componentId ? (
                    <select
                      value={slot.componentId}
                      onChange={(e) => updateSlot(activeDay, i, { componentId: e.target.value || undefined })}
                      className="flex-1 text-xs border border-input rounded px-2 py-0.5 bg-background"
                    >
                      <option value="">בחר קומפוננטה</option>
                      {components.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={slot.label ?? ""}
                      onChange={(e) => updateSlot(activeDay, i, { label: e.target.value || undefined })}
                      placeholder="תווית (אופציונלי)"
                      className="flex-1 h-6 text-xs px-2"
                    />
                  )}

                  <Input
                    value={slot.durationSec ? formatDurationSec(slot.durationSec) : ""}
                    onChange={(e) =>
                      updateSlot(activeDay, i, {
                        durationSec: parseDurationToSec(e.target.value) ?? undefined,
                      })
                    }
                    placeholder="משך"
                    className="w-20 h-6 text-xs px-2"
                    dir="ltr"
                  />

                  <button
                    type="button"
                    onClick={() => removeSlot(activeDay, i)}
                    className="text-destructive hover:text-destructive/80 shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const firstComp = components[0];
                  if (firstComp) addSlot(activeDay, firstComp.slotType, firstComp.id);
                }}
                disabled={components.length === 0}
              >
                <Plus className="me-1 h-3 w-3" /> הוסף קומפוננטה
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addSlot(activeDay, "recorded_lesson")}
              >
                <Plus className="me-1 h-3 w-3" /> הוסף שיעור
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addSlot(activeDay, "article_reading")}
              >
                <Plus className="me-1 h-3 w-3" /> הוסף מאמר
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={handleSave} disabled={!name}>
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
