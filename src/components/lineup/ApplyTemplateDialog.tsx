"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LayoutTemplate } from "lucide-react";

interface Template {
  id: string;
  name: string;
}

interface Props {
  weekStart: string;
  templates: Template[];
}

export function ApplyTemplateDialog({ weekStart, templates }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const [clearExisting, setClearExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/week-templates/${selectedId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, clearExisting }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "שגיאה בהחלת התבנית");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (templates.length === 0) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LayoutTemplate className="me-2 h-4 w-4" />
        החל תבנית
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); setError(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>החל תבנית שבועית</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">תבנית</label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={clearExisting}
                onChange={(e) => setClearExisting(e.target.checked)}
              />
              נקה פריטים קיימים לפני ההחלה
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              ביטול
            </Button>
            <Button onClick={handleApply} disabled={!selectedId || loading}>
              {loading ? "מחיל..." : "החל"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
