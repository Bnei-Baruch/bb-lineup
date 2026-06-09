"use client";

import React, { useRef } from "react";
import { DayWithSlots, SlotWithLesson, SLOT_TYPE_LABELS, TRANSITION_LABELS, SlotType, TransitionType, LESSON_SLOT_TYPES } from "@/types";
import { addSecondsToTime, timecodeDuration } from "@/lib/timecodes";
import { formatDurationSec } from "@/lib/time";
import { Check } from "lucide-react";

interface DayViewProps {
  enDayLabel?: string;
  contentStartIndex?: number | null;
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
  recorded_lesson: "border-s-purple-400",
  article_reading: "border-s-green-400",
  transition:      "border-s-gray-300",
  narrator:        "border-s-blue-300",
  workshop:        "border-s-orange-400",
  live_content:    "border-s-teal-400",
  song:            "border-s-pink-400",
  acapella:        "border-s-pink-300",
};

function TableLink({ href, label }: { href: string; label: string }) {
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

const COLS = [
  { key: "time",     label: "שעות",       en: "Time",       cls: "sticky end-0 z-10 bg-inherit", minWidth: 72 },
  { key: "item",     label: "אייטם",       en: "Item",       cls: "",                             minWidth: 112 },
  { key: "content",  label: "תוכן",        en: "Content",    cls: "",                             minWidth: 180 },
  { key: "notes",    label: "הערות",       en: "Notes",      cls: "",                             minWidth: 120 },
  { key: "material", label: "חומר לימוד",  en: "Study Mat.", cls: "",                             minWidth: 96 },
  { key: "recorded", label: "שיעור מוקלט", en: "Recorded",   cls: "",                             minWidth: 80 },
  { key: "startTc",  label: "החל מדקה",    en: "From TC",    cls: "",                             minWidth: 76 },
  { key: "opening",  label: "דבר המתחיל",  en: "Opening",    cls: "",                             minWidth: 140 },
  { key: "endTc",    label: "עד דקה",      en: "To TC",      cls: "",                             minWidth: 76 },
  { key: "closing",  label: "דברי סיום",   en: "Closing",    cls: "",                             minWidth: 140 },
  { key: "recTime",  label: "משך",         en: "Duration",   cls: "",                             minWidth: 72 },
  { key: "endTime",  label: "שעת סיום",    en: "End Time",   cls: "",                             minWidth: 72 },
  { key: "subs",     label: "כתוביות",     en: "Subs",       cls: "text-center",                  minWidth: 64 },
  { key: "workshop", label: "סדנה",        en: "Workshop",   cls: "text-center",                  minWidth: 56 },
  { key: "lang",     label: "שפה",         en: "Lang",       cls: "",                             minWidth: 56 },
];

const TABLE_MIN_WIDTH = COLS.reduce((sum, c) => sum + c.minWidth, 0);
// table-layout:fixed only respects `width` on <col>, not minWidth.
// width:100% + minWidth on the table lets it fill the container but never shrink below 1412px.
const TABLE_STYLE: React.CSSProperties = { tableLayout: "fixed", width: "100%", minWidth: `${TABLE_MIN_WIDTH}px` };

const Colgroup = () => (
  <colgroup>
    {COLS.map(c => <col key={c.key} style={{ width: `${c.minWidth}px` }} />)}
  </colgroup>
);

export function DayView({ day, dayLabel, enDayLabel, contentStartIndex, contentCutoffIndex }: DayViewProps) {
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  function onBodyScroll() {
    if (headerScrollRef.current && bodyScrollRef.current) {
      headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
    }
  }

  const startTime = day.broadcastStartTime ?? "03:00";
  let runningTime = startTime;
  let totalSeconds = 0;

  const clampedStart = contentStartIndex != null
    ? Math.min(contentStartIndex, day.slots.length)
    : 0;
  const clampedCutoff = contentCutoffIndex != null
    ? Math.min(contentCutoffIndex, day.slots.length)
    : null;

  let cutoffTotalSec = 0;
  let cutoffClockTime: string | null = null;
  // Separate counter so part_header rows don't disturb the even/odd alternating pattern.
  let _altIdx = 0;

  const rows = day.slots.map((slot, i) => {
    const clockTime = runningTime;
    const dur = slotEffectiveDuration(slot);
    if (i >= clampedStart && (clampedCutoff === null || i < clampedCutoff)) cutoffTotalSec += dur;
    if (clampedCutoff !== null && i === clampedCutoff) cutoffClockTime = clockTime;
    totalSeconds += dur;
    runningTime = addSecondsToTime(runningTime, dur);
    const recordedTime = slot.startTimecode && slot.endTimecode
      ? timecodeDuration(slot.startTimecode, slot.endTimecode)
      : null;
    const altIdx = slot.slotType === "part_header" ? -1 : _altIdx++;
    return { slot, clockTime, endTime: runningTime, recordedTime, altIdx };
  });

  if (clampedCutoff === rows.length) cutoffClockTime = runningTime;

  const broadcastWindowSec = day.broadcastEndTime && day.broadcastStartTime
    ? (() => {
        let diff = timeToSec(day.broadcastEndTime) - timeToSec(day.broadcastStartTime);
        if (diff < 0) diff += 24 * 3600;
        return diff;
      })()
    : null;
  const cutoffDiff = broadcastWindowSec !== null ? cutoffTotalSec - broadcastWindowSec : null;

  const cutoffBanner = (
    <div className="flex items-center justify-between px-4 py-1.5 text-xs tabular-nums">
      <span className="font-bold text-orange-700 tracking-wide">■ סוף תוכן</span>
      <div className="flex items-center gap-4 font-semibold">
        {cutoffClockTime && <span className="text-orange-800">{cutoffClockTime}</span>}
        <span className="text-orange-800">{formatDurationSec(cutoffTotalSec)}</span>
        {cutoffDiff !== null && cutoffDiff > 0 && (
          <span className="text-red-600">+{formatDurationSec(cutoffDiff)} חריגה</span>
        )}
        {cutoffDiff !== null && cutoffDiff < 0 && (
          <span className="text-green-700">{formatDurationSec(-cutoffDiff)} נותר</span>
        )}
        {cutoffDiff === 0 && <span className="text-green-700">בדיוק!</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-bold">{dayLabel}</h2>
        {enDayLabel && <p className="text-sm text-muted-foreground">{enDayLabel}</p>}
      </div>
      <div className="relative">
        {/* Sticky column header — overflow-x hidden, scrollLeft synced by JS with body */}
        <div
          ref={headerScrollRef}
          className="sticky top-12 z-20 overflow-x-hidden border border-border rounded-t-lg bg-muted"
        >
          <table className="text-xs whitespace-nowrap border-separate border-spacing-0" style={TABLE_STYLE}>
            <Colgroup />
            <thead>
              <tr className="bg-muted">
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className={`px-2 py-2 text-start bg-muted ${c.cls}`}
                  >
                    <div className="font-semibold text-foreground leading-tight">{c.label}</div>
                    <div className="font-normal text-muted-foreground text-xs leading-tight">{c.en}</div>
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>

        {/* Body — horizontally scrollable; drives header scroll via onBodyScroll */}
        <div
          ref={bodyScrollRef}
          className="overflow-x-auto border-x border-b border-border rounded-b-lg shadow-sm"
          onScroll={onBodyScroll}
        >
          <table className="text-xs whitespace-nowrap border-separate border-spacing-0" style={TABLE_STYLE}>
            <Colgroup />
            <tbody>
              {clampedStart === 0 && (
                <tr>
                  <td colSpan={COLS.length} className="px-0 py-0 border-y-2 border-blue-400 bg-blue-100">
                    <div className="px-4 py-1.5 text-xs font-bold text-blue-700 tracking-wide text-center">▶ תחילת תוכן</div>
                  </td>
                </tr>
              )}
              {rows.map(({ slot, clockTime, endTime, recordedTime, altIdx }, i) => {
                const startRow = clampedStart > 0 && clampedStart === i ? (
                  <tr key="start-line">
                    <td colSpan={COLS.length} className="px-0 py-0 border-y-2 border-blue-400 bg-blue-100">
                      <div className="px-4 py-1.5 text-xs font-bold text-blue-700 tracking-wide text-center">▶ תחילת תוכן</div>
                    </td>
                  </tr>
                ) : null;

                const cutoffRow = clampedCutoff === i ? (
                  <tr key="cutoff-line">
                    <td colSpan={COLS.length} className="px-0 py-0 border-y-2 border-orange-400 bg-orange-100">
                      {cutoffBanner}
                    </td>
                  </tr>
                ) : null;

                if (slot.slotType === "part_header") {
                  return (
                    <React.Fragment key={slot.id}>
                      {startRow}
                      {cutoffRow}
                      <tr className="bg-yellow-100 border-t-2 border-yellow-400">
                        <td colSpan={COLS.length} className="px-3 py-2 font-bold text-sm text-yellow-900 tracking-wide">
                          חלק {slot.partNumber ?? "—"} / Part {slot.partNumber ?? "—"}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                }

                const isPreContent = i < clampedStart;
                const isBelowCutoff = clampedCutoff !== null && i >= clampedCutoff;
                const rowColor = SLOT_ROW_COLORS[slot.slotType] ?? "border-s-border";
                const altBg = altIdx % 2 !== 0 ? "bg-muted" : "bg-card";

                return (
                  <React.Fragment key={slot.id}>
                    {startRow}
                    {cutoffRow}
                    <tr className={`border-t border-border border-s-2 hover:brightness-90 transition-colors ${rowColor} ${altBg} ${isPreContent || isBelowCutoff ? "opacity-40" : ""}`}>
                      {/* שעות — sticky to inline-end */}
                      <td className={`px-2 py-2 tabular-nums font-semibold text-foreground sticky end-0 z-10 ${altBg} border-s border-border`}>
                        {clockTime}
                      </td>
                      {/* אייטם */}
                      <td className="px-2 py-2 font-medium whitespace-normal leading-snug">{itemLabel(slot)}</td>
                      {/* תוכן */}
                      <td className="px-2 py-2 whitespace-pre-wrap leading-snug">
                        {(() => { const { main, sub } = contentText(slot); return (<><span className="block">{main}</span>{sub && <span className="block text-[10px] text-muted-foreground mt-0.5">{sub}</span>}</>); })()}
                        {slot.lesson?.recordingDate && (
                          <span className="block text-[10px] text-muted-foreground tabular-nums mt-0.5">
                            {slot.lesson.recordingDate.slice(0, 10)}
                          </span>
                        )}
                        {slot.lineupLink && (
                          <a href={slot.lineupLink} target="_blank" rel="noopener noreferrer"
                            className="block text-xs text-blue-600 hover:underline mt-1 truncate max-w-[220px]">
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
                            <TableLink href={slot.studyMaterialLink ?? slot.lesson?.articleSourceLink ?? ""} label="מאמר" />
                          )}
                        </div>
                      </td>
                      {/* שיעור מוקלט */}
                      <td className="px-2 py-2">
                        {(slot.recordedLessonLink || slot.lesson?.kmPageLink) && (
                          <TableLink href={slot.recordedLessonLink ?? slot.lesson?.kmPageLink ?? ""} label="לינק" />
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
                      <td className="px-2 py-2 text-muted-foreground overflow-hidden">{slot.language ?? ""}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
              {/* Cutoff banner at end of list */}
              {clampedCutoff === rows.length && (
                <tr>
                  <td colSpan={COLS.length} className="px-0 py-0 border-y-2 border-orange-400 bg-orange-100">
                    {cutoffBanner}
                  </td>
                </tr>
              )}
            </tbody>
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
    </div>
  );
}
