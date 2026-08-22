"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Loader2, Download, Trash2 } from "lucide-react";

interface SeriesRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  sortOrder: number;
  currentArticleRef: string | null;
  currentLessonRef: string | null;
  currentPage: string | null;
  playoutCode: string | null;
  consumptionMode: string;
  _count?: { lessons: number };
}

interface SeriesManagerProps {
  series: SeriesRow[];
  onChanged?: () => void;
}

export function SeriesManager({ series: initial, onChanged }: SeriesManagerProps) {
  const router = useRouter();
  function refresh() { if (onChanged) { onChanged(); } else { router.refresh(); } }
  const [series, setSeries] = useState(initial);
  const [editing, setEditing] = useState<SeriesRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sheetImporting, setSheetImporting] = useState(false);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`למחוק את הסדרה "${name}"? השיעורים הקשורים לא יימחקו.`)) return;
    const res = await fetch(`/api/series/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSeries((prev) => prev.filter((s) => s.id !== id));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => setImporting(true)}>
          <Download className="me-2 h-4 w-4" />
          ייבא מקישור
        </Button>
        <Button variant="outline" onClick={() => setSheetImporting(true)}>
          <Download className="me-2 h-4 w-4" />
          ייבוא מגיליון
        </Button>
        <Button onClick={() => setCreating(true)}>
          <Plus className="me-2 h-4 w-4" />
          סדרה חדשה
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {series.map((s) => (
          <div
            key={s.id}
            className="border border-border rounded-lg p-4 space-y-3 bg-card hover:bg-accent/20 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {s.color && (
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                )}
                <h3 className="font-semibold">{s.name}</h3>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(s)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(s.id, s.name)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-1 text-sm">
              {s.currentArticleRef && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">מאמר:</span>
                  <span className="truncate">{s.currentArticleRef}</span>
                </div>
              )}
              {s.currentLessonRef && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">שיעור:</span>
                  <span className="truncate">{s.currentLessonRef}</span>
                </div>
              )}
              {s.currentPage && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">עמוד:</span>
                  <span>{s.currentPage}</span>
                </div>
              )}
              {!s.currentArticleRef && !s.currentLessonRef && !s.currentPage && (
                <p className="text-muted-foreground text-xs">אין סימנייה</p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">{s.slug}</Badge>
              <Badge variant="outline" className="text-xs">
                {s.consumptionMode === "continuous" ? "רציף" : "בחירה חכמה"}
              </Badge>
              {s._count != null && (
                <span className="text-xs text-muted-foreground">{s._count.lessons} שיעורים</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {(editing || creating) && (
        <SeriesForm
          series={editing ?? undefined}
          open={true}
          onClose={() => {
            setEditing(null);
            setCreating(false);
            refresh();
          }}
        />
      )}

      {importing && (
        <CollectionImport
          open={true}
          onClose={() => {
            setImporting(false);
            refresh();
          }}
        />
      )}

      {sheetImporting && (
        <SheetImport
          open={true}
          onClose={() => {
            setSheetImporting(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function SeriesForm({
  series,
  open,
  onClose,
}: {
  series?: SeriesRow;
  open: boolean;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: series?.name ?? "",
    slug: series?.slug ?? "",
    color: series?.color ?? "",
    sortOrder: String(series?.sortOrder ?? 0),
    currentArticleRef: series?.currentArticleRef ?? "",
    currentLessonRef: series?.currentLessonRef ?? "",
    currentPage: series?.currentPage ?? "",
    playoutCode: series?.playoutCode ?? "",
    consumptionMode: series?.consumptionMode ?? "pickable",
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        color: form.color || null,
        sortOrder: parseInt(form.sortOrder) || 0,
        currentArticleRef: form.currentArticleRef || null,
        currentLessonRef: form.currentLessonRef || null,
        currentPage: form.currentPage || null,
        playoutCode: form.playoutCode || null,
        consumptionMode: form.consumptionMode,
      };

      const url = series ? `/api/series/${series.id}` : "/api/series";
      const method = series ? "PUT" : "POST";
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{series ? "עריכת סדרה" : "סדרה חדשה"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>שם</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="רב״ש" />
            </div>
            <div className="space-y-1.5">
              <Label>מזהה (slug)</Label>
              <Input value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="rabash" dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>צבע</Label>
              <Input value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="purple" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>סדר מיון</Label>
              <Input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} dir="ltr" className="w-20" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>מאמר נוכחי (סימנייה)</Label>
            <Input value={form.currentArticleRef} onChange={(e) => set("currentArticleRef", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>שיעור מוקלט נוכחי</Label>
            <Input value={form.currentLessonRef} onChange={(e) => set("currentLessonRef", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>עמוד נוכחי</Label>
            <Input value={form.currentPage} onChange={(e) => set("currentPage", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>שיטת בחירת תוכן</Label>
            <select
              value={form.consumptionMode}
              onChange={(e) => set("consumptionMode", e.target.value)}
              className="w-full text-sm border border-input rounded-md px-3 py-2 bg-background"
            >
              <option value="pickable">בחירה חכמה - חיפוש שיעור לא-משודר שמתאים למשך הזמן שנשאר</option>
              <option value="continuous">רציף - שיעור אחר שיעור לפי הסדר, ללא בחירה</option>
            </select>
            <p className="text-xs text-muted-foreground">קובע איך פריט &quot;דינמי - שיעור מסדרה&quot; בתבניות התכנון יתנהג עבור סדרה זו.</p>
          </div>
          <div className="space-y-1.5">
            <Label>קוד פלאאוט (Companion)</Label>
            <Input value={form.playoutCode} onChange={(e) => set("playoutCode", e.target.value)} placeholder="RAV" dir="ltr" className="font-mono" />
            <p className="text-xs text-muted-foreground">קוד הקליפ שמזהה בקומפניון — חייב להתאים לשם הטריגר (לדוג׳ RAV, RABASH)</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSave} disabled={saving || !form.name || !form.slug}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {series ? "שמור" : "צור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CollectionImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [color, setColor] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; total: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/series/from-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), color: color || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "שגיאה בייבוא");
      } else {
        setResult({ imported: data.imported, total: data.total, name: data.series.name });
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (result) onClose();
    else onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ייבוא סדרה מקבלה מדיה</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>קישור לקולקציה (קבלה מדיה)</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://kabbalahmedia.info/backend/collections?id=..."
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">הדבק קישור לאוסף — השיעורים ייובאו אוטומטית</p>
          </div>
          <div className="space-y-1.5">
            <Label>צבע (אופציונלי)</Label>
            <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="purple" dir="ltr" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && (
            <div className="rounded-md bg-green-500/10 border border-green-500/30 p-3 text-sm space-y-1">
              <p className="font-semibold">{result.name}</p>
              <p className="text-muted-foreground">יובאו {result.imported} שיעורים מתוך {result.total}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {result ? "סגור" : "ביטול"}
          </Button>
          {!result && (
            <Button onClick={handleImport} disabled={loading || !url.trim()}>
              {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              ייבא
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SheetImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [color, setColor] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    seriesCreated: string[];
    lessonsImported: number;
    lessonsUpdated: number;
    noPartsSkipped: number;
    errors: { row: number; reason: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/series/from-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), color: color || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "שגיאה בייבוא");
      } else {
        setResult(data);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ייבוא סדרה מגיליון</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>קישור לגיליון Google Sheets</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=..."
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">
              הגיליון צריך לכלול עמודות: תאריך, מס', שיעור, קריאת מקורות, קישור, תמליל, זמנים, וכן זוגות תאריך שידור/חלק N לכל חלק שידור. שורת כותרת סדרה (בלי מס'/שיעור/קישור) פותחת סדרה חדשה.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>צבע (אופציונלי, לכל הסדרות שייווצרו)</Label>
            <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="purple" dir="ltr" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && (
            <div className="rounded-md bg-green-500/10 border border-green-500/30 p-3 text-sm space-y-1">
              {result.seriesCreated.length > 0 && (
                <p className="font-semibold">סדרות חדשות: {result.seriesCreated.join(", ")}</p>
              )}
              <p className="text-muted-foreground">
                יובאו {result.lessonsImported} חלקי שיעורים חדשים
                {result.lessonsUpdated > 0 ? `, עודכנו ${result.lessonsUpdated} חלקי שיעורים קיימים` : ""}
                {result.noPartsSkipped > 0 ? `, דולגו ${result.noPartsSkipped} שיעורים (ללא חלוקה לחלקים)` : ""}
              </p>
              {result.errors.length > 0 && (
                <div className="pt-1 space-y-0.5">
                  <p className="text-destructive font-medium">{result.errors.length} שגיאות:</p>
                  {result.errors.slice(0, 10).map((e, i) => (
                    <p key={i} className="text-xs text-muted-foreground">שורה {e.row}: {e.reason}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {result ? "סגור" : "ביטול"}
          </Button>
          {!result && (
            <Button onClick={handleImport} disabled={loading || !url.trim()}>
              {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              ייבא
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
