"use client";

import { useState, useRef } from "react";

interface SessionLabelInputProps {
  dayId: string;
  sessionIndex: number;
  initialLabel: string | null;
}

export function SessionLabelInput({ dayId, sessionIndex, initialLabel }: SessionLabelInputProps) {
  const defaultLabel = `שיעור ${sessionIndex + 1}`;
  const [label, setLabel] = useState(initialLabel ?? "");
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleClick() {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function handleBlur() {
    setEditing(false);
    const trimmed = label.trim();
    await fetch(`/api/days/${dayId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionLabel: trimmed || null }),
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") inputRef.current?.blur();
    if (e.key === "Escape") {
      setLabel(initialLabel ?? "");
      setEditing(false);
    }
  }

  const displayText = label.trim() || defaultLabel;

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={defaultLabel}
        className="border-b border-primary bg-transparent text-foreground font-medium outline-none w-32 text-sm"
        dir="rtl"
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={handleClick}
      className="text-foreground font-medium hover:text-primary transition-colors border-b border-transparent hover:border-primary/40"
      title="לחץ לעריכת שם"
    >
      {displayText}
    </button>
  );
}
