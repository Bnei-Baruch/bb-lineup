"use client";

import React from "react";
import { DayWithSlots, SlotWithLesson, SLOT_TYPE_LABELS, TRANSITION_LABELS, SlotType, TransitionType, LESSON_SLOT_TYPES } from "@/types";
import { addSecondsToTime, timecodeDuration } from "@/lib/timecodes";
import { formatDurationSec } from "@/lib/time";
import { Check } from "lucide-react";

interface DayViewProps {
  day: DayWithSlots;
  dayLabel: string;
  contentCutoffIndex?: number | null;
}

function slotEffectiveDuration(slot: SlotWithLesson): number {
  if (LESSON_SLOT_TYPES.includes(slot.slotType) && slot.lesson) {
    if (slot.startTimecode && slot.endTimecode) {
      const toSec = (tc: string) => { const p = tc.split(":").map(Number); return (p[0] ?? 0) * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0); };
      const dur = toSec(slot.endTimecode) - toSec(slot.startTimecode);
      if (dur > 0) return dur;
    }
    return slot.lesson.videoDurationSec ?? 0;
  }
  return slot.durationSec ?? 0;
}

function itemLabel(slot: SlotWithLesson): string {
  if (slot.slotType === "transition" && slot.transitionType) {
    return `מעברון ${TRANSITION_LABELS[slot.transitionType as TransitionType] ?? slot.transitionType}`;
  }
  if (slot.slotType === "part_header") {
    return `חלק ${slot.partNumber ?? "—"} / Part ${slot.partNumber ?? "—"}`;
  }
  if (slot.slotType === "article_reading") {
    return SLOT_TYPE_LABELS["article_reading"] || "קריאת מאמר";
  }
  return slot.label || slot.component?.name || SLOT_TYPE_LABELS[slot.slotType as SlotType] || slot.slotType;
}

function sourceSubline(vol: number | null | undefined, page: number | null | undefined): string {
  const parts = [vol ? `כרך ${vol}` : null, page ? `עמוד ${page}` : null].filter(Boolean);
  return parts.join(" · ");
}

function contentText(slot: SlotWithLesson): { main: string; sub: string } {
  if (slot.slotType === "article_reading") {
    const ref = slot.studyMaterialSourceRef || "";
    const parts = ref.split(" | ");
    const leaf = parts.length > 1 ? parts[parts.length - 1] : ref;
    const parent = parts.length > 1 ? parts.slice(0, -1).join(" | ") : "";
    const src = slot.studyMaterialSource;
    const extra = sourceSubline(src?.bookVolume, src?.bookPage);
    return { main: leaf || slot.label || "", sub: [parent, extra].filter(Boolean).join(" · ") };
  }
  if (slot.narratorScript) return { main: slot.narratorScript, sub: "" };
  if (slot.lesson?.sourceRef) {
    const src = slot.studyMaterialSource;
    return { main: slot.lesson.sourceRef, sub: sourceSubline(src?.bookVolume, src?.bookPage) };
  }
  if (slot.mediaCode) return { main: slot.mediaCode, sub: "" };
  if (slot.groupLeader) return { main: slot.groupLeader, sub: "" };
  return { main: "", sub: "" };
}

const SLOT_ROW_COLORS: Partial<Record<string, string>> = {
  recorded_lesson: "border-s-purple-400 bg-purple-50/40",
  article_reading: "border-s-green-400 bg-green-50/40",
  transition:      "border-s-gray-300 bg-gray-50/60",
  part_header:     "border-s-yellow-400 bg-yellow-50",
  narrator:        "border-s-blue-300 bg-blue-50/40",
  workshop:        "border-s-orange-400 bg-orange-50/40",
  live_content:    "border-s-teal-400 bg-teal-50/40",
  song:            "border-s-pink-400 bg-pink-50/40",
  acapella:        "border-s-pink-300 bg-pink-50/30",
};

function Link({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
    >
      {label}
    </a>
  );
}

function timeToSec(hhmm: string): number {
  const parts = hhmm.split(":").map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

export function DayView({ day, dayLabel, contentCutoffIndex }: DayViewProps) {
  const startTime = day.broadcastStartTime ?? "03:00";
  let runningTime = startTime;
  let totalSeconds = 0;

  const clampedCutoff = contentCutoffIndex != null
    ? Math.min(contentCutoffIndex, day.slots.length)
    : null;

  let cutoffTotalSec = 0;
  let cutoffClockTime: string | null = null;

  const rows = day.slots.map((slot, i) => {
    const clockTime = runningTime;
    const dur = slotEffectiveDuration(slot);
    if (clampedCutoff !== null && i < clampedCutoff) cutoffTotalSec += dur;
    if (clampedCutoff !== null && i === clampedCutoff) cutoffClockTime = clockTime;
    totalSeconds += dur;
    runningTime = addSecondsToTime(runningTime, dur);
    const recordedTime = slot.startTimecode && slot.endTimecode
      ? timecodeDuration(slot.startTimecode, slot.endTimecode)
      : null;
    return { slot, clockTime, endTime: runningTime, recordedTime };
  });

  // If cutoff is at end, cutoffClockTime = final runningTime before reset
  if (clampedCutoff === rows.length) {
    cutoffClockTime = runningTime;
    cutoffTotalSec = totalSeconds;
  }

  const broadcastWindowSec = day.broadcastEndTime && day.broadcastStartTime
    ? (() => {
        let diff = timeToSec(day.broadcastEndTime) - timeToSec(day.broadcastStartTime);
        if (diff < 0) diff += 24 * 3600;
        return diff;
      })()
    : null;
  const cutoffDiff = broadcastWindowSec !== null ? cutoffTotalSec - broadcastWindowSec : null;

  const COLS = [
    { key: "time",      label: "שעות",        cls: "w-[72px] sticky end-0 z-10 bg-inherit" },
    { key: "item",      label: "אייטם",        cls: "w-28" },
    { key: "content",   label: "תוכן",         cls: "min-w-[180px] max-w-[240px]" },
    { key: "notes",     label: "הערות",        cls: "min-w-[120px] max-w-[200px]" },
    { key: "material",  label: "חומר לימוד",   cls: "w-24" },
    { key: "recorded",  label: "שיעור מוקלט",  cls: "w-20" },
    { key: "startTc",   label: "החל מדקה",     cls: "w-[76px]" },
    { key: "opening",   label: "דבר המתחיל",   cls: "min-w-[140px] max-w-[200px]" },
    { key: "endTc",     label: "עד דקה",       cls: "w-[76px]" },
    { key: "closing",   label: "דברי סיום",    cls: "min-w-[140px] max-w-[200px]" },
    { key: "recTime",   label: "משך",          cls: "w-[72px]" },
    { key: "endTime",   label: "שעת סיום",     cls: "w-[72px]" },
    { key: "subs",      label: "כתוביות",      cls: "w-16 text-center" },
    { key: "workshop",  label: "סדנה",         cls: "w-14 text-center" },
    { key: "lang",      label: "שפה",          cls: "w-14" },
    { key: "songs",     label: "שירים",        cls: "w-24" },
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">{dayLabel}</h2>
      <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
        <table className="w-full text-xs whitespace-nowrap border-separate border-spacing-0">
          <thead>
            <tr className="bg-muted/80">
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={`px-2 py-2 text-start font-semibold text-muted-foreground border-b border-border sticky top-0 bg-muted/80 backdrop-blur-sm z-20 ${c.cls}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ slot, clockTime, endTime, recordedTime }, i) => {
              const cutoffRow = clampedCutoff === i ? (
                <tr key="cutoff-line">
                  <td colSpan={COLS.length} className="px-0 py-0">
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-orange-50">
                      <div className="flex-1 border-t-2 border-dashed border-orange-400" />
                      <span className="text-xs font-semibold text-orange-500 whitespace-nowrap shrink-0">סוף תוכן</span>
                      <div className="flex-1 border-t-2 border-dashed border-orange-400" />
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 bg-orange-50 border-t border-orange-100 text-xs tabular-nums">
                      <span className="text-orange-600 font-medium">סה״כ עד כאן</span>
                      <div className="flex items-center gap-4 font-semibold">
                        {cutoffClockTime && <span className="text-foreground">{cutoffClockTime}</span>}
                        <span className="text-foreground">{formatDurationSec(cutoffTotalSec)}</span>
                        {cutoffDiff !== null && cutoffDiff > 0 && (
                          <span className="text-red-500">+{formatDurationSec(cutoffDiff)} חריגה</span>
                        )}
                        {cutoffDiff !== null && cutoffDiff < 0 && (
                          <span className="text-green-600">{formatDurationSec(-cutoffDiff)} נותר</span>
                        )}
                        {cutoffDiff === 0 && (
                          <span className="text-green-600">בדיוק!</span>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null;

              if (slot.slotType === "part_header") {
                return (
                  <React.Fragment key={slot.id}>
                    {cutoffRow}
                    <tr className="bg-yellow-100 border-t-2 border-yellow-400">
                      <td colSpan={COLS.length} className="px-3 py-2 font-bold text-sm text-yellow-900 tracking-wide">
                        חלק {slot.partNumber ?? "—"} / Part {slot.partNumber ?? "—"}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              }

              const isBelowCutoff = clampedCutoff !== null && i >= clampedCutoff;
              const rowColor = SLOT_ROW_COLORS[slot.slotType] ?? "border-s-border";
              const altBg = i % 2 !== 0 ? "bg-muted/20" : "";

              return (
                <React.Fragment key={slot.id}>
                  {cutoffRow}
                  <tr
                    className={`border-t border-border border-s-2 hover:bg-accent/30 transition-colors ${rowColor} ${altBg} ${isBelowCutoff ? "opacity-40" : ""}`}
                  >
                  {/* שעות — sticky */}
                  <td className={`px-2 py-2 tabular-nums font-semibold text-foreground sticky end-0 z-10 ${altBg || "bg-background"} border-s border-border/50`}>
                    {clockTime}
                  </td>
                  {/* אייטם */}
                  <td className="px-2 py-2 font-medium">{itemLabel(slot)}</td>
                  {/* תוכן */}
                  <td className="px-2 py-2 whitespace-pre-wrap leading-snug">
                    {(() => { const { main, sub } = contentText(slot); return (<><span className="block">{main}</span>{sub && <span className="block text-[10px] text-muted-foreground mt-0.5">{sub}</span>}</>); })()}
                    {slot.lesson?.recordingDate && (
                      <span className="block text-[10px] text-muted-foreground tabular-nums mt-0.5">
                        {slot.lesson.recordingDate.slice(0, 10)}
                      </span>
                    )}
                    {slot.lineupLink && (
                      <a
                        href={slot.lineupLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-blue-600 hover:underline mt-1 truncate max-w-[220px]"
                      >
                        🔗 פתח קישור
                      </a>
                    )}
                  </td>
                  {/* הערות */}
                  <td className="px-2 py-2 whitespace-pre-wrap leading-snug text-muted-foreground">
                    {slot.notes ?? ""}
                  </td>
                  {/* חומר לימוד */}
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      {(slot.studyMaterialLink || slot.lesson?.articleSourceLink) && (
                        <Link href={slot.studyMaterialLink ?? slot.lesson?.articleSourceLink ?? ""} label="מאמר" />
                      )}
                    </div>
                  </td>
                  {/* שיעור מוקלט */}
                  <td className="px-2 py-2">
                    {(slot.recordedLessonLink || slot.lesson?.kmPageLink) && (
                      <Link href={slot.recordedLessonLink ?? slot.lesson?.kmPageLink ?? ""} label="לינק" />
                    )}
                  </td>
                  {/* החל מדקה */}
                  <td className="px-2 py-2 tabular-nums text-muted-foreground">
                    {LESSON_SLOT_TYPES.includes(slot.slotType as SlotType)
                      ? (slot.startTimecode || "00:00:00")
                      : (slot.startTimecode ?? "")}
                  </td>
                  {/* דבר המתחיל */}
                  <td className="px-2 py-2 whitespace-pre-wrap leading-snug text-muted-foreground">
                    {slot.openingWords ?? ""}
                  </td>
                  {/* עד דקה */}
                  <td className="px-2 py-2 tabular-nums text-muted-foreground">
                    {LESSON_SLOT_TYPES.includes(slot.slotType as SlotType)
                      ? (slot.endTimecode || (slot.lesson?.videoDurationSec ? formatDurationSec(slot.lesson.videoDurationSec) : ""))
                      : (slot.endTimecode ?? "")}
                  </td>
                  {/* דברי סיום */}
                  <td className="px-2 py-2 whitespace-pre-wrap leading-snug text-muted-foreground">
                    {slot.closingWords ?? ""}
                  </td>
                  {/* משך */}
                  <td className="px-2 py-2 tabular-nums font-medium">
                    {recordedTime ?? (slotEffectiveDuration(slot) > 0 ? formatDurationSec(slotEffectiveDuration(slot)) : "")}
                  </td>
                  {/* שעת סיום */}
                  <td className="px-2 py-2 tabular-nums text-muted-foreground">{endTime}</td>
                  {/* כתוביות */}
                  <td className="px-2 py-2 text-center">
                    {slot.hasSubtitles && <Check className="h-3.5 w-3.5 text-green-600 mx-auto" />}
                  </td>
                  {/* סדנה */}
                  <td className="px-2 py-2 text-center">
                    {slot.hasWorkshopQuestions && <Check className="h-3.5 w-3.5 text-green-600 mx-auto" />}
                  </td>
                  {/* שפה */}
                  <td className="px-2 py-2 text-muted-foreground">{slot.language ?? ""}</td>
                  {/* שירים */}
                  <td className="px-2 py-2 text-muted-foreground">
                    {["song", "acapella"].includes(slot.slotType) ? slot.mediaCode ?? "" : ""}
                  </td>
                  </tr>
                </React.Fragment>
              );
            })}
            {/* cutoff line at end of list */}
            {clampedCutoff === rows.length && (
              <tr key="cutoff-line-end">
                <td colSpan={COLS.length} className="px-0 py-0">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-orange-50">
                    <div className="flex-1 border-t-2 border-dashed border-orange-400" />
                    <span className="text-xs font-semibold text-orange-500 whitespace-nowrap shrink-0">סוף תוכן</span>
                    <div className="flex-1 border-t-2 border-dashed border-orange-400" />
                  </div>
                  <div className="flex items-center justify-between px-3 py-1.5 bg-orange-50 border-t border-orange-100 text-xs tabular-nums">
                    <span className="text-orange-600 font-medium">סה״כ עד כאן</span>
                    <div className="flex items-center gap-4 font-semibold">
                      {cutoffClockTime && <span className="text-foreground">{cutoffClockTime}</span>}
                      <span className="text-foreground">{formatDurationSec(cutoffTotalSec)}</span>
                      {cutoffDiff !== null && cutoffDiff > 0 && (
                        <span className="text-red-500">+{formatDurationSec(cutoffDiff)} חריגה</span>
                      )}
                      {cutoffDiff !== null && cutoffDiff < 0 && (
                        <span className="text-green-600">{formatDurationSec(-cutoffDiff)} נותר</span>
                      )}
                      {cutoffDiff === 0 && (
                        <span className="text-green-600">בדיוק!</span>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          {/* Total footer */}
          {totalSeconds > 0 && (
            <tfoot>
              <tr className="bg-muted/60 border-t-2 border-border font-semibold">
                <td className="px-2 py-2 tabular-nums">{runningTime}</td>
                <td colSpan={9} className="px-2 py-2 text-muted-foreground text-[11px]">סה״כ</td>
                <td className="px-2 py-2 tabular-nums">{formatDurationSec(totalSeconds)}</td>
                <td colSpan={COLS.length - 11} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
