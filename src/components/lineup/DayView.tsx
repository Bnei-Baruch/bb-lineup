"use client";

import React, { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DayWithSlots, SlotWithLesson, SlotType, LESSON_SLOT_TYPES } from "@/types";
import { addSecondsToTime, timecodeDuration } from "@/lib/timecodes";
import { formatDurationSec } from "@/lib/time";
import { slotEffectiveDuration } from "@/lib/slot-duration";
import { Clock, ZoomIn, ZoomOut, Sun, Moon, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/components/providers/KeycloakProvider";
import {
  COLS, TABLE_STYLE, Colgroup, SLOT_ROW_COLORS, TableLink, HIGHLIGHT_COLORS, RowColorPicker,
  timeToSec, secToHHMMSS, itemLabel, contentText, linkifyText,
} from "./slot-table-shared";
import { parseCustomLinks } from "@/lib/custom-links";

const ROW_HIGHLIGHTS_KEY = "dayview-row-highlights";

const HIDDEN_COLS = new Set(["subs", "workshop", "lang"]);
const VISIBLE_COLS = COLS.filter((c) => !HIDDEN_COLS.has(c.key));

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

interface NowPlaying {
  clipName: string;
  actualStartAt: string; // ISO-8601 — Playdeck clip start (may be old/stale)
  updatedAt: string;     // ISO-8601 — when Companion sent the POST (always current)
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

export function DayView({ day, dayLabel, enDayLabel, contentStartIndex, contentCutoffIndex }: DayViewProps) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);

  const [nowSec, setNowSec] = useState<number>(getIsraelTimeSec);
  useEffect(() => {
    const id = setInterval(() => setNowSec(getIsraelTimeSec()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Broadcast displays are often left open for hours — re-fetch the lineup data
  // whenever the tab regains focus/visibility, so it never shows stale content.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [router]);

  // Display prefs (font zoom, dark mode) — persisted per-browser since this is a
  // broadcast-room display setting, not user account data.
  const [fontScale, setFontScale] = useState(1);
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    const savedScale = Number(localStorage.getItem("dayview-font-scale"));
    if (savedScale) setFontScale(savedScale);
    setDarkMode(localStorage.getItem("dayview-dark-mode") === "1");
  }, []);
  useEffect(() => { localStorage.setItem("dayview-font-scale", String(fontScale)); }, [fontScale]);

  // Row highlight colors — per-browser only, see HIGHLIGHT_COLORS comment.
  const [rowHighlights, setRowHighlights] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      setRowHighlights(JSON.parse(localStorage.getItem(ROW_HIGHLIGHTS_KEY) ?? "{}"));
    } catch {
      setRowHighlights({});
    }
  }, []);
  function setRowHighlight(slotId: string, color: string | null) {
    setRowHighlights((prev) => {
      const next = { ...prev };
      if (color) next[slotId] = color;
      else delete next[slotId];
      localStorage.setItem(ROW_HIGHLIGHTS_KEY, JSON.stringify(next));
      return next;
    });
  }

  // Native smooth-scroll buttons for horizontal scrolling — a plain mouse has no
  // reliable way to trigger the table's horizontal scroll otherwise (no drag
  // handle, and the OS scrollbar only appears transiently on trackpad gestures).
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  function scrollByPage(direction: -1 | 1) {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.8), behavior: "smooth" });
  }

  useEffect(() => {
    localStorage.setItem("dayview-dark-mode", darkMode ? "1" : "0");
    // Applied on <html> (not a local wrapper div) so every element on the page —
    // including the breadcrumb/edit bar the page renders around DayView — inherits
    // the dark foreground/background instead of some text staying stuck at the
    // light theme's near-black color. Reverts on unmount so it doesn't bleed into
    // other (unaudited) admin pages after navigating away.
    document.documentElement.classList.toggle("dark", darkMode);
    return () => document.documentElement.classList.remove("dark");
  }, [darkMode]);

  const [lastPlaying, setLastPlaying] = useState<NowPlaying | null>(null);
  const [isCurrentlyLive, setIsCurrentlyLive] = useState(false);

  // Scroll to the active/live row on initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      activeRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // Scroll to the live row when Companion triggers a clip
  useEffect(() => {
    if (isCurrentlyLive) {
      activeRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isCurrentlyLive]);

  // Refs so the poll interval closure can read current state without stale captures
  const lastPlayingRef = useRef<NowPlaying | null>(null);
  const isCurrentlyLiveRef = useRef(false);

  function computeIsLive(data: NowPlaying): boolean {
    const updatedMs = new Date(data.updatedAt).getTime();
    const nowMs = Date.now();
    if (data.durationSec) return nowMs < updatedMs + (data.durationSec + 5) * 1000;
    return nowMs < updatedMs + 120 * 1000;
  }

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/playout/current");
        const data: NowPlaying | null = res.ok ? await res.json() : null;
        if (data) {
          lastPlayingRef.current = data;
          setLastPlaying(data);
          const live = computeIsLive(data);
          isCurrentlyLiveRef.current = live;
          setIsCurrentlyLive(live);
        } else {
          const wasLive = isCurrentlyLiveRef.current;
          const prev = lastPlayingRef.current;
          isCurrentlyLiveRef.current = false;
          lastPlayingRef.current = null;
          setIsCurrentlyLive(false);
          setLastPlaying(null);

          // Clip just stopped — fetch the actual played duration from the slot and
          // update slotOverrides so it shows without a page reload
          if (wasLive && prev) {
            const liveSlot = day.slots.find(s => {
              const code = s.lesson?.series?.playoutCode ?? s.mediaCode;
              return (code && code.toUpperCase() === prev.clipName.toUpperCase()) ||
                     s.id === prev.clipName;
            });
            if (liveSlot) {
              fetch(`/api/slots/${liveSlot.id}/actuals`)
                .then(r => r.ok ? r.json() : null)
                .then((actuals: { actualBroadcastAt: string | null; actualDurationSec: number | null } | null) => {
                  if (actuals?.actualDurationSec != null) {
                    setSlotOverrides(overrides => {
                      const next = new Map(overrides);
                      next.set(liveSlot.id, {
                        actualBroadcastAt: overrides.get(liveSlot.id)?.actualBroadcastAt ?? actuals.actualBroadcastAt,
                        actualDurationSec: actuals.actualDurationSec,
                      });
                      return next;
                    });
                  }
                })
                .catch(() => {});
            }
          }
        }
      } catch { setIsCurrentlyLive(false); }
    }
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (slot.parentSlotId) return 0;
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
  const [manualDuration, setManualDuration] = useState("");

  // Client-side overrides for actualBroadcastAt/actualDurationSec set by manual adjustments.
  // Avoids needing a page reload to see the updated times.
  const [slotOverrides, setSlotOverrides] = useState<Map<string, { actualBroadcastAt: string | null; actualDurationSec: number | null }>>(new Map());

  function openManual(slot: SlotWithLesson) {
    const parts = new Intl.DateTimeFormat("he", {
      timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const h = parts.find(p => p.type === "hour")?.value ?? "00";
    const m = parts.find(p => p.type === "minute")?.value ?? "00";
    const s = parts.find(p => p.type === "second")?.value ?? "00";
    setManualTime(`${h}:${m}:${s}`);
    const existingDur = slotOverrides.get(slot.id)?.actualDurationSec ?? slot.actualDurationSec ?? slotEffectiveDuration(slot);
    setManualDuration(existingDur > 0 ? formatDurationSec(existingDur) : "");
    setManualSlotId(slot.id);
  }

  function confirmManual(slot: SlotWithLesson) {
    const code = slot.lesson?.series?.playoutCode ?? slot.mediaCode ?? slot.id;
    if (!manualTime) return;
    const today = new Intl.DateTimeFormat("sv", { timeZone: "Asia/Jerusalem" }).format(new Date()); // YYYY-MM-DD
    const iso = new Date(`${today}T${manualTime}+03:00`).toISOString();
    const parsedDur = manualDuration ? timeToSec(manualDuration) : 0;

    // Update UI immediately — no waiting for the network
    setSlotOverrides(prev => {
      const next = new Map(prev);
      next.set(slot.id, { actualBroadcastAt: iso, actualDurationSec: parsedDur > 0 ? parsedDur : null });
      return next;
    });
    setManualSlotId(null);

    // Persist to server in the background (manual:true → only saves to slot, not PlayoutNowPlaying)
    const body: Record<string, unknown> = { clipName: code, actualStartAt: iso, manual: true };
    if (parsedDur > 0) body.durationSec = parsedDur;
    fetch("/api/playout/current", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(console.error);
  }

  // Precompute live slot index for matching — use lastPlaying for time correction (persists after clip ends)
  const liveSlotIndex = lastPlaying
    ? day.slots.findIndex(s => {
        const code = s.lesson?.series?.playoutCode ?? s.mediaCode;
        return (code && code.toUpperCase() === lastPlaying.clipName.toUpperCase()) ||
               s.id === lastPlaying.clipName;
      })
    : -1;
  const liveStartSec = lastPlaying ? isoToIsraelSec(lastPlaying.actualStartAt) : null;

  let runningSec = timeToSec(startTime);
  let postAnchor = false; // true once we've passed any slot with a confirmed actual time
  const slotClockSecs = new Map<string, number>(); // slotId → start sec (for child clock lookup)
  const rows = day.slots.map((slot, i) => {
    const isChild = !!slot.parentSlotId;
    const isLive = i === liveSlotIndex;

    // Merge server-side slot data with any client-side overrides from manual adjustments
    const override = slotOverrides.get(slot.id);
    const effectiveActualBroadcastAt = override?.actualBroadcastAt ?? slot.actualBroadcastAt;
    const effectiveActualDurationSec = override?.actualDurationSec ?? slot.actualDurationSec;

    // Determine the actual start time for this slot:
    // - live slot: use lastPlaying.actualStartAt (most current, from Companion)
    // - other slots: use actualBroadcastAt (persisted or locally overridden from manual trigger)
    const actualStartSec = isLive && liveStartSec !== null
      ? liveStartSec
      : (effectiveActualBroadcastAt ? isoToIsraelSec(effectiveActualBroadcastAt) : null);
    const hasConfirmedTime = actualStartSec !== null;

    // Duration priority: live Companion data > manual override / persisted actual > timecode/scheduled
    const dur = (isLive && lastPlaying?.durationSec)
      ? lastPlaying.durationSec
      : (effectiveActualDurationSec ?? slotEffectiveDuration(slot));

    const scheduledClockTime = isLive ? secToHHMMSS(timeToSec(startTime) +
      day.slots.slice(0, i).filter(sl => !sl.parentSlotId).reduce((s, sl) => s + slotEffectiveDuration(sl), 0)) : null;

    let slotStartSec: number;
    let clockTimeStr: string;

    if (isChild) {
      // Children never advance the shared clock — they play inside the parent's window.
      // But a child can have its own confirmed/live actual start (it really did start then).
      const parentStartSec = slotClockSecs.get(slot.parentSlotId!) ?? runningSec;
      slotStartSec = actualStartSec !== null ? actualStartSec : parentStartSec;
      clockTimeStr = secToHHMMSS(slotStartSec);
      if (isLive) postAnchor = false;
    } else {
      if (actualStartSec !== null) {
        runningSec = actualStartSec;
        runningTime = secToHHMMSS(actualStartSec);
        if (isLive) postAnchor = false;
      }
      slotStartSec = runningSec;
      clockTimeStr = runningTime;
    }

    const rowEndSec = slotStartSec + dur;
    const rowEndTime = secToHHMMSS(rowEndSec);

    if (!isChild) {
      slotClockSecs.set(slot.id, slotStartSec);
      if (i >= clampedStart && (clampedCutoff === null || i < clampedCutoff)) cutoffTotalSec += dur;
      if (clampedCutoff !== null && i === clampedCutoff) cutoffClockTime = clockTimeStr;
      totalSeconds += dur;
      runningTime = rowEndTime;
      runningSec = rowEndSec;
    }

    if (isLive || effectiveActualBroadcastAt) postAnchor = true;

    const hasSlotTCr = slot.startTimecode && slot.endTimecode;
    const rInTC = hasSlotTCr ? slot.startTimecode : slot.lesson?.startTimecode;
    const rOutTC = hasSlotTCr ? slot.endTimecode : slot.lesson?.endTimecode;
    const recordedTime = rInTC && rOutTC ? timecodeDuration(rInTC, rOutTC) : null;
    const altIdx = slot.slotType === "part_header" ? -1 : _altIdx++;
    // Children are not independently active — they play within the parent's window
    const isActive = !isChild && !isCurrentlyLive && dur > 0 && nowSec >= slotStartSec && nowSec < rowEndSec;
    // isProjected: past an anchor but this slot has no confirmed time of its own
    const isProjected = postAnchor && !hasConfirmedTime;
    return { slot, clockTime: clockTimeStr, scheduledClockTime, endTime: rowEndTime, recordedTime, altIdx, isActive, isLive, isProjected, effectiveActualDurationSec, isChild, hasConfirmedTime };
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
      <span className="font-bold text-orange-700 dark:text-orange-400 tracking-wide">■ סוף תוכן</span>
      <div className="flex items-center gap-4 font-semibold">
        {cutoffClockTime && <span className="text-orange-800 dark:text-orange-300">{cutoffClockTime}</span>}
        <span className="text-orange-800 dark:text-orange-300">{formatDurationSec(cutoffTotalSec)}</span>
        {cutoffDiff !== null && cutoffDiff > 0 && (
          <span className="text-red-600 dark:text-red-400">+{formatDurationSec(cutoffDiff)} חריגה</span>
        )}
        {cutoffDiff !== null && cutoffDiff < 0 && (
          <span className="text-green-700 dark:text-green-400">{formatDurationSec(-cutoffDiff)} נותר</span>
        )}
        {cutoffDiff === 0 && <span className="text-green-700 dark:text-green-400">בדיוק!</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-foreground">{dayLabel}</h2>
          {enDayLabel && <p className="text-sm text-muted-foreground">{enDayLabel}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => scrollByPage(1)}
            className="p-1.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
            title="גלול ימינה"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => scrollByPage(-1)}
            className="p-1.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors me-1"
            title="גלול שמאלה"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setFontScale((s) => Math.max(0.7, Math.round((s - 0.1) * 10) / 10))}
            className="p-1.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
            title="הקטן טקסט"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground tabular-nums w-9 text-center">{Math.round(fontScale * 100)}%</span>
          <button
            onClick={() => setFontScale((s) => Math.min(1.8, Math.round((s + 0.1) * 10) / 10))}
            className="p-1.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
            title="הגדל טקסט"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDarkMode((d) => !d)}
            className="p-1.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors ms-1"
            title={darkMode ? "מצב בהיר" : "מצב כהה"}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div ref={scrollContainerRef} className="overflow-auto scrollbar-visible border border-border rounded-lg shadow-sm" style={{ maxHeight: "calc(100vh - 160px)" }}>
      <div style={{ zoom: fontScale }}>
        <table className="text-sm whitespace-nowrap border-separate border-spacing-0" style={TABLE_STYLE}>
          <Colgroup cols={VISIBLE_COLS} />
          <thead>
            <tr className="bg-muted">
              {VISIBLE_COLS.map((c) => (
                <th
                  key={c.key}
                  className={`sticky top-0 z-20 px-3 py-3 text-start bg-muted ${c.sep ? "border-s-2 border-s-slate-300" : ""} ${c.cls}`}
                >
                  <div className="font-semibold text-foreground leading-tight">{c.label}</div>
                  <div className="font-normal text-muted-foreground text-xs leading-tight">{c.en}</div>
                </th>
              ))}
            </tr>
          </thead>
            <tbody>
              {clampedStart === 0 && (
                <tr>
                  <td colSpan={VISIBLE_COLS.length} className="px-0 py-0 border-y-2 border-blue-400 bg-blue-100 dark:border-blue-700 dark:bg-blue-950">
                    <div className="px-4 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 tracking-wide text-center">▶ תחילת תוכן</div>
                  </td>
                </tr>
              )}
              {rows.map(({ slot, clockTime, scheduledClockTime, endTime, recordedTime, altIdx, isActive, isLive, isProjected, effectiveActualDurationSec, isChild, hasConfirmedTime }, i) => {
                const startRow = clampedStart > 0 && clampedStart === i ? (
                  <tr key="start-line">
                    <td colSpan={VISIBLE_COLS.length} className="px-0 py-0 border-y-2 border-blue-400 bg-blue-100 dark:border-blue-700 dark:bg-blue-950">
                      <div className="px-4 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 tracking-wide text-center">▶ תחילת תוכן</div>
                    </td>
                  </tr>
                ) : null;

                const cutoffRow = clampedCutoff === i ? (
                  <tr key="cutoff-line">
                    <td colSpan={VISIBLE_COLS.length} className="px-0 py-0 border-y-2 border-orange-400 bg-orange-100 dark:border-orange-700 dark:bg-orange-950">
                      {cutoffBanner}
                    </td>
                  </tr>
                ) : null;

                if (slot.slotType === "part_header") {
                  return (
                    <React.Fragment key={slot.id}>
                      {startRow}
                      {cutoffRow}
                      <tr className="bg-yellow-100 dark:bg-yellow-950 border-t-2 border-yellow-400 dark:border-yellow-700">
                        <td colSpan={VISIBLE_COLS.length} className="px-3 py-3 font-bold text-sm text-yellow-900 dark:text-yellow-200 tracking-wide">
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
                const altBg = isChild ? "bg-indigo-50/70 dark:bg-indigo-950/40" : (altIdx % 2 !== 0 ? "bg-muted" : "bg-card");
                // A nested item shares its parent's time window until Companion actually reports
                // it played — showing the inherited estimate as if it were its own time is misleading.
                const showChildTime = !isChild || hasConfirmedTime;
                const highlight = rowHighlights[slot.id] ? HIGHLIGHT_COLORS[rowHighlights[slot.id]] : null;

                return (
                  <React.Fragment key={slot.id}>
                    {startRow}
                    {cutoffRow}
                    <tr
                      ref={(isActive || (isLive && isCurrentlyLive)) ? activeRowRef : undefined}
                      className={`hover:brightness-90 transition-colors ${isChild ? "border-t-0 border-s-4" : "border-t border-s-2"} ${
                        (isLive && isCurrentlyLive) ? "bg-amber-50 dark:bg-amber-950/40 border-s-amber-500" :
                        isActive                    ? "bg-green-50 dark:bg-green-950/40 border-s-green-500" :
                        highlight                    ? `${highlight.bg} ${isChild ? "border-s-indigo-500" : "border-border"}` :
                        isChild                      ? "bg-indigo-100/70 dark:bg-indigo-950/40 border-s-indigo-500" :
                                                      `${rowColor} ${altBg} border-border`
                      }`}
                    >
                      {/* שעות — sticky to inline-end */}
                      <td dir="ltr" className={`px-3 py-3 text-right tabular-nums font-semibold sticky end-0 z-10 border-s border-border group/timecell ${
                        (isLive && isCurrentlyLive) ? "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40" :
                        isActive                    ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40" :
                        highlight                    ? `${highlight.bg} text-foreground` :
                        isChild                      ? "text-indigo-700 dark:text-indigo-300 bg-indigo-100/70 dark:bg-indigo-950/40" :
                                                      `${altBg} text-foreground`
                      }`}>
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin && !isManualOpen && (
                            <button
                              onClick={() => openManual(slot)}
                              className="opacity-0 group-hover/timecell:opacity-100 transition-opacity text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 shrink-0"
                              title="סמן כמשודר עכשיו"
                            >
                              <Clock className="h-3 w-3" />
                            </button>
                          )}
                          {(isLive && isCurrentlyLive) && <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />}
                          {!(isLive && isCurrentlyLive) && isActive && <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0" />}
                          {showChildTime && (
                            <span className={isChild ? "italic text-muted-foreground" : isProjected ? "italic text-muted-foreground" : ""}>{clockTime}</span>
                          )}
                          <RowColorPicker
                            value={rowHighlights[slot.id] ?? null}
                            onChange={(color) => setRowHighlight(slot.id, color)}
                          />
                        </div>
                        {(isLive && isCurrentlyLive) && scheduledClockTime && scheduledClockTime !== clockTime && (
                          <span className="block text-[11px] font-normal text-amber-600 dark:text-amber-400 leading-none mt-0.5 text-right">
                            מתוזמן {scheduledClockTime}
                          </span>
                        )}
                        {isAdmin && isManualOpen && (
                          <div className="mt-1 flex flex-col gap-1 items-end" onClick={e => e.stopPropagation()}>
                            <div className="flex flex-col gap-0.5 items-end">
                              <span className="text-[10px] text-muted-foreground">התחלה</span>
                              <input
                                type="text"
                                value={manualTime}
                                onChange={e => setManualTime(e.target.value)}
                                className="w-24 text-xs border border-border rounded px-1 py-0.5 text-center font-mono bg-background text-foreground"
                                placeholder="HH:MM:SS"
                              />
                            </div>
                            <div className="flex flex-col gap-0.5 items-end">
                              <span className="text-[10px] text-muted-foreground">משך (אופציונלי)</span>
                              <input
                                type="text"
                                value={manualDuration}
                                onChange={e => setManualDuration(e.target.value)}
                                className="w-24 text-xs border border-border rounded px-1 py-0.5 text-center font-mono bg-background text-foreground"
                                placeholder="HH:MM:SS"
                              />
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => confirmManual(slot)}
                                className="px-2 py-0.5 text-[11px] rounded bg-amber-500 text-white font-semibold hover:bg-amber-600"
                              >
                                אישור
                              </button>
                              <button
                                onClick={() => setManualSlotId(null)}
                                className="px-2 py-0.5 text-[11px] rounded border border-border text-muted-foreground hover:bg-muted"
                              >
                                ביטול
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                      {/* אייטם */}
                      <td className={`px-3 py-3 font-medium whitespace-normal leading-snug border-s-2 border-s-slate-300 ${isChild ? "ps-8" : ""}`}>
                        {(isLive && isCurrentlyLive) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-500 text-white me-1.5 align-middle">LIVE</span>
                        )}
                        {isChild && <span className="text-indigo-400 dark:text-indigo-300 font-bold me-1">↳</span>}
                        {itemLabel(slot)}
                      </td>
                      {/* תוכן */}
                      <td className="px-3 py-3 whitespace-pre-wrap leading-snug border-s-2 border-s-slate-300">
                        {(() => { const { main, sub } = contentText(slot); return (<><span className="block">{main}</span>{sub && <span className="block text-xs text-muted-foreground mt-0.5">{sub}</span>}</>); })()}
                        {slot.lesson?.recordingDate && (
                          <span className="block text-xs text-muted-foreground tabular-nums mt-0.5">
                            {slot.lesson.recordingDate.slice(0, 10)}
                          </span>
                        )}
                      </td>
                      {/* הערות */}
                      <td className="px-3 py-3 whitespace-pre-wrap leading-snug text-muted-foreground border-s-2 border-s-slate-300">
                        {slot.groupLeader && <span className="block font-medium text-foreground">מנחים: {slot.groupLeader}</span>}
                        {slot.notes ? linkifyText(slot.notes) : ""}
                      </td>
                      {/* חומר לימוד */}
                      <td className="px-3 py-3 border-s-2 border-s-slate-300">
                        <div className="flex flex-col gap-1.5">
                          {(slot.lineupLink ?? slot.component?.defaultLineupLink) && (
                            <TableLink
                              href={(slot.lineupLink ?? slot.component?.defaultLineupLink)!}
                              label={slot.component?.name === "הודעות לסיום" ? "הודעות קריין" : "ליינאפ"}
                            />
                          )}
                          {(slot.slidesLink ?? slot.component?.defaultSlidesLink) && (
                            <TableLink href={(slot.slidesLink ?? slot.component?.defaultSlidesLink)!} label="שקופיות" />
                          )}
                          {(slot.studyMaterialLink || slot.lesson?.articleSourceLink) && (
                            <TableLink href={slot.studyMaterialLink ?? slot.lesson?.articleSourceLink ?? ""} label="מאמר" />
                          )}
                          {slot.likutimLink && (
                            <TableLink href={slot.likutimLink} label={slot.likutimName ?? "ליקוטים"} />
                          )}
                          {parseCustomLinks(slot.customLinks).map((link, i) => (
                            <div key={i} className="w-full mt-1">
                              <TableLink href={link.url} label={link.name || "קישור"} />
                            </div>
                          ))}
                          {slot.lesson?.transcriptionLink && (
                            <TableLink href={slot.lesson.transcriptionLink} label="תמליל" />
                          )}
                          {(slot.recordedLessonLink || slot.lesson?.kmPageLink) && (
                            <TableLink href={slot.recordedLessonLink ?? slot.lesson?.kmPageLink ?? ""} label="וידאו" />
                          )}
                        </div>
                      </td>
                      {/* החל מדקה */}
                      <td className="px-3 py-3 tabular-nums text-muted-foreground border-s-2 border-s-slate-300">
                        {LESSON_SLOT_TYPES.includes(slot.slotType as SlotType)
                          ? (() => { const hasSlotTC = slot.startTimecode && slot.endTimecode; return hasSlotTC ? slot.startTimecode : (slot.lesson?.startTimecode || "00:00:00"); })()
                          : (slot.startTimecode ?? "")}
                      </td>
                      {/* דבר המתחיל */}
                      <td className="px-3 py-3 whitespace-pre-wrap leading-snug text-muted-foreground border-s-2 border-s-slate-300">
                        {slot.openingWords ?? ""}
                      </td>
                      {/* עד דקה */}
                      <td className="px-3 py-3 tabular-nums text-muted-foreground border-s-2 border-s-slate-300">
                        {LESSON_SLOT_TYPES.includes(slot.slotType as SlotType)
                          ? (() => { const hasSlotTC = slot.startTimecode && slot.endTimecode; return hasSlotTC ? slot.endTimecode : (slot.lesson?.endTimecode || (slot.lesson?.videoDurationSec ? formatDurationSec(slot.lesson.videoDurationSec) : "")); })()
                          : (slot.endTimecode ?? "")}
                      </td>
                      {/* דברי סיום */}
                      <td className="px-3 py-3 whitespace-pre-wrap leading-snug text-muted-foreground border-s-2 border-s-slate-300">
                        {slot.closingWords ?? ""}
                      </td>
                      {/* משך */}
                      <td className="px-3 py-3 tabular-nums font-medium border-s-2 border-s-slate-300">
                        {(() => {
                          const scheduledDur = recordedTime ?? (slotEffectiveDuration(slot) > 0 ? formatDurationSec(slotEffectiveDuration(slot)) : null);
                          // Live: show Companion duration in amber with strikethrough of scheduled
                          if (isLive && lastPlaying?.durationSec) {
                            const actual = formatDurationSec(lastPlaying.durationSec);
                            return (
                              <>
                                <span className="text-amber-700 dark:text-amber-400">{actual}</span>
                                {scheduledDur && scheduledDur !== actual && (
                                  <span className="block text-xs text-muted-foreground line-through">{scheduledDur}</span>
                                )}
                              </>
                            );
                          }
                          // Post-live: show persisted or locally-overridden actual duration
                          if (effectiveActualDurationSec) {
                            const actual = formatDurationSec(effectiveActualDurationSec);
                            return (
                              <>
                                <span className="text-muted-foreground">{actual}</span>
                                {scheduledDur && scheduledDur !== actual && (
                                  <span className="block text-xs text-muted-foreground/60 line-through">{scheduledDur}</span>
                                )}
                              </>
                            );
                          }
                          return scheduledDur ?? "";
                        })()}
                      </td>
                      {/* שעת סיום */}
                      <td className="px-3 py-3 tabular-nums text-muted-foreground border-s-2 border-s-slate-300">{showChildTime ? endTime : ""}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
              {/* Cutoff banner at end of list */}
              {clampedCutoff === rows.length && (
                <tr>
                  <td colSpan={VISIBLE_COLS.length} className="px-0 py-0 border-y-2 border-orange-400 bg-orange-100 dark:border-orange-700 dark:bg-orange-950">
                    {cutoffBanner}
                  </td>
                </tr>
              )}
            </tbody>
            {totalSeconds > 0 && (
              <tfoot>
                <tr className="font-semibold">
                  <td className="sticky bottom-0 z-20 bg-muted px-3 py-3 tabular-nums border-t-2 border-border">{runningTime}</td>
                  <td colSpan={8} className="sticky bottom-0 z-20 bg-muted px-3 py-3 text-muted-foreground text-xs border-t-2 border-border">סה״כ</td>
                  <td className="sticky bottom-0 z-20 bg-muted px-3 py-3 tabular-nums border-t-2 border-border">{formatDurationSec(totalSeconds)}</td>
                  <td colSpan={VISIBLE_COLS.length - 10} className="sticky bottom-0 z-20 bg-muted border-t-2 border-border" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
