"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SlotWithLesson, LESSON_SLOT_TYPES } from "@/types";

interface TemplateSlot {
  type: "fixed" | "lesson" | "article";
  componentId?: string;
  slotType?: string;
  label?: string;
}

interface RuleSet {
  id: string;
  name: string;
  dayTemplate: string;
}

function slotsToTemplate(slots: SlotWithLesson[]): TemplateSlot[] {
  return slots
    .filter((s) => s.slotType !== "part_header")
    .map((s) => {
      if (s.slotType === "article_reading") return { type: "article" as const };
      if (LESSON_SLOT_TYPES.includes(s.slotType)) return { type: "lesson" as const, slotType: s.slotType };
      if (s.componentId) return { type: "fixed" as const, componentId: s.componentId, slotType: s.slotType };
      return { type: "fixed" as const, slotType: s.slotType, label: s.label ?? undefined };
    });
}

interface Props {
  open: boolean;
  onClose: () => void;
  slots: SlotWithLesson[];
}

export function SaveAsTemplateDialog({ open, onClose, slots }: Props) {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [selectedId, setSelectedId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setSaved(false);
      fetch("/api/lineup-rules").then((r) => r.json()).then(setRuleSets);
    }
  }, [open]);

  const template = slotsToTemplate(slots);

  async function handleSave() {
    setSaving(true);
    try {
      if (mode === "new") {
        await fetch("/api/lineup-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName, dayTemplate: JSON.stringify(template) }),
        });
      } else {
        const rs = ruleSets.find((r) => r.id === selectedId);
        if (!rs) return;
        await fetch(`/api/lineup-rules/${selectedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...rs, dayTemplate: JSON.stringify(template) }),
        });
      }
      setSaved(true);
      setTimeout(onClose, 800);
    } finally {
      setSaving(false);
    }
  }

  const canSave = mode === "new" ? newName.trim().length > 0 : !!selectedId;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>שמור כתבנית AI</DialogTitle>
        </DialogHeader>

        {/* Template preview */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground mb-2">מבנה הלינאפ ({template.length} פריטים)</p>
          {template.map((t, i) => {
            const color =
              t.type === "fixed" ? "bg-blue-100 text-blue-700" :
              t.type === "lesson" ? "bg-purple-100 text-purple-700" :
              "bg-green-100 text-green-700";
            const lbl =
              t.type === "fixed" ? (t.label ?? t.slotType ?? "קבוע") :
              t.type === "lesson" ? "שיעור מוקלט" : "קריאת מאמר";
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-4 tabular-nums">{i + 1}.</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${color}`}>{lbl}</span>
              </div>
            );
          })}
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode("pick")}
            className={`flex-1 text-sm py-1.5 rounded-md border transition-colors ${mode === "pick" ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            עדכן תבנית קיימת
          </button>
          <button
            onClick={() => setMode("new")}
            className={`flex-1 text-sm py-1.5 rounded-md border transition-colors ${mode === "new" ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            תבנית חדשה
          </button>
        </div>

        {mode === "pick" ? (
          <div className="space-y-2">
            {ruleSets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">אין תבניות — צור תבנית חדשה</p>
            ) : (
              ruleSets.map((rs) => (
                <button
                  key={rs.id}
                  onClick={() => setSelectedId(rs.id)}
                  className={`w-full text-start px-3 py-2 rounded-md border text-sm transition-colors ${selectedId === rs.id ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-accent"}`}
                >
                  {rs.name}
                  {selectedId === rs.id && <span className="text-xs text-muted-foreground ms-2">← יוחלף</span>}
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>שם התבנית</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="למשל: לינאפ בוקר רגיל"
              autoFocus
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saved ? "✓ נשמר" : saving ? "שומר..." : "שמור תבנית"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
