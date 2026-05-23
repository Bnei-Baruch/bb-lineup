"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LessonPicker } from "./LessonPicker";
import { SourceSearch } from "@/components/library/SourceSearch";
import { SlotWithLesson, SlotType, SLOT_TYPE_LABELS, TRANSITION_LABELS, TransitionType, LessonSummary } from "@/types";
import { Loader2 } from "lucide-react";
import { formatDurationSec, parseDurationToSec } from "@/lib/time";

interface SlotEditorProps {
  slot: Partial<SlotWithLesson> & { dayId: string; slotType: SlotType };
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<SlotWithLesson>) => Promise<void>;
}

export function SlotEditor({ slot, open, onClose, onSave }: SlotEditorProps) {
  const [form, setForm] = useState(initForm(slot));
  const [lesson, setLesson] = useState<LessonSummary | null>(slot.lesson ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wordCount, setWordCount] = useState("");

  useEffect(() => {
    if (open) {
      setForm(initForm(slot));
      setLesson(slot.lesson ?? null);
    }
  }, [open, slot]);

  function initForm(s: Partial<SlotWithLesson>) {
    return {
      label: s.label ?? "",
      durationMin: s.durationSec ? formatDurationSec(s.durationSec) : "",
      notes: s.notes ?? "",
      narratorScript: s.narratorScript ?? "",
      transitionType: s.transitionType ?? "",
      studyMaterialLink: s.studyMaterialLink ?? "",
      studyMaterialSourceRef: s.studyMaterialSourceRef ?? "",
      lineupLink: s.lineupLink ?? "",
      mediaCode: s.mediaCode ?? "",
      recordedLessonLink: s.recordedLessonLink ?? "",
      startTimecode: s.startTimecode ?? "",
      endTimecode: s.endTimecode ?? "",
      openingWords: s.openingWords ?? "",
      closingWords: s.closingWords ?? "",
      hasSubtitles: s.hasSubtitles ?? false,
      hasWorkshopQuestions: s.hasWorkshopQuestions ?? false,
      language: s.language ?? "",
      chevrutaPartners: s.chevrutaPartners ? JSON.parse(s.chevrutaPartners).join(", ") : "",
      groupLeader: s.groupLeader ?? "",
      contactPerson: s.contactPerson ?? "",
      holidayTag: s.holidayTag ?? "",
      partNumber: String(s.partNumber ?? ""),
      lessonId: s.lessonId ?? null,
    };
  }

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        label: form.label || null,
        durationSec: (() => { const s = parseDurationToSec(form.durationMin); return s != null ? s : (parseInt(form.durationMin) * 60 || null); })(),
        notes: form.notes || null,
        narratorScript: form.narratorScript || null,
        transitionType: form.transitionType || null,
        studyMaterialLink: form.studyMaterialLink || null,
        studyMaterialSourceRef: form.studyMaterialSourceRef || null,
        lineupLink: form.lineupLink || null,
        mediaCode: form.mediaCode || null,
        recordedLessonLink: form.recordedLessonLink || null,
        startTimecode: form.startTimecode || null,
        endTimecode: form.endTimecode || null,
        openingWords: form.openingWords || null,
        closingWords: form.closingWords || null,
        hasSubtitles: form.hasSubtitles,
        hasWorkshopQuestions: form.hasWorkshopQuestions,
        language: form.language || null,
        lessonId: form.lessonId ?? null,
        chevrutaPartners: form.chevrutaPartners
          ? JSON.stringify(form.chevrutaPartners.split(",").map((s: string) => s.trim()).filter(Boolean))
          : null,
        groupLeader: form.groupLeader || null,
        contactPerson: form.contactPerson || null,
        holidayTag: form.holidayTag || null,
        partNumber: form.partNumber ? parseInt(form.partNumber) : null,
      };
      await onSave(data as Partial<SlotWithLesson>);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const t = slot.slotType;
  const typeLabel = SLOT_TYPE_LABELS[t] ?? t;

  const hasNarrator = ["narrator_announcement", "narrator_read", "lesson_preparation"].includes(t);
  const hasRecording = ["recorded_lesson", "conversations_on_way"].includes(t);
  const hasTimecodes = hasRecording;
  const hasMedia = ["acapella", "song", "slide_melodies"].includes(t);
  const hasTransition = t === "transition";
  const hasGroup = ["chevruta", "group_study"].includes(t);
  const hasPartNumber = t === "part_header";
  const hasDuration = !hasRecording && t !== "part_header";
  const isLiveContent = ["building_spiritual_society", "study_between_friends", "management"].includes(t);
  const isArticle = t === "article_reading";

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{typeLabel}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Label override */}
            <Field label="כותרת מותאמת">
              <Input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder={typeLabel} />
            </Field>

            {/* Part number */}
            {hasPartNumber && (
              <Field label="מספר חלק">
                <Input type="number" value={form.partNumber} onChange={(e) => set("partNumber", e.target.value)} dir="ltr" className="w-24" />
              </Field>
            )}

            {/* Content / narrator script — shown for all types */}
            <Field label={hasNarrator ? "תוכן / טקסט קריין" : "תוכן"}>
              <Textarea rows={3} value={form.narratorScript} onChange={(e) => set("narratorScript", e.target.value)} />
            </Field>

            {/* Transition type */}
            {hasTransition && (
              <Field label="סוג מעברון">
                <select
                  value={form.transitionType}
                  onChange={(e) => set("transitionType", e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">בחר סוג</option>
                  {(Object.keys(TRANSITION_LABELS) as TransitionType[]).map((k) => (
                    <option key={k} value={k}>{TRANSITION_LABELS[k]}</option>
                  ))}
                </select>
              </Field>
            )}

            {/* Recorded lesson picker */}
            {hasRecording && (
              <Field label="שיעור מהספרייה">
                {lesson ? (
                  <div className="border border-border rounded-md p-3 space-y-1">
                    <p className="text-sm font-medium">{lesson.sourceRef ?? "—"}</p>
                    {lesson.recordingDate && (
                      <p className="text-xs text-muted-foreground tabular-nums">{lesson.recordingDate.slice(0, 10)}</p>
                    )}
                    {lesson.articleSourceRef && (
                      <p className="text-xs text-blue-600">{lesson.articleSourceRef}</p>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>החלף שיעור</Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => setPickerOpen(true)}>בחר שיעור מהספרייה</Button>
                )}
              </Field>
            )}

            {/* Timecodes */}
            {hasTimecodes && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="החל מדקה">
                  <Input value={form.startTimecode} onChange={(e) => set("startTimecode", e.target.value)} placeholder="00:00:00" dir="ltr" />
                </Field>
                <Field label="עד דקה">
                  <Input value={form.endTimecode} onChange={(e) => set("endTimecode", e.target.value)} placeholder="00:32:49" dir="ltr" />
                </Field>
                <Field label="דבר המתחיל">
                  <Textarea rows={2} value={form.openingWords} onChange={(e) => set("openingWords", e.target.value)} />
                </Field>
                <Field label="דברי סיום">
                  <Textarea rows={2} value={form.closingWords} onChange={(e) => set("closingWords", e.target.value)} />
                </Field>
              </div>
            )}

            {/* Recording link */}
            {hasRecording && (
              <Field label="קישור לשיעור מוקלט">
                <Input value={form.recordedLessonLink} onChange={(e) => set("recordedLessonLink", e.target.value)} dir="ltr" />
              </Field>
            )}

            {/* Media code */}
            {hasMedia && (
              <Field label="קוד מדיה / ניתוב">
                <Input value={form.mediaCode} onChange={(e) => set("mediaCode", e.target.value)} dir="ltr" placeholder="404_Acapella_Kave el ha shem" />
              </Field>
            )}

            {/* Duration */}
            {hasDuration && (
              <Field label="משך (HH:MM:SS)">
                <Input value={form.durationMin} onChange={(e) => set("durationMin", e.target.value)} placeholder="00:03:00" dir="ltr" className="w-32" />
              </Field>
            )}

            {/* Article reading: source search + word count */}
            {isArticle && (
              <>
                <Field label="מקור (חיפוש בכבלה מדיה)">
                  {form.studyMaterialSourceRef ? (
                    <div className="space-y-1.5 w-full min-w-0">
                      <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 w-full min-w-0 overflow-hidden">
                        <span className="text-xs truncate flex-1 min-w-0" title={form.studyMaterialSourceRef}>{form.studyMaterialSourceRef}</span>
                        <button type="button" className="text-muted-foreground hover:text-foreground shrink-0 text-xs" onClick={() => { set("studyMaterialSourceRef", ""); set("studyMaterialLink", ""); setWordCount(""); set("durationMin", ""); }}>✕</button>
                      </div>
                      <Input value={form.studyMaterialLink} onChange={(e) => set("studyMaterialLink", e.target.value)} dir="ltr" className="text-xs h-7 w-full" placeholder="https://..." />
                    </div>
                  ) : (
                    <SourceSearch
                      onSelect={async (s) => {
                        set("label", s.title.split("|").pop()?.trim() ?? s.title);
                        set("studyMaterialSourceRef", s.title);
                        set("studyMaterialLink", s.url);
                        try {
                          const r = await fetch(`/api/km/source-wordcount?source_id=${encodeURIComponent(s.id)}`);
                          const data = await r.json();
                          if (data.wordCount) {
                            setWordCount(String(data.wordCount));
                            set("durationMin", formatDurationSec(data.durationSec));
                          }
                        } catch { /* silent */ }
                      }}
                    />
                  )}
                </Field>
                <Field label="מספר מילים">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={wordCount}
                      onChange={(e) => {
                        setWordCount(e.target.value);
                        const wc = parseInt(e.target.value) || 0;
                        if (wc > 0) set("durationMin", formatDurationSec(Math.round(wc / 80 * 60)));
                      }}
                      dir="ltr"
                      className="w-28"
                      placeholder="1500"
                    />
                    <span className="text-xs text-muted-foreground">מילים (80 מילה/דקה)</span>
                  </div>
                </Field>
              </>
            )}

            {/* Study material link (simple URL for non-article types) */}
            {["recorded_lesson", "zohar_for_people", "conversations_on_way", "lesson_preparation"].includes(t) && (
              <Field label="קישור חומר לימוד">
                <Input value={form.studyMaterialLink} onChange={(e) => set("studyMaterialLink", e.target.value)} dir="ltr" />
              </Field>
            )}

            {/* Live content fields */}
            {isLiveContent && (
              <>
                <Field label="מנחים">
                  <Input value={form.groupLeader} onChange={(e) => set("groupLeader", e.target.value)} placeholder="שם המנחה / המנחים" />
                </Field>

                <Field label="חומר לימוד — חיפוש מקור בכבלה מדיה">
                  <SourceSearch
                    onSelect={(s) => {
                      set("studyMaterialSourceRef", s.title);
                      set("studyMaterialLink", s.url);
                    }}
                  />
                  {form.studyMaterialSourceRef && (
                    <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 mt-1 overflow-hidden w-full">
                      <span className="text-xs truncate flex-1 w-0" title={form.studyMaterialSourceRef}>{form.studyMaterialSourceRef}</span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground shrink-0 text-xs leading-none"
                        onClick={() => { set("studyMaterialSourceRef", ""); set("studyMaterialLink", ""); }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  <Input value={form.studyMaterialLink} onChange={(e) => set("studyMaterialLink", e.target.value)} dir="ltr" className="text-xs h-7 mt-1" placeholder="https://..." />
                </Field>

                <Field label="לינק ללינאפ">
                  <Input value={form.lineupLink} onChange={(e) => set("lineupLink", e.target.value)} dir="ltr" placeholder="https://..." />
                </Field>
              </>
            )}

            {/* Group leader / partners */}
            {hasGroup && (
              <>
                <Field label="מוביל / מנחה">
                  <Input value={form.groupLeader} onChange={(e) => set("groupLeader", e.target.value)} placeholder="אורן וגלעד" />
                </Field>
                <Field label="איש קשר">
                  <Input value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} />
                </Field>
                {t === "chevruta" && (
                  <Field label="חברותא (מופרד בפסיק)">
                    <Input value={form.chevrutaPartners} onChange={(e) => set("chevrutaPartners", e.target.value)} placeholder="ישראל, משה" />
                  </Field>
                )}
              </>
            )}

            {/* Flags */}
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.hasSubtitles} onChange={(e) => set("hasSubtitles", e.target.checked)} className="rounded" />
                כתוביות
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.hasWorkshopQuestions} onChange={(e) => set("hasWorkshopQuestions", e.target.checked)} className="rounded" />
                שאלות סדנה
              </label>
            </div>

            {/* Notes */}
            <Field label="הערות">
              <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LessonPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(l) => {
          setLesson(l);
          setForm((f) => ({
            ...f,
            lessonId: l.id,
            label: f.label || l.sourceRef || "",
            recordedLessonLink: f.recordedLessonLink || l.kmPageLink || "",
            studyMaterialLink: f.studyMaterialLink || l.articleSourceLink || "",
            startTimecode: f.startTimecode || "00:00:00",
            endTimecode: f.endTimecode || (l.videoDurationSec ? formatDurationSec(l.videoDurationSec) : ""),
          }));
        }}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
