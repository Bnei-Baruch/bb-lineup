"use client";

import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COMPONENT_CATEGORIES, SlotType } from "@/types";
import { Bookmark, Plus } from "lucide-react";

interface Component {
  id: string;
  name: string;
  slotType: string;
  category: string;
  defaultLabel: string | null;
  defaultDurationSec: number | null;
  defaultNarratorScript: string | null;
  defaultTransitionType: string | null;
  defaultMediaCode: string | null;
  defaultLanguage: string | null;
  defaultHasSubtitles: boolean;
  defaultHasWorkshopQuestions: boolean;
  defaultNotes: string | null;
  defaultPartNumber: number | null;
}

interface AddSlotMenuProps {
  onAdd: (slotType: SlotType) => void;
  onAddComponent: (component: Component) => void;
}

export function AddSlotMenu({ onAdd, onAddComponent }: AddSlotMenuProps) {
  const [components, setComponents] = useState<Component[]>([]);

  useEffect(() => {
    fetch("/api/components")
      .then((r) => r.json())
      .then((data) => setComponents(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Group components by their category field (matches the components table grouping)
  const byCategory = components.reduce<Record<string, Component[]>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex w-full items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
        <Plus className="h-4 w-4" />
        הוסף פריט
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">

        {COMPONENT_CATEGORIES.map((cat, ci) => {
          const group = byCategory[cat.value] ?? [];
          if (group.length === 0) return null;
          return (
            <DropdownMenuGroup key={cat.value}>
              {ci > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs text-muted-foreground">{cat.label}</DropdownMenuLabel>
              {group.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => onAddComponent(c)}>
                  <Bookmark className="h-3 w-3 shrink-0 text-blue-500" />
                  {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          );
        })}


      </DropdownMenuContent>
    </DropdownMenu>
  );
}
