"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SLOT_TYPE_LABELS, SLOT_TYPE_GROUPS, SlotType } from "@/types";
import { Separator } from "@/components/ui/separator";
import { Plus } from "lucide-react";

interface AddSlotMenuProps {
  onAdd: (slotType: SlotType) => void;
}

export function AddSlotMenu({ onAdd }: AddSlotMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex w-full items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
        <Plus className="h-4 w-4" />
        הוסף פריט
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
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
