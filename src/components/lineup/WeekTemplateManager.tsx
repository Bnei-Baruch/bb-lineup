"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { WeekTemplateForm } from "./WeekTemplateForm";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

interface WeekTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  days: string;
}

interface Props {
  initialTemplates: WeekTemplate[];
  components: { id: string; name: string; slotType: string; defaultDurationSec: number | null }[];
}

export function WeekTemplateManager({ initialTemplates, components }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [editing, setEditing] = useState<WeekTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleDelete(id: string) {
    if (!confirm("למחוק תבנית זו?")) return;
    await fetch(`/api/week-templates/${id}`, { method: "DELETE" });
    setTemplates((t) => t.filter((x) => x.id !== id));
  }

  async function handleSave(data: Partial<WeekTemplate>) {
    if (editing) {
      const res = await fetch(`/api/week-templates/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const updated = await res.json();
      setTemplates((t) => t.map((x) => (x.id === editing.id ? updated : x)));
    } else {
      const res = await fetch("/api/week-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const created = await res.json();
      setTemplates((t) => [...t, created]);
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

      {templates.length === 0 && (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <p className="text-sm">אין תבניות שבועיות</p>
          <p className="text-xs mt-1">צור תבנית כדי להחיל מבנה שבועי על הלינאפ במהירות</p>
        </div>
      )}

      <div className="space-y-3">
        {templates.map((t) => {
          const days = (() => {
            try {
              return JSON.parse(t.days) as Record<string, { slotType: string; componentId?: string }[]>;
            } catch {
              return {};
            }
          })();
          const configuredDays = Object.entries(days).filter(([, slots]) => slots && slots.length > 0);
          const totalSlots = configuredDays.reduce((sum, [, slots]) => sum + slots.length, 0);

          return (
            <div key={t.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{t.name}</h3>
                    {t.isDefault && <Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
                  </div>
                  {t.description && (
                    <p className="text-sm text-muted-foreground">{t.description}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setEditing(t)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(t.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {configuredDays.length > 0 ? (
                  <span>
                    {configuredDays.length} ימים מוגדרים · {totalSlots} פריטים סה״כ
                  </span>
                ) : (
                  <span>אין ימים מוגדרים</span>
                )}
              </div>

              {configuredDays.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {configuredDays.map(([dayStr, slots]) => {
                    const dayIndex = parseInt(dayStr, 10);
                    return (
                      <span
                        key={dayStr}
                        className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px]"
                      >
                        {DAY_NAMES[dayIndex] ?? dayStr} ({slots.length})
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(creating || editing) && (
        <WeekTemplateForm
          open
          template={editing}
          components={components}
          onSave={handleSave}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
