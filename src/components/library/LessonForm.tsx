"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SourceSearch } from "./SourceSearch";
import { Loader2, Link as LinkIcon, BookOpen, RefreshCw } from "lucide-react";
import { formatDurationSec, parseDurationToSec } from "@/lib/time";


interface SeriesOption {
  id: string;
  name: string;
}

interface LessonFormProps {
  lesson?: Record<string, unknown>;
  seriesList?: SeriesOption[];
}

export function LessonForm({ lesson, seriesList = [] }: LessonFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kmLoading, setKmLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [articleReadingSec, setArticleReadingSec] = useState<number | null>((lesson?.articleReadingSec as number | null) ?? null);
  const [articleWordCount, setArticleWordCount] = useState<number | null>((lesson?.articleWordCount as number | null) ?? null);
  const [recalcLoading, setRecalcLoading] = useState(false);

  const articleSource = lesson?.articleSource as Record<string, unknown> | null | undefined;

  const [form, setForm] = useState({
    approvalStatus: (lesson?.approvalStatus as string) ?? "pending",
    broadcastDate: lesson?.broadcastDate
      ? new Date(lesson.broadcastDate as string).toISOString().slice(0, 10)
      : "",
    kmPageLink: (lesson?.kmPageLink as string) ?? "",
    kmUid: (lesson?.kmUid as string) ?? "",
    sourceRef: (lesson?.sourceRef as string) ?? "",
    recordingDate: lesson?.recordingDate
      ? new Date(lesson.recordingDate as string).toISOString().slice(0, 10)
      : "",
    videoDuration: lesson?.videoDurationSec ? formatDurationSec(lesson.videoDurationSec as number) : "",
    videoLink: (lesson?.videoLink as string) ?? "",
    narratorName: (lesson?.narratorName as string) ?? "",
    transcriptionLink: (lesson?.transcriptionLink as string) ?? "",
    articleSourceRef: (lesson?.articleSourceRef as string) ?? "",
    articleSourceId: (lesson?.articleSourceId as string) ?? "",
    articleSourceLink: (lesson?.articleSourceLink as string) ?? "",
    bookSeries: (articleSource?.bookSeries as string) ?? "",
    bookVolume: articleSource?.bookVolume != null ? String(articleSource.bookVolume) : "",
    bookPage: articleSource?.bookPage != null ? String(articleSource.bookPage) : "",
    startTimecode: (lesson?.startTimecode as string) ?? "",
    endTimecode: (lesson?.endTimecode as string) ?? "",
    initialNotes: (lesson?.initialNotes as string) ?? "",
    openingStatement: (lesson?.openingStatement as string) ?? "",
    closingStatement: (lesson?.closingStatement as string) ?? "",
    tags: (lesson?.tags as string) ?? "",
    seriesId: (lesson?.seriesId as string) ?? "",
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleKmLinkBlur() {
    if (!form.kmPageLink.trim() || form.kmPageLink === (lesson?.kmPageLink as string)) return;
    setKmLoading(true);
    try {
      const res = await fetch(`/api/km/unit?url=${encodeURIComponent(form.kmPageLink)}`);
      if (!res.ok) return;
      const data = await res.json();
      const sourceId: string | null = data.articleSourceId ?? null;
      let bookSeries: string | null = null;
      let bookVolume: number | null = null;
      let bookPage: number | null = null;
      if (sourceId) {
        const srcRes = await fetch(`/api/article-sources?id=${encodeURIComponent(sourceId)}`);
        if (srcRes.ok) {
          const srcData = await srcRes.json();
          if (srcData.source) {
            bookSeries = srcData.source.bookSeries ?? null;
            bookVolume = srcData.source.bookVolume ?? null;
            bookPage = srcData.source.bookPage ?? null;
          }
        }
      }
      setForm((f) => ({
        ...f,
        kmUid: data.kmUid ?? f.kmUid,
        sourceRef: data.sourceRef ?? f.sourceRef,
        recordingDate: data.recordingDate ?? f.recordingDate,
        videoDuration: data.videoDurationSec != null ? formatDurationSec(data.videoDurationSec) : f.videoDuration,
        videoLink: data.videoLink ?? f.videoLink,
        narratorName: data.narratorName ?? f.narratorName,
        articleSourceId: sourceId ?? f.articleSourceId,
        articleSourceLink: data.articleSourceLink ?? f.articleSourceLink,
        articleSourceRef: data.articleSourceRef ?? f.articleSourceRef,
        transcriptionLink: data.transcriptionLink ?? f.transcriptionLink,
        bookSeries: bookSeries ?? f.bookSeries,
        bookVolume: bookVolume != null ? String(bookVolume) : f.bookVolume,
        bookPage: bookPage != null ? String(bookPage) : f.bookPage,
      }));
    } finally {
      setKmLoading(false);
    }
  }

  async function handleRecalcReading() {
    if (!lesson?.id) return;
    setRecalcLoading(true);
    try {
      const res = await fetch(`/api/lessons/recalc-reading?id=${lesson.id}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setArticleReadingSec(data.articleReadingSec);
        setArticleWordCount(data.articleWordCount);
      }
    } finally {
      setRecalcLoading(false);
    }
  }

  function handleSourceSelect(source: { id: string; title: string; url: string; bookSeries?: string | null; bookVolume?: number | null; bookPage?: number | null }) {
    setForm((f) => ({
      ...f,
      articleSourceRef: source.title,
      articleSourceId: source.id,
      articleSourceLink: source.url,
      bookSeries: source.bookSeries ?? f.bookSeries,
      bookVolume: source.bookVolume != null ? String(source.bookVolume) : f.bookVolume,
      bookPage: source.bookPage != null ? String(source.bookPage) : f.bookPage,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      approvalStatus: form.approvalStatus,
      broadcastDate: form.broadcastDate ? new Date(form.broadcastDate) : null,
      kmPageLink: form.kmPageLink || null,
      kmUid: form.kmUid || null,
      sourceRef: form.sourceRef || null,
      recordingDate: form.recordingDate ? new Date(form.recordingDate) : null,
      videoDurationSec: form.videoDuration ? parseDurationToSec(form.videoDuration) : null,
      videoLink: form.videoLink || null,
      narratorName: form.narratorName || null,
      startTimecode: form.startTimecode || null,
      endTimecode: form.endTimecode || null,
      transcriptionLink: form.transcriptionLink || null,
      articleSourceRef: form.articleSourceRef || null,
      articleSourceId: form.articleSourceId || null,
      articleSourceLink: form.articleSourceLink || null,
      articleBookVolume: form.bookVolume ? parseInt(form.bookVolume) : null,
      articleBookPage: form.bookPage ? parseInt(form.bookPage) : null,
      initialNotes: form.initialNotes || null,
      openingStatement: form.openingStatement || null,
      closingStatement: form.closingStatement || null,
      tags: form.tags || null,
      seriesId: form.seriesId || null,
    };

    setSubmitError(null);
    startTransition(async () => {
      const url = lesson ? `/api/lessons/${lesson.id}` : "/api/lessons";
      const method = lesson ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push("/library");
      } else {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error ?? "שגיאה בשמירה");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      {/* Status + Series */}
      <div className="flex gap-4">
        <div className="space-y-2">
          <Label>סטטוס</Label>
          <Select value={form.approvalStatus} onValueChange={(v) => v && set("approvalStatus", v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">ממתין</SelectItem>
              <SelectItem value="approved">מאושר</SelectItem>
              <SelectItem value="used">שודר</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {seriesList.length > 0 && (
          <div className="space-y-2">
            <Label>סדרה</Label>
            <select
              value={form.seriesId}
              onChange={(e) => set("seriesId", e.target.value)}
              className="flex h-8 w-48 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">ללא סדרה</option>
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Recording section */}
      <fieldset className="border border-border rounded-lg p-4 space-y-4">
        <legend className="px-2 text-sm font-semibold flex items-center gap-2">
          <LinkIcon className="h-4 w-4" /> פרטי הקלטה
        </legend>

        <div className="space-y-2">
          <Label>קישור קבלה מדיה</Label>
          <div className="relative">
            <Input
              value={form.kmPageLink}
              onChange={(e) => set("kmPageLink", e.target.value)}
              onBlur={handleKmLinkBlur}
              placeholder="https://kabbalahmedia.info/lessons/..."
              dir="ltr"
            />
            {kmLoading && (
              <Loader2 className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">הדבק קישור לשיעור — הפרטים יתמלאו אוטומטית</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>כותרת / מקור</Label>
            <Input value={form.sourceRef} onChange={(e) => set("sourceRef", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>תאריך הקלטה</Label>
            <Input type="date" value={form.recordingDate} onChange={(e) => set("recordingDate", e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>תאריך שידור</Label>
            <Input type="date" value={form.broadcastDate} onChange={(e) => set("broadcastDate", e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>משך (HH:MM:SS)</Label>
            <Input value={form.videoDuration} onChange={(e) => set("videoDuration", e.target.value)} placeholder="00:00:00" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>מספר / קריין</Label>
            <Input value={form.narratorName} onChange={(e) => set("narratorName", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>IN (HH:MM:SS)</Label>
            <Input value={form.startTimecode} onChange={(e) => set("startTimecode", e.target.value)} placeholder="00:00:00" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>OUT (HH:MM:SS)</Label>
            <Input value={form.endTimecode} onChange={(e) => set("endTimecode", e.target.value)} placeholder="00:00:00" dir="ltr" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>קישור וידאו</Label>
          <Input value={form.videoLink} onChange={(e) => set("videoLink", e.target.value)} dir="ltr" />
        </div>
        <div className="space-y-2">
          <Label>קישור תמליל</Label>
          <Input value={form.transcriptionLink} onChange={(e) => set("transcriptionLink", e.target.value)} dir="ltr" />
        </div>
      </fieldset>

      {/* Article reading section */}
      <fieldset className="border border-border rounded-lg p-4 space-y-4">
        <legend className="px-2 text-sm font-semibold flex items-center gap-2">
          <BookOpen className="h-4 w-4" /> קריאת מאמר
        </legend>

        <div className="space-y-2">
          <Label>חיפוש מקור</Label>
          <SourceSearch onSelect={handleSourceSelect} />
          {form.articleSourceRef && (
            <a
              href={form.articleSourceLink || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary font-medium hover:underline break-all"
            >
              {form.articleSourceRef}
            </a>
          )}
        </div>
        {form.articleSourceId && (
          <div className="flex items-end gap-3">
            {form.bookSeries === "rabash" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">כרך (כתבי רב״ש)</Label>
                <select
                  value={form.bookVolume}
                  onChange={(e) => set("bookVolume", e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  <option value="1">א׳</option>
                  <option value="2">ב׳</option>
                  <option value="3">ג׳</option>
                </select>
              </div>
            ) : form.bookSeries ? (
              <div className="space-y-1.5">
                <Label className="text-xs">כרך</Label>
                <Input type="number" min={1} value={form.bookVolume} onChange={(e) => set("bookVolume", e.target.value)} placeholder="—" dir="ltr" className="h-8 text-sm w-20" />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label className="text-xs">עמוד</Label>
              <Input type="number" min={1} value={form.bookPage} onChange={(e) => set("bookPage", e.target.value)} placeholder="—" dir="ltr" className="h-8 text-sm w-24" />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {articleReadingSec ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2 flex-1">
              <BookOpen className="h-4 w-4 shrink-0" />
              <span>זמן קריאה משוער: <strong className="text-foreground">{formatDurationSec(articleReadingSec)}</strong></span>
              {articleWordCount && <span className="text-xs">({articleWordCount} מילים)</span>}
            </div>
          ) : null}
          {(lesson?.id as string | undefined) && form.articleSourceLink && (
            <Button type="button" variant="outline" size="sm" onClick={handleRecalcReading} disabled={recalcLoading} className="gap-1.5">
              {recalcLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {articleReadingSec ? "חשב מחדש" : "חשב זמן קריאה"}
            </Button>
          )}
        </div>
      </fieldset>

      {/* Notes */}
      <fieldset className="border border-border rounded-lg p-4 space-y-4">
        <legend className="px-2 text-sm font-semibold">הערות</legend>
        <div className="space-y-2">
          <Label>הערות ראשוניות</Label>
          <Textarea rows={2} value={form.initialNotes} onChange={(e) => set("initialNotes", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>פתיחה</Label>
          <Textarea rows={2} value={form.openingStatement} onChange={(e) => set("openingStatement", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>סיום</Label>
          <Textarea rows={2} value={form.closingStatement} onChange={(e) => set("closingStatement", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>תגיות (מופרדות בפסיק)</Label>
          <Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="פסח, חנוכה" />
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          {lesson ? "שמור שינויים" : "הוסף שיעור"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/library")}>
          ביטול
        </Button>
        {submitError && <p className="text-sm text-destructive">{submitError}</p>}
      </div>
    </form>
  );
}
