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
  onAdd: (componentId: string, name: string) => void;
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
    <div className="flex flex-col h-full">
      {/* Sticky header — title + category filters */}
      <div className="shrink-0 p-3 pb-2 space-y-2">
        <h3 className="font-semibold text-base">קומפוננטות</h3>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1 rounded text-sm border transition-colors ${
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
                className={`px-3 py-1 rounded text-sm border transition-colors ${
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
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => onAdd(c.id, c.name)}
            className="w-full text-start px-3 py-2 rounded-md border border-border bg-card hover:bg-accent text-sm transition-colors flex items-center justify-between gap-2"
          >
            <span className="truncate">{c.name}</span>
            <span className="shrink-0 flex items-center gap-2">
              {!selectedCategory && (
                <span className="text-xs text-muted-foreground">{categoryLabel(c.category)}</span>
              )}
              {c.defaultDurationSec != null && (
                <Badge variant="outline" className="text-xs">
                  {formatDurationSec(c.defaultDurationSec)}
                </Badge>
              )}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">אין קומפוננטות בקטגוריה זו</p>
        )}
      </div>
    </div>
  );
}
