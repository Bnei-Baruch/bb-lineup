"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanWeekDialog } from "./PlanWeekDialog";

interface RuleSet {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
}

interface Props {
  weekStart: string;
  ruleSets: RuleSet[];
  dayIds: Record<number, string>;
}

export function WeekAIButton({ weekStart, ruleSets, dayIds }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="me-2 h-4 w-4 text-amber-500" />
        תכנון AI
      </Button>

      <PlanWeekDialog
        open={open}
        onClose={() => setOpen(false)}
        weekStart={weekStart}
        ruleSets={ruleSets}
        dayIds={dayIds}
      />
    </>
  );
}
