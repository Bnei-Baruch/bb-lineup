"use client";

import React, { useRef, useState, useEffect } from "react";
import { DayWithSlots, SlotWithLesson, SLOT_TYPE_LABELS, TRANSITION_LABELS, SlotType, TransitionType, LESSON_SLOT_TYPES } from "@/types";
import { addSecondsToTime, timecodeDuration } from "@/lib/timecodes";
import { formatDurationSec } from "@/lib/time";
import { Check, Clock } from "lucide-react";

interface DayViewProps {
  enDayLabel?: string;
  contentStartIndex?: number | null;
  day: DayWithSlots;
  dayLabel: string;
  contentCutoffIndex?: number | null;
}

function getIsraelTimeSec(): number {
  const parts = new Intl.DateTimeFormat("he", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === "hour")?.value ?? "0");
  const m = parseInt(parts.find(p => p.type === "minute")?.value ?? "0");
  const s = parseInt(parts.find(p => p.type === "second")?.value ?? "0");
  return h * 3600 + m * 60 + s;
}

function slotEffectiveDuration(slot: SlotWithLesson): number {
  if (LESSON_SLOT_TYPES.includes(slot.slotType) && slot.lesson) {
    const hasSlotTC = slot.startTimecode && slot.endTimecode;
    const inTC = hasSlotTC ? slot.startTimecode : slot.lesson.startTimecode;
    const outTC = hasSlotTC ? slot.endTimecode : slot.lesson.endTimecode;
    if (inTC && outTC) {
      const toSec = (tc: string) => { const p = tc.split(":").map(Number); return (p[0] ?? 0) * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0); };
      const dur = toSec(outTC) - toSec(inTC);
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
  { key: "time",     label: "שעות",       en: "Time",       cls: "sticky end-0 z-10", minWidth: 96,  sep: false },
  { key: "item",     label: "אייטם",       en: "Item",       cls: "",                  minWidth: 112, sep: true  },
  { key: "content",  label: "תוכן",        en: "Content",    cls: "",                  minWidth: 180, sep: false },
  { key: "notes",    label: "הערות",       en: "Notes",      cls: "",                  minWidth: 120, sep: true  },
  { key: "material", label: "חומר לימוד",  en: "Study Mat.", cls: "",                  minWidth: 96,  sep: true  },
  { key: "recorded", label: "שיעור מוקלט", en: "Recorded",   cls: "",                  minWidth: 80,  sep: true  },
  { key: "startTc",  label: "החל מדקה",    en: "From TC",    cls: "",                  minWidth: 76,  sep: false },
  { key: "opening",  label: "דבר המתחיל",  en: "Opening",    cls: "",                  minWidth: 140, sep: false },
  { key: "endTc",    label: "עד דקה",      en: "To TC",      cls: "",                  minWidth: 76,  sep: false },
  { key: "closing",  label: "דברי סיום",   en: "Closing",    cls: "",                  minWidth: 140, sep: false },
  { key: "recTime",  label: "משך",         en: "Duration",   cls: "",                  minWidth: 72,  sep: true  },
  { key: "endTime",  label: "שעת סיום",    en: "End Time",   cls: "",                  minWidth: 72,  sep: false },
  { key: "subs",     label: "כתוביות",     en: "Subs",       cls: "text-center",       minWidth: 64,  sep: true  },
  { key: "workshop", label: "סדנה",        en: "Workshop",   cls: "text-center",       minWidth: 56,  sep: false },
  { key: "lang",     label: "שפה",         en: "Lang",       cls: "",                  minWidth: 56,  sep: false },
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

interface NowPlaying {
  clipName: string;
  actualStartAt: string; // ISO-8601
  durationSec?: number;
}

function isoToIsraelSec(iso: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("he", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const h = parseInt(parts.find(p => p.type === "hour")?.value ?? "0");
  const m = parseInt(parts.find(p => p.type === "minute")?.value ?? "0");
  const s = parseInt(parts.find(p => p.type === "second")?.value ?? "0");
  return h * 3600 + m * 60 + s;
}

function secToHHMMSS(totalSec: number): string {
  const sec = ((totalSec % 86400) + 86400) % 86400;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function DayView({ day, dayLabel, enDayLabel, contentStartIndex, contentCutoffIndex }: DayViewProps) {
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  const [nowSec, setNowSec] = useState<number>(getIsraelTimeSec);
  useEffect(() => {
    const id = setInterval(() => setNowSec(getIsraelTimeSec()), 10_000);
    return () => clearInterval(id);
  }, []);

  const [lastPlaying, setLastPlaying] = useState<NowPlaying | null>(null);
  const [isCurrentlyLive, setIsCurrentlyLive] = useState(false);

  function computeIsLive(data: NowPlaying): boolean {
    const startMs = new Date(data.actualStartAt).getTime();
    const nowMs = Date.now();
    if (nowMs < startMs) return false; // hasn't started yet
    if (data.durationSec) return nowMs < startMs + (data.durationSec + 5) * 1000;
    return true;
  }

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/playout/current");
        const data: NowPlaying | null = res.ok ? await res.json() : null;
        if (data) {
          setLastPlaying(data);
          setIsCurrentlyLive(computeIsLive(data));
        } else {
          setIsCurrentlyLive(false);
        }
      } catch { setIsCurrentlyLive(false); }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // For planning totals: full video duration (not cut timecodes)
  function slotPlanDur(slot: SlotWithLesson): number {
    if (slot.slotType === "part_header") return 0;
    if (LESSON_SLOT_TYPES.includes(slot.slotType as SlotType) && slot.lesson) {
      return slot.lesson.videoDurationSec ?? 0;
    }
    return slot.durationSec ?? 0;
  }

  let cutoffTotalSec = 0;
  let cutoffClockTime: string | null = null;
  // Separate counter so part_header rows don't disturb the even/odd alternating pattern.
  let _altIdx = 0;

  // Manual playout trigger
  const [manualSlotId, setManualSlotId] = useState<string | null>(null);
  const [manualTime, setManualTime] = useState("");

  function openManual(slot: SlotWithLesson) {
    const parts = new Intl.DateTimeFormat("he", {
      timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const h = parts.find(p => p.type === "hour")?.value ?? "00";
    const m = parts.find(p => p.type === "minute")?.value ?? "00";
    const s = parts.find(p => p.type === "second")?.value ?? "00";
    setManualTime(`${h}:${m}:${s}`);
    setManualSlotId(slot.id);
  }

  async function confirmManual(slot: SlotWithLesson) {
    const code = slot.lesson?.series?.playoutCode ?? slot.id;
    if (!manualTime) return;
    // Convert HH:MM:SS to a full ISO date in Israel timezone
    const today = new Intl.DateTimeFormat("sv", { timeZone: "Asia/Jerusalem" }).format(new Date()); // YYYY-MM-DD
    const iso = new Date(`${today}T${manualTime}+03:00`).toISOString();
    const durationSec = slot.lesson?.videoDurationSec ?? undefined;
    const body: Record<string, unknown> = { clipName: code, actualStartAt: iso };
    if (durationSec) body.durationSec = durationSec;
    try {
      const res = await fetch("/api/playout/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data: NowPlaying = await res.json();
        setLastPlaying(data);
        setIsCurrentlyLive(computeIsLive(data));
      }
    } finally {
      setManualSlotId(null);
    }
  }

  // Precompute live slot index for matching — use lastPlaying for time correction (persists after clip ends)
  const liveSlotIndex = lastPlaying
    ? day.slots.findIndex(s => {
        const code = s.lesson?.series?.playoutCode;
        return (code && code.toUpperCase() === lastPlaying.clipName.toUpperCase()) ||
               s.id === lastPlaying.clipName;
      })
    : -1;
  const liveStartSec = lastPlaying ? isoToIsraelSec(lastPlaying.actualStartAt) : null;

  let runningSec = timeToSec(startTime);
  let postAnchor = false; // true once we've passed any slot with a confirmed actual time
  const rows = day.slots.map((slot, i) => {
    const isLive = i === liveSlotIndex;

    // Determine the actual start time for this slot:
    // - live slot: use lastPlaying.actualStartAt (most current, from Companion)
    // - other slots: use persisted actualBroadcastAt (survives page reloads)
    const actualStartSec = isLive && liveStartSec !== null
      ? liveStartSec
      : (slot.actualBroadcastAt ? isoToIsraelSec(slot.actualBroadcastAt) : null);

    if (actualStartSec !== null) {
      runningSec = actualStartSec;
      runningTime = secToHHMMSS(actualStartSec);
      if (isLive) postAnchor = false; // re-anchor: don't carry "postAnchor" into the live slot itself
    }

    const clockTime = runningTime;
    const hasConfirmedTime = actualStartSec !== null;
    const scheduledClockTime = isLive ? secToHHMMSS(timeToSec(startTime) +
      day.slots.slice(0, i).reduce((s, sl) => s + slotEffectiveDuration(sl), 0)) : null;
    const slotStartSec = runningSec;

    // Use actual Playdeck duration for the live slot if provided
    const dur = isLive && lastPlaying?.durationSec
      ? lastPlaying.durationSec
      : slotEffectiveDuration(slot);

    if (i >= clampedStart && (clampedCutoff === null || i < clampedCutoff)) cutoffTotalSec += slotPlanDur(slot);
    if (clampedCutoff !== null && i === clampedCutoff) cutoffClockTime = clockTime;
    totalSeconds += dur;
    runningTime = addSecondsToTime(runningTime, dur);
    runningSec += dur;

    if (isLive || slot.actualBroadcastAt) postAnchor = true;

    const recordedTime = slot.startTimecode && slot.endTimecode
      ? timecodeDuration(slot.startTimecode, slot.endTimecode)
      : null;
    const altIdx = slot.slotType === "part_header" ? -1 : _altIdx++;
    const isActive = dur > 0 && nowSec >= slotStartSec && nowSec < runningSec;
    // isProjected: past an anchor but this slot has no confirmed time of its own
    const isProjected = postAnchor && !hasConfirmedTime;
    return { slot, clockTime, scheduledClockTime, endTime: runningTime, recordedTime, altIdx, isActive, isLive, isProjected };
  });

  if (clampedCutoff === rows.length) cutoffClockTime = runningTime;

  const broadcastWindowSec = day.broadcastEndTime && day.broadcastStartTime
    ? (() => {
        let diff = timeToSec(day.broadcastEndTime) - timeToSec(day.broadcastStartTime);
        if (diff < 0) diff += 24 * 3600;
        return diff;
      })()
    : null;

  // Pre-content: slots before the תחילת תוכן marker (using full plan durations)
  const preContentSec = day.slots.slice(0, clampedStart).reduce((sum, s) => sum + slotPlanDur(s), 0);
  const targetContentSec = broadcastWindowSec !== null ? broadcastWindowSec - preContentSec : null;
  const cutoffDiff = targetContentSec !== null ? cutoffTotalSec - targetContentSec : null;

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
                    className={`px-3 py-3 text-start bg-muted ${c.sep ? "border-s-2 border-s-slate-300" : ""} ${c.cls}`}
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
              {rows.map(({ slot, clockTime, scheduledClockTime, endTime, recordedTime, altIdx, isActive, isLive, isProjected }, i) => {
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
                        <td colSpan={COLS.length} className="px-3 py-3 font-bold text-sm text-yellow-900 tracking-wide">
                          חלק {slot.partNumber ?? "—"} / Part {slot.partNumber ?? "—"}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                }

                const isManualOpen = manualSlotId === slot.id;
                const isPreContent = i < clampedStart;
                const isBelowCutoff = clampedCutoff !== null && i >= clampedCutoff;
                const rowColor = SLOT_ROW_COLORS[slot.slotType] ?? "border-s-border";
                const altBg = altIdx % 2 !== 0 ? "bg-muted" : "bg-card";

                return (
                  <React.Fragment key={slot.id}>
                    {startRow}
                    {cutoffRow}
                    <tr className={`border-t border-s-2 hover:brightness-90 transition-colors ${
                      (isLive && isCurrentlyLive) ? "bg-amber-50 border-s-amber-500" :
                      isActive                    ? "bg-green-50 border-s-green-500" :
                                                    `${rowColor} ${altBg} border-border`
                    }`}>
                      {/* שעות — sticky to inline-end */}
                      <td dir="ltr" className={`px-3 py-3 text-right tabular-nums font-semibold sticky end-0 z-10 border-s border-border group/timecell ${
                        (isLive && isCurrentlyLive) ? "text-amber-700 bg-amber-50" :
                        isActive                    ? "text-green-600 bg-green-50" :
                                                      `${altBg} text-foreground`
                      }`}>
                        <div className="flex items-center justify-end gap-1">
                          {!isManualOpen && (
                            <button
                              onClick={() => openManual(slot)}
                              className="opacity-0 group-hover/timecell:opacity-100 transition-opacity text-muted-foreground hover:text-amber-600 shrink-0"
                              title="סמן כמשודר עכשיו"
                            >
                              <Clock className="h-3 w-3" />
                            </button>
                          )}
                          {(isLive && isCurrentlyLive) && <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />}
                          {!(isLive && isCurrentlyLive) && isActive && <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0" />}
                          <span className={isProjected ? "italic text-muted-foreground" : ""}>{clockTime}</span>
                        </div>
                        {(isLive && isCurrentlyLive) && scheduledClockTime && scheduledClockTime !== clockTime && (
                          <span className="block text-[10px] font-normal text-amber-600 leading-none mt-0.5 text-right">
                            מתוזמן {scheduledClockTime}
                          </span>
                        )}
                        {isManualOpen && (
                          <div className="mt-1 flex flex-col gap-1 items-end" onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              value={manualTime}
                              onChange={e => setManualTime(e.target.value)}
                              className="w-24 text-xs border border-border rounded px-1 py-0.5 text-center font-mono bg-background text-foreground"
                              placeholder="HH:MM:SS"
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => confirmManual(slot)}
                                className="px-2 py-0.5 text-[10px] rounded bg-amber-500 text-white font-semibold hover:bg-amber-600"
                              >
                                אישור
                              </button>
                              <button
                                onClick={() => setManualSlotId(null)}
                                className="px-2 py-0.5 text-[10px] rounded border border-border text-muted-foreground hover:bg-muted"
                              >
                                ביטול
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                      {/* אייטם */}
                      <td className="px-3 py-3 font-medium whitespace-normal leading-snug border-s-2 border-s-slate-300">
                        {(isLive && isCurrentlyLive) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white me-1.5 align-middle">LIVE</span>
                        )}
                        {itemLabel(slot)}
                      </td>
                      {/* תוכן */}
                      <td className="px-3 py-3 whitespace-pre-wrap leading-snug">
                        {(() => { const { main, sub } = contentText(slot); return (<><span className="block">{main}</span>{sub && <span className="block text-[10px] text-muted-foreground mt-0.5">{sub}</span>}</>); })()}
                        {slot.lesson?.recordingDate && (
                          <span className="block text-[10px] text-muted-foreground tabular-nums mt-0.5">
                            {slot.lesson.recordingDate.slice(0, 10)}
                          </span>
                        )}
                        {slot.lineupLink && (
                          <TableLink href={slot.lineupLink} label="ליינאפ" />
                        )}
                      </td>
                      {/* הערות */}
                      <td className="px-3 py-3 whitespace-pre-wrap leading-snug text-muted-foreground border-s-2 border-s-slate-300">
                        {slot.notes ?? ""}
                      </td>
                      {/* חומר לימוד */}
                      <td className="px-3 py-3 border-s-2 border-s-slate-300">
                        <div className="flex flex-col gap-1">
                          {(slot.studyMaterialLink || slot.lesson?.articleSourceLink) && (
                            <TableLink href={slot.studyMaterialLink ?? slot.lesson?.articleSourceLink ?? ""} label="מאמר" />
                          )}
                          {slot.likutimLink && (
                            <TableLink href={slot.likutimLink} label={slot.likutimName ?? "ליקוטים"} />
                          )}
                          {slot.lesson?.transcriptionLink && (
                            <TableLink href={slot.lesson.transcriptionLink} label="תמליל" />
                          )}
                        </div>
                      </td>
                      {/* שיעור מוקלט */}
                      <td className="px-3 py-3 border-s-2 border-s-slate-300">
                        {(slot.recordedLessonLink || slot.lesson?.kmPageLink) && (
                          <TableLink href={slot.recordedLessonLink ?? slot.lesson?.kmPageLink ?? ""} label="וידאו" />
                        )}
                      </td>
                      {/* החל מדקה */}
                      <td className="px-3 py-3 tabular-nums text-muted-foreground border-s-2 border-s-slate-300">
                        {LESSON_SLOT_TYPES.includes(slot.slotType as SlotType)
                          ? (() => { const hasSlotTC = slot.startTimecode && slot.endTimecode; return hasSlotTC ? slot.startTimecode : (slot.lesson?.startTimecode || "00:00:00"); })()
                          : (slot.startTimecode ?? "")}
                      </td>
                      {/* דבר המתחיל */}
                      <td className="px-3 py-3 whitespace-pre-wrap leading-snug text-muted-foreground">
                        {slot.openingWords ?? ""}
                      </td>
                      {/* עד דקה */}
                      <td className="px-3 py-3 tabular-nums text-muted-foreground">
                        {LESSON_SLOT_TYPES.includes(slot.slotType as SlotType)
                          ? (() => { const hasSlotTC = slot.startTimecode && slot.endTimecode; return hasSlotTC ? slot.endTimecode : (slot.lesson?.endTimecode || (slot.lesson?.videoDurationSec ? formatDurationSec(slot.lesson.videoDurationSec) : "")); })()
                          : (slot.endTimecode ?? "")}
                      </td>
                      {/* דברי סיום */}
                      <td className="px-3 py-3 whitespace-pre-wrap leading-snug text-muted-foreground">
                        {slot.closingWords ?? ""}
                      </td>
                      {/* משך */}
                      <td className="px-3 py-3 tabular-nums font-medium border-s-2 border-s-slate-300">
                        {isLive && lastPlaying?.durationSec ? (
                          <>
                            <span className="text-amber-700">{formatDurationSec(lastPlaying.durationSec)}</span>
                            {(() => {
                              const sched = recordedTime ?? (slotEffectiveDuration(slot) > 0 ? formatDurationSec(slotEffectiveDuration(slot)) : null);
                              return sched && sched !== formatDurationSec(lastPlaying.durationSec)
                                ? <span className="block text-[10px] text-muted-foreground line-through">{sched}</span>
                                : null;
                            })()}
                          </>
                        ) : (
                          recordedTime ?? (slotEffectiveDuration(slot) > 0 ? formatDurationSec(slotEffectiveDuration(slot)) : "")
                        )}
                      </td>
                      {/* שעת סיום */}
                      <td className="px-3 py-3 tabular-nums text-muted-foreground">{endTime}</td>
                      {/* כתוביות */}
                      <td className="px-3 py-3 text-center border-s-2 border-s-slate-300">
                        {slot.hasSubtitles && <Check className="h-3.5 w-3.5 text-green-600 mx-auto" />}
                      </td>
                      {/* סדנה */}
                      <td className="px-3 py-3 text-center">
                        {slot.hasWorkshopQuestions && <Check className="h-3.5 w-3.5 text-green-600 mx-auto" />}
                      </td>
                      {/* שפה */}
                      <td className="px-3 py-3 text-muted-foreground overflow-hidden">{slot.language ?? ""}</td>
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
                  <td className="px-3 py-3 tabular-nums">{runningTime}</td>
                  <td colSpan={9} className="px-3 py-3 text-muted-foreground text-[11px]">סה״כ</td>
                  <td className="px-3 py-3 tabular-nums">{formatDurationSec(totalSeconds)}</td>
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
