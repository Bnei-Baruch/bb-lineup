"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  SLOT_TYPE_LABELS,
  SLOT_TYPE_GROUPS,
  COMPONENT_CATEGORIES,
  TRANSITION_LABELS,
  TransitionType,
} from "@/types";
import { Loader2 } from "lucide-react";
import { formatDurationSec, parseDurationToSec } from "@/lib/time";

interface ComponentFormProps {
  component?: Record<string, unknown> | null;
  open: boolean;
  onClose: () => void;
}

export function ComponentForm({ component, open, onClose }: ComponentFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    name: (component?.name as string) ?? "",
    category: (component?.category as string) ?? "custom",
    slotType: (component?.slotType as string) ?? "custom",
    sortOrder: String(component?.sortOrder ?? 0),
    defaultLabel: (component?.defaultLabel as string) ?? "",
    defaultDurationSec: component?.defaultDurationSec ? formatDurationSec(component.defaultDurationSec as number) : "",
    defaultNarratorScript: (component?.defaultNarratorScript as string) ?? "",
    defaultTransitionType: (component?.defaultTransitionType as string) ?? "",
    defaultMediaCode: (component?.defaultMediaCode as string) ?? "",
    defaultLanguage: (component?.defaultLanguage as string) ?? "",
    defaultHasSubtitles: (component?.defaultHasSubtitles as boolean) ?? false,
    defaultHasWorkshopQuestions: (component?.defaultHasWorkshopQuestions as boolean) ?? false,
    defaultNotes: (component?.defaultNotes as string) ?? "",
    defaultPartNumber: String(component?.defaultPartNumber ?? ""),
  });

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit() {
    startTransition(async () => {
      const payload = {
        name: form.name,
        category: form.category,
        slotType: form.slotType,
        sortOrder: parseInt(form.sortOrder) || 0,
        defaultLabel: form.defaultLabel || null,
        defaultDurationSec: (() => { const s = parseDurationToSec(form.defaultDurationSec); return s != null ? s : (parseInt(form.defaultDurationSec) * 60 || null); })(),
        defaultNarratorScript: form.defaultNarratorScript || null,
        defaultTransitionType: form.defaultTransitionType || null,
        defaultMediaCode: form.defaultMediaCode || null,
        defaultLanguage: form.defaultLanguage || null,
        defaultHasSubtitles: form.defaultHasSubtitles,
        defaultHasWorkshopQuestions: form.defaultHasWorkshopQuestions,
        defaultNotes: form.defaultNotes || null,
        defaultPartNumber: form.defaultPartNumber ? parseInt(form.defaultPartNumber) : null,
      };

      const url = component ? `/api/components/${component.id}` : "/api/components";
      const method = component ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onClose();
        router.refresh();
      }
    });
  }

  const isNarrator = ["narrator_announcement", "narrator_read", "lesson_preparation"].includes(form.slotType);
  const isTransition = form.slotType === "transition";
  const isMedia = ["acapella", "song", "slide_melodies"].includes(form.slotType);
  const isPartHeader = form.slotType === "part_header";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{component ? "עריכת קומפוננטה" : "קומפוננטה חדשה"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>שם</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="קריין הודעה לפני הכנה" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>קטגוריה</Label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {COMPONENT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>סוג פריט</Label>
              <select
                value={form.slotType}
                onChange={(e) => set("slotType", e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {SLOT_TYPE_GROUPS.map((g) =>
                  g.types.map((t) => (
                    <option key={t} value={t}>{SLOT_TYPE_LABELS[t]}</option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>כותרת ברירת מחדל</Label>
              <Input value={form.defaultLabel} onChange={(e) => set("defaultLabel", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>סדר מיון</Label>
              <Input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} dir="ltr" className="w-20" />
            </div>
          </div>

          {!isPartHeader && (
            <div className="space-y-1.5">
              <Label>משך ברירת מחדל (HH:MM:SS)</Label>
              <Input value={form.defaultDurationSec} onChange={(e) => set("defaultDurationSec", e.target.value)} placeholder="00:03:00" dir="ltr" className="w-32" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{isNarrator ? "טקסט קריין ברירת מחדל" : "תוכן ברירת מחדל"}</Label>
            <Textarea rows={3} value={form.defaultNarratorScript} onChange={(e) => set("defaultNarratorScript", e.target.value)} />
          </div>

          {isTransition && (
            <div className="space-y-1.5">
              <Label>סוג מעברון ברירת מחדל</Label>
              <select
                value={form.defaultTransitionType}
                onChange={(e) => set("defaultTransitionType", e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">בחר</option>
                {(Object.keys(TRANSITION_LABELS) as TransitionType[]).map((k) => (
                  <option key={k} value={k}>{TRANSITION_LABELS[k]}</option>
                ))}
              </select>
            </div>
          )}

          {isMedia && (
            <div className="space-y-1.5">
              <Label>קוד מדיה ברירת מחדל</Label>
              <Input value={form.defaultMediaCode} onChange={(e) => set("defaultMediaCode", e.target.value)} dir="ltr" />
            </div>
          )}

          {isPartHeader && (
            <div className="space-y-1.5">
              <Label>מספר חלק ברירת מחדל</Label>
              <Input type="number" value={form.defaultPartNumber} onChange={(e) => set("defaultPartNumber", e.target.value)} dir="ltr" className="w-24" />
            </div>
          )}

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.defaultHasSubtitles} onChange={(e) => set("defaultHasSubtitles", e.target.checked)} className="rounded" />
              כתוביות
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.defaultHasWorkshopQuestions} onChange={(e) => set("defaultHasWorkshopQuestions", e.target.checked)} className="rounded" />
              שאלות סדנה
            </label>
          </div>

          <div className="space-y-1.5">
            <Label>הערות ברירת מחדל</Label>
            <Input value={form.defaultNotes} onChange={(e) => set("defaultNotes", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit} disabled={pending || !form.name}>
            {pending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {component ? "שמור" : "צור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
