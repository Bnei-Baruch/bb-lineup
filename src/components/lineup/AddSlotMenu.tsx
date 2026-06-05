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
import { SLOT_TYPE_GROUPS, SlotType } from "@/types";
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

  // Index components by slotType for fast lookup
  const byType = components.reduce<Record<string, Component[]>>((acc, c) => {
    (acc[c.slotType] ??= []).push(c);
    return acc;
  }, {});

  // Components whose slotType doesn't appear in any group (show at top)
  const allGroupTypes = new Set(SLOT_TYPE_GROUPS.flatMap((g) => g.types as string[]));
  const orphanComponents = components.filter((c) => !allGroupTypes.has(c.slotType));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex w-full items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
        <Plus className="h-4 w-4" />
        הוסף פריט
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">

        {/* Orphan components (type not in any group) */}
        {orphanComponents.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">אחר</DropdownMenuLabel>
            {orphanComponents.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => onAddComponent(c)}>
                <Bookmark className="h-3 w-3 shrink-0 text-blue-500" />
                {c.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </DropdownMenuGroup>
        )}

        {/* Components grouped by slot type group — only groups that have saved components */}
        {SLOT_TYPE_GROUPS.map((group, gi) => {
          const groupComponents = group.types.flatMap((t) => byType[t] ?? []);
          if (groupComponents.length === 0) return null;
          const prevGroupsWithComponents = SLOT_TYPE_GROUPS.slice(0, gi).some(
            (g) => g.types.flatMap((t) => byType[t] ?? []).length > 0
          );
          return (
            <DropdownMenuGroup key={group.label}>
              {(prevGroupsWithComponents || orphanComponents.length > 0) && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs text-muted-foreground">{group.label}</DropdownMenuLabel>
              {groupComponents.map((c) => (
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
