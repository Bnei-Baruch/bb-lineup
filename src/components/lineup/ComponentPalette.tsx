"use client";

import { useState, useMemo } from "react";
import { COMPONENT_CATEGORIES } from "@/types";
import { Badge } from "@/components/ui/badge";
import { formatDurationSec } from "@/lib/time";

interface PaletteComponent {
  id: string;
  name: string;
  category: string;
  slotType: string;
  defaultDurationSec: number | null;
}

interface ComponentPaletteProps {
  components: PaletteComponent[];
  onAdd: (componentId: string) => void;
}

export function ComponentPalette({ components, onAdd }: ComponentPaletteProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const usedCategories = useMemo(
    () => new Set(components.map((c) => c.category)),
    [components]
  );

  const filtered = selectedCategory
    ? components.filter((c) => c.category === selectedCategory)
    : components;

  const categoryLabel = (cat: string) =>
    COMPONENT_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">קומפוננטות</h3>

      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-2 py-0.5 rounded text-xs border transition-colors ${
            selectedCategory === null
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border hover:bg-accent"
          }`}
        >
          הכל
        </button>
        {COMPONENT_CATEGORIES.map((cat) => {
          if (!usedCategories.has(cat.value)) return null;
          return (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value === selectedCategory ? null : cat.value)}
              className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                selectedCategory === cat.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:bg-accent"
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-1">
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => onAdd(c.id)}
            className="w-full text-start px-2 py-1.5 rounded-md border border-border bg-card hover:bg-accent text-xs transition-colors flex items-center justify-between gap-2"
          >
            <span className="truncate">{c.name}</span>
            <span className="shrink-0 flex items-center gap-1">
              {!selectedCategory && (
                <span className="text-[10px] text-muted-foreground">{categoryLabel(c.category)}</span>
              )}
              {c.defaultDurationSec != null && (
                <Badge variant="outline" className="text-[10px]">
                  {formatDurationSec(c.defaultDurationSec)}
                </Badge>
              )}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">אין קומפוננטות בקטגוריה זו</p>
        )}
      </div>
    </div>
  );
}
