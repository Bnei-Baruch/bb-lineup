"use client";

import { Input } from "@/components/ui/input";
import { LIVE_CONTENT_LINEUP_LINKS } from "@/types";

const CUSTOM = "__custom__";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function LineupLinkPicker({ value, onChange }: Props) {
  const isPreset = LIVE_CONTENT_LINEUP_LINKS.some((l) => l.url === value);
  const selectValue = value === "" ? "" : isPreset ? value : CUSTOM;

  return (
    <div className="space-y-1.5">
      <select
        value={selectValue}
        onChange={(e) => onChange(e.target.value === CUSTOM ? "" : e.target.value)}
        className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">בחר קישור</option>
        {LIVE_CONTENT_LINEUP_LINKS.map((l) => (
          <option key={l.url} value={l.url}>{l.label}</option>
        ))}
        <option value={CUSTOM}>אחר (קישור מותאם)</option>
      </select>
      {selectValue === CUSTOM && (
        <Input value={value} onChange={(e) => onChange(e.target.value)} dir="ltr" placeholder="https://..." />
      )}
    </div>
  );
}
