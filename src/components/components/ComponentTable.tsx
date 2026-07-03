"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ComponentForm } from "./ComponentForm";
import { SLOT_TYPE_LABELS, SLOT_TYPE_COLORS, SlotType, COMPONENT_CATEGORIES } from "@/types";
import { formatDurationSec } from "@/lib/time";
import { Pencil, Trash2, Plus } from "lucide-react";

interface ComponentRow {
  id: string;
  name: string;
  category: string;
  slotType: string;
  sortOrder: number;
  defaultLabel: string | null;
  defaultDurationSec: number | null;
  defaultNarratorScript: string | null;
  defaultLineupLink: string | null;
  defaultTransitionType: string | null;
  defaultMediaCode: string | null;
}

interface ComponentTableProps {
  components: ComponentRow[];
}

const CATEGORY_ACCENT: Record<string, string> = {
  narrator:     "bg-orange-400",
  transition:   "bg-slate-400",
  live_content: "bg-teal-400",
  workshop:     "bg-rose-400",
  music:        "bg-pink-400",
  header:       "bg-yellow-400",
  custom:       "bg-gray-400",
};

function slotChipClass(slotType: string): string {
  const colors = SLOT_TYPE_COLORS[slotType as SlotType];
  if (!colors) return "bg-gray-100 border-gray-300 text-gray-700";
  const bg     = colors.split(" ").find((c) => c.startsWith("bg-"))     ?? "bg-gray-100";
  const border = colors.split(" ").find((c) => c.startsWith("border-")) ?? "border-gray-300";
  return `${bg} ${border} border text-foreground`;
}

export function ComponentTable({ components: initial }: ComponentTableProps) {
  const router = useRouter();
  const [components, setComponents] = useState(initial);
  const [editing, setEditing] = useState<ComponentRow | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleDelete(id: string) {
    if (!confirm("למחוק קומפוננטה?")) return;
    const res = await fetch(`/api/components/${id}`, { method: "DELETE" });
    if (res.ok) {
      setComponents((prev) => prev.filter((c) => c.id !== id));
      router.refresh();
    }
  }

  const categoryLabel = (cat: string) =>
    COMPONENT_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;

  const grouped = new Map<string, ComponentRow[]>();
  for (const c of components) {
    const arr = grouped.get(c.category) ?? [];
    arr.push(c);
    grouped.set(c.category, arr);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">קומפוננטות</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus className="me-2 h-4 w-4" />
          קומפוננטה חדשה
        </Button>
      </div>

      {components.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">אין קומפוננטות עדיין</p>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([cat, items]) => (
            <div key={cat} className="rounded-xl border border-border overflow-hidden shadow-sm">
              {/* Category header */}
              <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/60 border-b border-border">
                <div className={`w-1.5 h-4 rounded-full shrink-0 ${CATEGORY_ACCENT[cat] ?? "bg-gray-400"}`} />
                <span className="font-semibold text-sm">{categoryLabel(cat)}</span>
                <span className="text-xs text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5 tabular-nums">
                  {items.length}
                </span>
              </div>

              {/* Component rows */}
              {items.map((c, idx) => {
                const detail = c.defaultNarratorScript ?? c.defaultMediaCode ?? c.defaultTransitionType;
                return (
                  <div
                    key={c.id}
                    className={`flex items-center gap-4 px-4 py-3 group hover:bg-accent/20 transition-colors ${idx > 0 ? "border-t border-border" : ""}`}
                  >
                    {/* Name + detail */}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{c.name}</span>
                      {detail && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{detail}</p>
                      )}
                    </div>

                    {/* Slot type chip */}
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${slotChipClass(c.slotType)}`}>
                      {SLOT_TYPE_LABELS[c.slotType as SlotType] ?? c.slotType}
                    </span>

                    {/* Duration */}
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground w-14 text-end">
                      {c.defaultDurationSec ? formatDurationSec(c.defaultDurationSec) : "—"}
                    </span>

                    {/* Actions — visible on hover */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <ComponentForm open={true} onClose={() => { setCreating(false); router.refresh(); }} />
      )}
      {editing && (
        <ComponentForm component={editing as unknown as Record<string, unknown>} open={true} onClose={() => { setEditing(null); router.refresh(); }} />
      )}
    </div>
  );
}
