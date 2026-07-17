"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SlotWithLesson } from "@/types";

interface RuleSet {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  dayId: string;
  onApplied: (slots: SlotWithLesson[], contentStartIndex: number | null, contentCutoffIndex: number | null) => void;
}

export function ApplyDayTemplateDialog({ open, onClose, dayId, onApplied }: Props) {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [clearExisting, setClearExisting] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedId("");
      setClearExisting(false);
      fetch("/api/lineup-rules").then((r) => r.json()).then(setRuleSets);
    }
  }, [open]);

  async function handleApply() {
    if (!selectedId) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/lineup-rules/${selectedId}/apply-day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId, clearExisting }),
      });
      if (!res.ok) return;
      const { contentStartIndex, contentCutoffIndex } = await res.json();
      const slotsRes = await fetch(`/api/days/${dayId}/slots`);
      const slots = slotsRes.ok ? await slotsRes.json() : [];
      onApplied(slots, contentStartIndex ?? null, contentCutoffIndex ?? null);
      onClose();
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>החל תבנית AI</DialogTitle>
        </DialogHeader>

        {ruleSets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            אין תבניות — צור תבנית דרך &quot;שמור כתבנית AI&quot;
          </p>
        ) : (
          <div className="space-y-2">
            {ruleSets.map((rs) => (
              <button
                key={rs.id}
                onClick={() => setSelectedId(rs.id)}
                className={`w-full text-start px-3 py-2 rounded-md border text-sm transition-colors ${selectedId === rs.id ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-accent"}`}
              >
                {rs.name}
              </button>
            ))}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={clearExisting} onChange={(e) => setClearExisting(e.target.checked)} className="rounded" />
          נקה פריטים קיימים לפני ההחלה
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleApply} disabled={!selectedId || applying}>
            {applying ? "מחיל..." : "החל תבנית"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
