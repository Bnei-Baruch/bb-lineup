"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { ChevronLeft, ChevronDown, ChevronUp } from "lucide-react";

interface LineupRow {
  id: string;
  weekStart: Date;
  notes: string | null;
}

interface LineupListProps {
  lineups: LineupRow[];
  currentWeekParam: string;
}

function weekParam(weekStart: Date): string {
  return new Date(weekStart).toISOString().slice(0, 10);
}

function LineupRowLink({ lineup, isCurrent, rowRef }: {
  lineup: LineupRow;
  isCurrent: boolean;
  rowRef?: React.Ref<HTMLAnchorElement>;
}) {
  const ws = new Date(lineup.weekStart);
  const we = new Date(ws);
  we.setUTCDate(we.getUTCDate() + 6);
  const param = weekParam(ws);

  return (
    <Link
      ref={rowRef}
      href={`/lineup/${param}`}
      className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent ${
        isCurrent ? "bg-primary/5 border-s-4 border-s-primary" : "border-s-4 border-s-transparent"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="tabular-nums font-medium">
          {formatDate(ws)} – {formatDate(we)}
        </span>
        {isCurrent && (
          <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary text-primary-foreground">
            השבוע הנוכחי
          </span>
        )}
        {lineup.notes && (
          <span className="text-sm text-muted-foreground truncate">{lineup.notes}</span>
        )}
      </div>
      <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

export function LineupList({ lineups, currentWeekParam }: LineupListProps) {
  const currentRef = useRef<HTMLAnchorElement>(null);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const past = lineups.filter((l) => weekParam(l.weekStart) < currentWeekParam);
  const upcoming = lineups.filter((l) => weekParam(l.weekStart) >= currentWeekParam);

  return (
    <div className="max-w-2xl mx-auto flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
      {past.length > 0 && (
        <button
          onClick={() => setShowPast((v) => !v)}
          className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
        >
          <span>{showPast ? "הסתר שבועות קודמים" : `הצג ${past.length} שבועות קודמים`}</span>
          {showPast ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}
      {showPast && past.map((lineup) => (
        <LineupRowLink key={lineup.id} lineup={lineup} isCurrent={false} />
      ))}
      {upcoming.map((lineup) => (
        <LineupRowLink
          key={lineup.id}
          lineup={lineup}
          isCurrent={weekParam(lineup.weekStart) === currentWeekParam}
          rowRef={weekParam(lineup.weekStart) === currentWeekParam ? currentRef : undefined}
        />
      ))}
    </div>
  );
}
