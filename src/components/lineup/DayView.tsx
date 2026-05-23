"use client";

import { DayWithSlots, SlotWithLesson, SLOT_TYPE_LABELS, TRANSITION_LABELS, SlotType, TransitionType, LESSON_SLOT_TYPES } from "@/types";
import { addSecondsToTime, timecodeDuration } from "@/lib/timecodes";
import { formatDurationSec } from "@/lib/time";
import { Check } from "lucide-react";

interface DayViewProps {
  day: DayWithSlots;
  dayLabel: string;
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
  return slot.label || SLOT_TYPE_LABELS[slot.slotType as SlotType] || slot.slotType;
}

function contentText(slot: SlotWithLesson): string {
  if (slot.slotType === "article_reading") return slot.label || slot.studyMaterialSourceRef || "";
  if (slot.narratorScript) return slot.narratorScript;
  if (slot.lesson?.sourceRef) return slot.lesson.sourceRef;
  if (slot.mediaCode) return slot.mediaCode;
  if (slot.groupLeader) return slot.groupLeader;
  return "";
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

export function DayView({ day, dayLabel }: DayViewProps) {
  const startTime = day.broadcastStartTime ?? "03:00";
  let runningTime = startTime;
  let totalSeconds = 0;

  const rows = day.slots.map((slot) => {
    const clockTime = runningTime;
    const dur = slotEffectiveDuration(slot);
    totalSeconds += dur;
    runningTime = addSecondsToTime(runningTime, dur);
    const recordedTime = slot.startTimecode && slot.endTimecode
      ? timecodeDuration(slot.startTimecode, slot.endTimecode)
      : null;
    return { slot, clockTime, endTime: runningTime, recordedTime };
  });

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
              if (slot.slotType === "part_header") {
                return (
                  <tr key={slot.id} className="bg-yellow-100 border-t-2 border-yellow-400">
                    <td colSpan={COLS.length} className="px-3 py-2 font-bold text-sm text-yellow-900 tracking-wide">
                      חלק {slot.partNumber ?? "—"} / Part {slot.partNumber ?? "—"}
                    </td>
                  </tr>
                );
              }

              const rowColor = SLOT_ROW_COLORS[slot.slotType] ?? "border-s-border";
              const altBg = i % 2 !== 0 ? "bg-muted/20" : "";

              return (
                <tr
                  key={slot.id}
                  className={`border-t border-border border-s-2 hover:bg-accent/30 transition-colors ${rowColor} ${altBg}`}
                >
                  {/* שעות — sticky */}
                  <td className={`px-2 py-2 tabular-nums font-semibold text-foreground sticky end-0 z-10 ${altBg || "bg-background"} border-s border-border/50`}>
                    {clockTime}
                  </td>
                  {/* אייטם */}
                  <td className="px-2 py-2 font-medium">{itemLabel(slot)}</td>
                  {/* תוכן */}
                  <td className="px-2 py-2 whitespace-pre-wrap leading-snug">
                    <span className="block">{contentText(slot)}</span>
                    {slot.lesson?.recordingDate && (
                      <span className="block text-[10px] text-muted-foreground tabular-nums mt-0.5">
                        {slot.lesson.recordingDate.slice(0, 10)}
                      </span>
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
                      {slot.lineupLink && (
                        <Link href={slot.lineupLink} label="ליינאפ" />
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
              );
            })}
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
