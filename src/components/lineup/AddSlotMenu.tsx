"use client";

import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SLOT_TYPE_LABELS, SLOT_TYPE_GROUPS, SlotType } from "@/types";
import { Separator } from "@/components/ui/separator";
import { Plus } from "lucide-react";

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

  // Group components by category
  const componentGroups = components.reduce<Record<string, Component[]>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex w-full items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
        <Plus className="h-4 w-4" />
        הוסף פריט
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        {/* Saved components */}
        {components.length > 0 && (
          <>
            <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">רכיבים שמורים</p>
            {Object.entries(componentGroups).map(([, items]) =>
              items.map((c) => (
                <DropdownMenuItem key={c.id} onSelect={() => onAddComponent(c)}>
                  {c.name}
                </DropdownMenuItem>
              ))
            )}
            <Separator className="my-1" />
          </>
        )}

        {/* Slot types */}
        {SLOT_TYPE_GROUPS.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && <Separator className="my-1" />}
            <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">{group.label}</p>
            {group.types.map((type) => (
              <DropdownMenuItem key={type} onSelect={() => onAdd(type)}>
                {SLOT_TYPE_LABELS[type]}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
