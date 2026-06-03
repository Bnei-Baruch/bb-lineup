"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/lib/button-variants";
import { formatDate } from "@/lib/dates";
import { formatDurationSec } from "@/lib/time";
import { Pencil, Trash2, Filter, X, Video, BookOpen, FileText } from "lucide-react";

interface LessonRow {
  id: string;
  approvalStatus: string;
  recordingDate: string | null;
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

interface LessonTableProps {
  lessons: LessonRow[];
  seriesList: { id: string; name: string }[];
  currentSlotIds: string[];
  pastSlotIds: string[];
  onDelete: (id: string) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkStatusChange: (ids: string[], status: string) => void;
  onBulkAssignSeries: (ids: string[], seriesId: string | null) => void;
}

export function LessonTable({ lessons, seriesList, currentSlotIds, pastSlotIds, onDelete, onBulkDelete, onBulkStatusChange, onBulkAssignSeries }: LessonTableProps) {
  const currentSet = useMemo(() => new Set(currentSlotIds), [currentSlotIds]);
  const pastSet = useMemo(() => new Set(pastSlotIds), [pastSlotIds]);

  // Filters
  const [q, setQ] = useState("");
  const [filterSeries, setFilterSeries] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterUsed, setFilterUsed] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [durMin, setDurMin] = useState("");
  const [durMax, setDurMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("approved");
  const [bulkSeriesId, setBulkSeriesId] = useState("");

  // Sorting
  type SortKey = "series" | "recordingDate" | "broadcastDate" | "duration" | "status";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDesc, setSortDesc] = useState(true);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const activeFilterCount = [filterSeries, filterStatus, filterUsed, dateFrom, dateTo, durMin, durMax]
    .filter(Boolean).length;

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const filtered = useMemo(() => {
    const result = lessons.filter((l) => {
      if (q && !l.sourceRef?.includes(q) &&
          !l.narratorName?.includes(q) && !l.tags?.includes(q) && !l.series?.name.includes(q)) return false;
      if (filterSeries && l.series?.id !== filterSeries) return false;
      if (filterStatus && l.approvalStatus !== filterStatus) return false;
      const bd = l.broadcastDate ? new Date(l.broadcastDate).toISOString().slice(0, 10) : null;
      if (filterUsed === "future" && (!bd || bd < today)) return false;
      if (filterUsed === "past" && (!bd || bd >= today)) return false;
      if (filterUsed === "unscheduled" && bd) return false;
      if (dateFrom && l.recordingDate && l.recordingDate < dateFrom) return false;
      if (dateTo && l.recordingDate && l.recordingDate > dateTo + "T23:59:59") return false;
      if (durMin && (l.videoDurationSec ?? 0) < parseInt(durMin) * 60) return false;
      if (durMax && (l.videoDurationSec ?? 0) > parseInt(durMax) * 60) return false;
      return true;
    });

    if (sortKey) {
      result.sort((a, b) => {
        let aVal: string | number = "";
        let bVal: string | number = "";
        if (sortKey === "series") {
          aVal = a.series?.name || "";
          bVal = b.series?.name || "";
        } else if (sortKey === "recordingDate") {
          aVal = a.recordingDate || "";
          bVal = b.recordingDate || "";
        } else if (sortKey === "broadcastDate") {
          aVal = a.broadcastDate || "";
          bVal = b.broadcastDate || "";
        } else if (sortKey === "duration") {
          aVal = (a.videoDurationSec ?? 0) + (a.articleReadingSec ?? 0);
          bVal = (b.videoDurationSec ?? 0) + (b.articleReadingSec ?? 0);
        } else if (sortKey === "status") {
          const statusOrder = { pending: 0, approved: 1, used: 2 };
          aVal = statusOrder[a.approvalStatus as keyof typeof statusOrder] ?? 3;
          bVal = statusOrder[b.approvalStatus as keyof typeof statusOrder] ?? 3;
        }

        if (aVal < bVal) return sortDesc ? 1 : -1;
        if (aVal > bVal) return sortDesc ? -1 : 1;
        return 0;
      });
    }

    return result;
  }, [lessons, q, filterSeries, filterStatus, filterUsed, dateFrom, dateTo, durMin, durMax, today, sortKey, sortDesc]);

  const allFilteredIds = filtered.map((l) => l.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => { const next = new Set(prev); allFilteredIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setSelected((prev) => new Set(Array.from(prev).concat(allFilteredIds)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function clearFilters() {
    setFilterSeries(""); setFilterStatus(""); setFilterUsed("");
    setDateFrom(""); setDateTo(""); setDurMin(""); setDurMax("");
  }

  return (
    <div className="space-y-3">
      {/* Search + filter toggle */}
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש לפי כותרת, מקור, קריין..."
          className="max-w-sm"
        />
        <Button
          variant={showFilters || activeFilterCount > 0 ? "default" : "outline"}
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
          className="gap-1.5"
        >
          <Filter className="h-3.5 w-3.5" />
          סינון
          {activeFilterCount > 0 && (
            <span className="bg-primary-foreground text-primary rounded-full text-[10px] px-1.5">{activeFilterCount}</span>
          )}
        </Button>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-3.5 w-3.5" /> נקה
          </Button>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="border border-border rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/30">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">סדרה</label>
            <select
              value={filterSeries}
              onChange={(e) => setFilterSeries(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">הכל</option>
              {seriesList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">סטטוס</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">הכל</option>
              <option value="pending">ממתין</option>
              <option value="approved">מאושר</option>
              <option value="used">שודר</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">שימוש בתוכנית</label>
            <select
              value={filterUsed}
              onChange={(e) => setFilterUsed(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">הכל</option>
              <option value="future">תאריך שידור עתידי</option>
              <option value="past">שודר (תאריך שידור עבר)</option>
              <option value="unscheduled">ללא תאריך שידור</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">תאריך הקלטה מ–</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-sm" dir="ltr" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">תאריך הקלטה עד</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-sm" dir="ltr" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">משך מינימום (דקות)</label>
            <Input type="number" value={durMin} onChange={(e) => setDurMin(e.target.value)} className="h-8 text-sm" placeholder="0" dir="ltr" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">משך מקסימום (דקות)</label>
            <Input type="number" value={durMax} onChange={(e) => setDurMax(e.target.value)} className="h-8 text-sm" placeholder="∞" dir="ltr" />
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg text-sm">
          <span className="font-medium">{selected.size} נבחרו</span>
          <div className="flex items-center gap-1.5">
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="h-7 rounded border border-input bg-background px-2 text-xs"
            >
              <option value="pending">ממתין</option>
              <option value="approved">מאושר</option>
              <option value="used">שודר</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => { onBulkStatusChange(Array.from(selected), bulkStatus); setSelected(new Set()); }}
            >
              שנה סטטוס
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={bulkSeriesId}
              onChange={(e) => setBulkSeriesId(e.target.value)}
              className="h-7 rounded border border-input bg-background px-2 text-xs"
            >
              <option value="">— בחר סדרה —</option>
              {seriesList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="__none__">הסר מסדרה</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!bulkSeriesId}
              onClick={() => {
                onBulkAssignSeries(Array.from(selected), bulkSeriesId === "__none__" ? null : bulkSeriesId);
                setSelected(new Set());
                setBulkSeriesId("");
              }}
            >
              שייך לסדרה
            </Button>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => { onBulkDelete(Array.from(selected)); setSelected(new Set()); }}
          >
            <Trash2 className="me-1.5 h-3.5 w-3.5" />
            מחק נבחרים
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>ביטול</Button>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-2 text-start font-medium">כותרת / מקור</th>
              <th className="px-4 py-2 text-start font-medium cursor-pointer hover:bg-muted-foreground/10 select-none" onClick={() => toggleSort("series")}>
                סדרה {sortKey === "series" && (sortDesc ? "↓" : "↑")}
              </th>
              <th className="px-4 py-2 text-start font-medium">קישורים</th>
              <th className="px-4 py-2 text-start font-medium">קריין</th>
              <th className="px-4 py-2 text-start font-medium cursor-pointer hover:bg-muted-foreground/10 select-none" onClick={() => toggleSort("recordingDate")}>
                הקלטה {sortKey === "recordingDate" && (sortDesc ? "↓" : "↑")}
              </th>
              <th className="px-4 py-2 text-start font-medium cursor-pointer hover:bg-muted-foreground/10 select-none" onClick={() => toggleSort("broadcastDate")}>
                שידור {sortKey === "broadcastDate" && (sortDesc ? "↓" : "↑")}
              </th>
              <th className="px-4 py-2 text-start font-medium cursor-pointer hover:bg-muted-foreground/10 select-none" onClick={() => toggleSort("duration")}>
                משך {sortKey === "duration" && (sortDesc ? "↓" : "↑")}
              </th>
              <th className="px-4 py-2 text-start font-medium cursor-pointer hover:bg-muted-foreground/10 select-none" onClick={() => toggleSort("status")}>
                סטטוס {sortKey === "status" && (sortDesc ? "↓" : "↑")}
              </th>
              <th className="px-4 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">אין שיעורים</td>
              </tr>
            )}
            {filtered.map((l) => (
              <tr
                key={l.id}
                className={`border-t border-border transition-colors ${selected.has(l.id) ? "bg-primary/5" : "hover:bg-accent/30"}`}
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(l.id)}
                    onChange={() => toggleOne(l.id)}
                    className="rounded"
                  />
                </td>
                <td className="px-4 py-3 max-w-xs truncate">
                  <Link href={`/library/${l.id}`} className="hover:underline">
                    {l.sourceRef ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {l.series ? (
                    <span
                      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border"
                      style={l.series.color ? { borderColor: l.series.color, color: l.series.color } : undefined}
                    >
                      {l.series.name}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {l.kmPageLink && (
                      <a href={l.kmPageLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title="וידאו בכבלה מדיה">
                        <Video className="h-4 w-4" />
                      </a>
                    )}
                    {l.articleSourceLink && (
                      <a href={l.articleSourceLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title="מקור">
                        <BookOpen className="h-4 w-4" />
                      </a>
                    )}
                    {l.articleSource?.bookPage && (() => {
                      const { bookSeries, bookVolume, bookPage } = l.articleSource!;
                      const HEB_VOLS = ["", "א׳", "ב׳", "ג׳"];
                      let volLabel = "";
                      let title = "";
                      if (bookSeries === "rabash") {
                        volLabel = HEB_VOLS[bookVolume ?? 0] ?? "";
                        title = `עמוד בכתבי רב״ש${volLabel ? " כרך " + volLabel : ""}`;
                      } else if (bookSeries === "zohar-laam") {
                        volLabel = bookVolume ? `כרך ${bookVolume}` : "";
                        title = `עמוד בזוהר לעם${volLabel ? " " + volLabel : ""}`;
                      } else if (bookSeries === "tes") {
                        volLabel = bookVolume ? `כרך ${bookVolume}` : "";
                        title = `עמוד בתלמוד עשר הספירות${volLabel ? " " + volLabel : ""}`;
                      } else {
                        volLabel = bookVolume ? `${bookVolume}` : "";
                        title = "עמוד";
                      }
                      return (
                        <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1" title={title}>
                          {volLabel ? volLabel + " " : ""}{bookPage}
                        </span>
                      );
                    })()}
                    {l.transcriptionLink && (
                      <a href={l.transcriptionLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title="תמלול">
                        <FileText className="h-4 w-4" />
                      </a>
                    )}
                    {!l.kmPageLink && !l.articleSourceLink && !l.transcriptionLink && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">{l.narratorName ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{l.recordingDate ? formatDate(l.recordingDate) : "—"}</td>
                <td className="px-4 py-3 tabular-nums">{l.broadcastDate ? formatDate(l.broadcastDate) : "—"}</td>
                <td className="px-4 py-3 tabular-nums">
                  <div className="flex flex-col gap-0.5">
                    {l.videoDurationSec ? (
                      <span className="flex items-center gap-1 text-xs"><Video className="h-3 w-3 text-muted-foreground" />{formatDurationSec(l.videoDurationSec)}</span>
                    ) : null}
                    {l.articleReadingSec ? (
                      <span className="flex items-center gap-1 text-xs"><BookOpen className="h-3 w-3 text-muted-foreground" />{formatDurationSec(l.articleReadingSec)}</span>
                    ) : null}
                    {!l.videoDurationSec && !l.articleReadingSec && "—"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge status={l.approvalStatus} />
                    {currentSet.has(l.id) && <StatusBadge status="scheduled" />}
                    {pastSet.has(l.id) && l.approvalStatus !== "used" && !currentSet.has(l.id) && (
                      <StatusBadge status="broadcast" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Link href={`/library/${l.id}`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(l.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} שיעורים</p>
    </div>
  );
}
