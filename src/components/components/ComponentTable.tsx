"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ComponentForm } from "./ComponentForm";
import { SLOT_TYPE_LABELS, SlotType, COMPONENT_CATEGORIES } from "@/types";
import { Badge } from "@/components/ui/badge";
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
  defaultTransitionType: string | null;
  defaultMediaCode: string | null;
}

interface ComponentTableProps {
  components: ComponentRow[];
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

  // Group by category
  const grouped = new Map<string, ComponentRow[]>();
  for (const c of components) {
    const arr = grouped.get(c.category) ?? [];
    arr.push(c);
    grouped.set(c.category, arr);
  }

  return (
    <div className="space-y-6">
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
        Array.from(grouped.entries()).map(([cat, items]) => (
          <div key={cat} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{categoryLabel(cat)}</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-start font-medium">שם</th>
                    <th className="px-4 py-2 text-start font-medium">סוג פריט</th>
                    <th className="px-4 py-2 text-start font-medium">משך</th>
                    <th className="px-4 py-2 text-start font-medium">פרטים</th>
                    <th className="px-4 py-2 text-start font-medium w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id} className="border-t border-border hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">
                          {SLOT_TYPE_LABELS[c.slotType as SlotType] ?? c.slotType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {c.defaultDurationSec ? formatDurationSec(c.defaultDurationSec) : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">
                        {c.defaultNarratorScript ?? c.defaultMediaCode ?? c.defaultTransitionType ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
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
