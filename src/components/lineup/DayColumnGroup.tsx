"use client";

import { useState, useEffect, useRef } from "react";
import { DayColumn } from "./DayColumn";
import { DayWithSlots, SlotWithLesson } from "@/types";

interface Template { id: string; name: string }

interface DayColumnGroupProps {
  sessions: DayWithSlots[];
  weekStart: string;
  templates: Template[];
  onSlotsChange: (dayId: string, slots: SlotWithLesson[]) => void;
  onAddSession: (dayOfWeek: number, lineupId: string) => void;
  onDeleteSession: (dayId: string) => void;
}

export function DayColumnGroup({
  sessions,
  weekStart,
  templates,
  onSlotsChange,
  onAddSession,
  onDeleteSession,
}: DayColumnGroupProps) {
  const [activeTab, setActiveTab] = useState(0);
  const prevLength = useRef(sessions.length);

  useEffect(() => {
    if (sessions.length > prevLength.current) {
      setActiveTab(sessions.length - 1);
    }
    prevLength.current = sessions.length;
  }, [sessions.length]);

  if (sessions.length === 0) return null;

  const clampedTab = Math.min(activeTab, sessions.length - 1);
  const activeSession = sessions[clampedTab];

  return (
    <div className="flex flex-col min-h-0 border border-border rounded-lg overflow-hidden bg-card">
      {sessions.length > 1 && (
        <div className="flex border-b border-border bg-muted/50 text-xs min-h-0">
          {sessions.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveTab(i)}
              className={`flex-1 py-1.5 font-medium truncate px-1.5 transition-colors ${
                clampedTab === i
                  ? "bg-background border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:bg-background/60"
              }`}
            >
              {s.sessionLabel ?? `שיעור ${s.sessionIndex + 1}`}
              {s.broadcastStartTime ? ` ${s.broadcastStartTime.slice(0, 5)}` : ""}
            </button>
          ))}
          <button
            onClick={() => onAddSession(activeSession.dayOfWeek, activeSession.lineupId)}
            className="px-2.5 text-muted-foreground hover:text-foreground border-s border-border transition-colors"
            title="הוסף שיעור"
          >
            +
          </button>
        </div>
      )}

      <DayColumn
        day={activeSession}
        weekStart={weekStart}
        templates={templates}
        onSlotsChange={onSlotsChange}
        onAddSession={
          sessions.length === 1
            ? () => onAddSession(activeSession.dayOfWeek, activeSession.lineupId)
            : undefined
        }
        onDeleteSession={
          activeSession.sessionIndex > 0
            ? () => onDeleteSession(activeSession.id)
            : undefined
        }
      />
    </div>
  );
}
