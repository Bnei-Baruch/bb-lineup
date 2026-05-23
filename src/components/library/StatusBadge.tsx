"use client";
import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  approved:  { label: "מאושר",  className: "border-green-500 text-green-700 bg-green-50" },
  pending:   { label: "ממתין",   className: "border-amber-400 text-amber-700 bg-amber-50" },
  used:      { label: "שודר",   className: "border-purple-400 text-purple-700 bg-purple-50" },
  scheduled: { label: "משובץ",  className: "border-blue-400 text-blue-700 bg-blue-50" },
  broadcast: { label: "שודר",   className: "border-purple-400 text-purple-700 bg-purple-50" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "" };
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}
