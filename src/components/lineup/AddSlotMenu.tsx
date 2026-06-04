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
import { SLOT_TYPE_LABELS, SLOT_TYPE_GROUPS, SlotType } from "@/types";
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex w-full items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
        <Plus className="h-4 w-4" />
        הוסף פריט
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">

        {/* Saved components */}
        {components.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">רכיבים שמורים</DropdownMenuLabel>
            {components.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => onAddComponent(c)}>
                {c.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </DropdownMenuGroup>
        )}

        {/* Slot types */}
        {SLOT_TYPE_GROUPS.map((group, gi) => (
          <DropdownMenuGroup key={group.label}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground">{group.label}</DropdownMenuLabel>
            {group.types.map((type) => (
              <DropdownMenuItem key={type} onClick={() => onAdd(type)}>
                {SLOT_TYPE_LABELS[type]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}

      </DropdownMenuContent>
    </DropdownMenu>
  );
}
