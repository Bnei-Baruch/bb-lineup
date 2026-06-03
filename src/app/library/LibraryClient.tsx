"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { LessonTable } from "@/components/library/LessonTable";
import { SeriesManager } from "@/components/series/SeriesManager";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LessonRow {
  id: string;
  approvalStatus: string;
  recordingDate: Date | null;
  broadcastDate: string | null;
  sourceRef: string | null;
  narratorName: string | null;
  videoDurationSec: number | null;
  articleReadingSec: number | null;
  tags: string | null;
  kmPageLink: string | null;
  articleSourceLink: string | null;
  transcriptionLink: string | null;
  series: { id: string; name: string; color: string | null } | null;
  articleSource: { bookSeries: string | null; bookVolume: number | null; bookPage: number | null } | null;
}

interface SeriesRow {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  sortOrder: number;
  currentArticleRef: string | null;
  currentLessonRef: string | null;
  currentPage: string | null;
  _count?: { lessons: number };
}

interface Props {
  lessons: LessonRow[];
  series: SeriesRow[];
  currentSlotIds: string[];
  pastSlotIds: string[];
}

type Tab = "lessons" | "series";

export function LibraryClient({ lessons: initial, series, currentSlotIds, pastSlotIds }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("lessons");
  const [lessons, setLessons] = useState(initial);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importYear, setImportYear] = useState(String(new Date().getFullYear()));
  const [importSkipRows, setImportSkipRows] = useState("7");
  const [importDryRun, setImportDryRun] = useState(false);
  const [importSeriesId, setImportSeriesId] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number; errors: number; total: number; log: string[]; dryRun: boolean } | null>(null);

  async function refreshLessons() {
    const res = await fetch("/api/lessons?pageSize=2000");
    if (!res.ok) return;
    const data = await res.json();
    if (data.lessons) setLessons(data.lessons);
  }

  async function handleImport() {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/import/spreadsheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: importUrl || undefined,
          year: parseInt(importYear),
          skipRows: parseInt(importSkipRows),
          dryRun: importDryRun,
          seriesId: importSeriesId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "שגיאה"); return; }
      setImportResult(data);
      if (!importDryRun && (data.created > 0 || data.updated > 0)) await refreshLessons();
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("למחוק את השיעור?")) return;
    const res = await fetch(`/api/lessons/${id}`, { method: "DELETE" });
    if (res.status === 409) {
      const data = await res.json();
      alert(data.error);
      return;
    }
    if (res.ok) setLessons((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleBulkStatusChange(ids: string[], status: string) {
    const res = await fetch("/api/lessons/bulk-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    });
    if (!res.ok) return;
    setLessons((prev) => prev.map((l) => ids.includes(l.id) ? { ...l, approvalStatus: status } : l));
  }

  async function handleBulkAssignSeries(ids: string[], seriesId: string | null) {
    const res = await fetch("/api/lessons/bulk-series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, seriesId }),
    });
    if (!res.ok) return;
    const targetSeries = seriesId ? series.find((s) => s.id === seriesId) ?? null : null;
    setLessons((prev) =>
      prev.map((l) =>
        ids.includes(l.id)
          ? { ...l, series: targetSeries ? { id: targetSeries.id, name: targetSeries.name, color: targetSeries.color } : null }
          : l
      )
    );
  }

  async function handleBulkDelete(ids: string[]) {
    if (!confirm(`למחוק ${ids.length} שיעורים?`)) return;
    const res = await fetch("/api/lessons/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setLessons((prev) => prev.filter((l) => !ids.includes(l.id)));
    if (data.skipped > 0) {
      alert(`נמחקו ${data.deleted} שיעורים. ${data.skipped} שיעורים משובצים בתוכנית ולא נמחקו.`);
    }
  }

  const normalized = lessons.map((l) => ({
    ...l,
    recordingDate: l.recordingDate ? (typeof l.recordingDate === "string" ? l.recordingDate : (l.recordingDate as Date).toISOString()) : null,
    series: l.series ?? null,
  }));

  const seriesList = series.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ספרייה</h1>
        {tab === "lessons" && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setImportOpen(true); setImportResult(null); }}>
              <Upload className="me-2 h-4 w-4" />
              ייבוא מגיליון
            </Button>
            <Link href="/library/new" className={buttonVariants()}>
              <Plus className="me-2 h-4 w-4" />
              שיעור חדש
            </Link>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["lessons", "series"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "lessons" ? `שיעורים (${lessons.length})` : "סדרות"}
          </button>
        ))}
      </div>

      {tab === "lessons" && (
        <LessonTable
          lessons={normalized}
          seriesList={seriesList}
          currentSlotIds={currentSlotIds}
          pastSlotIds={pastSlotIds}
          onDelete={handleDelete}
          onBulkDelete={handleBulkDelete}
          onBulkStatusChange={handleBulkStatusChange}
          onBulkAssignSeries={handleBulkAssignSeries}
        />
      )}

      {tab === "series" && (
        <SeriesManager
          series={series}
          onChanged={() => router.refresh()}
        />
      )}

      {/* Import from spreadsheet dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ייבוא שיעורים מגיליון Google Sheets</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>קישור לגיליון (ריק = גיליון ברירת מחדל)</Label>
              <Input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                dir="ltr"
              />
            </div>
            <div className="flex gap-3">
              <div className="space-y-1.5 flex-1">
                <Label>שנה</Label>
                <Input value={importYear} onChange={(e) => setImportYear(e.target.value)} dir="ltr" className="w-24" />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label>שורות כותרת לדלג</Label>
                <Input value={importSkipRows} onChange={(e) => setImportSkipRows(e.target.value)} dir="ltr" className="w-24" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>סדרה (לשיעורים חדשים בלבד)</Label>
              <select
                value={importSeriesId}
                onChange={(e) => setImportSeriesId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">ללא סדרה</option>
                {series.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={importDryRun} onChange={(e) => setImportDryRun(e.target.checked)} />
              בדיקה בלבד (dry run — ללא שמירה)
            </label>

            {importResult && (
              <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
                <div className="flex gap-4 text-sm font-medium">
                  {importResult.dryRun && <span className="text-orange-600">Dry run</span>}
                  <span className="text-green-700">+{importResult.created} נוצרו</span>
                  <span className="text-blue-700">↺ {importResult.updated} עודכנו</span>
                  <span className="text-muted-foreground">{importResult.skipped} דולגו</span>
                  {importResult.errors > 0 && <span className="text-destructive">{importResult.errors} שגיאות</span>}
                </div>
                <div className="max-h-48 overflow-y-auto text-xs text-muted-foreground space-y-0.5 font-mono">
                  {importResult.log.map((line, i) => (
                    <p key={i} className={line.startsWith("ERROR") ? "text-destructive" : ""}>{line}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportOpen(false)}>סגור</Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? "מייבא..." : importDryRun ? "בדוק" : "ייבא"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
