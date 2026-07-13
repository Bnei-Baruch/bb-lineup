"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { weekStartParam, parseWeekParam, formatDate } from "@/lib/dates";

interface WeekPickerProps {
  weekStart: string;
}

export function WeekPicker({ weekStart }: WeekPickerProps) {
  const router = useRouter();
  const current = parseWeekParam(weekStart);

  function navigate(offset: number) {
    const next = new Date(current);
    next.setUTCDate(next.getUTCDate() + offset * 7);
    router.push(`/lineup/${weekStartParam(next)}`);
  }

  const endDate = new Date(current);
  endDate.setUTCDate(endDate.getUTCDate() + 6);

  return (
    <div className="flex items-center gap-2">
      {/* RTL: right arrow = previous week, left arrow = next week */}
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => navigate(-1)} title="שבוע קודם" aria-label="שבוע קודם">
        <ChevronRight className="h-4 w-4" />
        שבוע קודם
      </Button>
      <span className="text-sm font-medium tabular-nums min-w-[140px] text-center">
        {formatDate(current)} – {formatDate(endDate)}
      </span>
      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => navigate(1)} title="שבוע הבא" aria-label="שבוע הבא">
        שבוע הבא
        <ChevronLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}
