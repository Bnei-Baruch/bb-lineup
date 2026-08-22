"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { RuleSetForm } from "./RuleSetForm";
import { formatDurationSec } from "@/lib/time";
import { DAY_NAMES } from "@/lib/dates";
import { TemplateItemV2 } from "@/types";

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
  initialRuleSets: RuleSet[];
  series: SeriesOption[];
  components: { id: string; name: string; slotType: string; category: string; defaultDurationSec: number | null }[];
}

type LegacyItem = { type: "fixed" | "lesson" | "article"; componentId?: string; slotType?: string; label?: string };

function pillLabel(t: TemplateItemV2 | LegacyItem, components: Props["components"], series: SeriesOption[]): { label: string; nested: boolean } {
  if ("type" in t) {
    const comp = t.componentId ? components.find((c) => c.id === t.componentId) : null;
    return { label: comp?.name ?? t.label ?? (t.type === "lesson" ? "שיעור (ישן)" : t.type === "article" ? "מאמר (ישן)" : "קבוע"), nested: false };
  }
  const nested = !!t.nested;
  if (t.kind === "fixed") {
    const comp = t.componentId ? components.find((c) => c.id === t.componentId) : null;
    return { label: comp?.name ?? t.label ?? t.slotType, nested };
  }
  if (t.contentType === "live") {
    return { label: t.label ?? "תוכן חי", nested };
  }
  const s = series.find((x) => x.id === t.seriesId);
  const part = t.part === "article" ? " (מאמר)" : t.part === "video" ? " (וידאו)" : "";
  return { label: (s?.name ?? "סדרה לא ידועה") + part, nested };
}

function pillColor(t: TemplateItemV2 | LegacyItem): string {
  if ("type" in t) return t.type === "fixed" ? "bg-blue-50 text-blue-700" : t.type === "lesson" ? "bg-purple-50 text-purple-700" : "bg-green-50 text-green-700";
  if (t.kind === "fixed") return "bg-blue-50 text-blue-700";
  return t.contentType === "live" ? "bg-amber-50 text-amber-700" : "bg-purple-50 text-purple-700";
}

export function RuleSetManager({ initialRuleSets, series, components }: Props) {
  const router = useRouter();
  const [ruleSets, setRuleSets] = useState(initialRuleSets);
  const [editing, setEditing] = useState<RuleSet | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleDelete(id: string) {
    if (!confirm("למחוק תבנית זו?")) return;
    await fetch(`/api/lineup-rules/${id}`, { method: "DELETE" });
    setRuleSets((r) => r.filter((x) => x.id !== id));
  }

  async function handleSave(data: Partial<RuleSet>) {
    if (editing) {
      const res = await fetch(`/api/lineup-rules/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const updated = await res.json();
      setRuleSets((r) => r.map((x) => (x.id === editing.id ? updated : x)));
    } else {
      const res = await fetch("/api/lineup-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const created = await res.json();
      setRuleSets((r) => [...r, created]);
    }
    setEditing(null);
    setCreating(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="me-2 h-4 w-4" />
          תבנית חדשה
        </Button>
      </div>

      {ruleSets.length === 0 && (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <p className="text-sm">אין תבניות תכנון</p>
          <p className="text-xs mt-1">צור תבנית כדי להתחיל לתכנן לינאפ עם AI</p>
        </div>
      )}

      <div className="space-y-3">
        {ruleSets.map((r) => {
          const template = (() => { try { const p = JSON.parse(r.dayTemplate || "[]"); return Array.isArray(p) ? p : (p?.slots ?? []); } catch { return []; } })() as (TemplateItemV2 | LegacyItem)[];
          const seriesIds = r.preferredSeriesIds ? JSON.parse(r.preferredSeriesIds) as string[] : [];
          const daysOfWeek = r.daysOfWeek ? JSON.parse(r.daysOfWeek) as number[] : [];
          return (
            <div key={r.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{r.name}</h3>
                    {r.isDefault && <Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
                  </div>
                  {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">שעת התחלה</p>
                  <p className="font-medium tabular-nums">{r.broadcastStartTime}</p>
                </div>
                {r.targetDurationSec && (
                  <div>
                    <p className="text-muted-foreground">משך יעד</p>
                    <p className="font-medium tabular-nums">{formatDurationSec(r.targetDurationSec)}</p>
                  </div>
                )}
                {r.maxLessonDurationSec && (
                  <div>
                    <p className="text-muted-foreground">מקס׳ שיעור ביום</p>
                    <p className="font-medium tabular-nums">{formatDurationSec(r.maxLessonDurationSec)}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">פיצול שיעורים</p>
                  <p className="font-medium">{r.splitLongLessons ? "כן" : "לא"}</p>
                </div>
              </div>

              {daysOfWeek.length > 0 && (
                <div className="text-xs">
                  <p className="text-muted-foreground mb-1">ימים</p>
                  <div className="flex flex-wrap gap-1">
                    {daysOfWeek.map((dow) => (
                      <span key={dow} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {DAY_NAMES[dow]}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {seriesIds.length > 0 && (
                <div className="text-xs">
                  <p className="text-muted-foreground mb-1">סדרות מועדפות</p>
                  <div className="flex flex-wrap gap-1">
                    {seriesIds.map((id) => {
                      const s = series.find((x) => x.id === id);
                      return (
                        <span key={id} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {s?.name ?? id}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {template.length > 0 && (
                <div className="text-xs">
                  <p className="text-muted-foreground mb-1">תבנית יום ({template.length} פריטים)</p>
                  <div className="flex flex-wrap gap-1">
                    {template.map((t, i) => {
                      const { label, nested } = pillLabel(t, components, series);
                      const color = pillColor(t);
                      return (
                        <span key={i} className={`px-2 py-0.5 rounded text-[11px] ${color}`}>
                          {nested && <span className="me-0.5">↳</span>}
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(creating || editing) && (
        <RuleSetForm
          key={editing?.id ?? "new"}
          open
          ruleSet={editing}
          series={series}
          components={components}
          onSave={handleSave}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
