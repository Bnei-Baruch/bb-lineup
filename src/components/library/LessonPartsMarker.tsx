"use client";

import { useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Play, Scissors, Rewind, FastForward, CornerDownLeft } from "lucide-react";
import { secondsToTimecode, timecodeToSeconds } from "@/lib/timecodes";

export interface PartDraft {
  partNumber: number;
  startTimecode: string;
  endTimecode: string;
  broadcastDate: string;
  openingStatement: string;
  closingStatement: string;
  notes: string;
}

interface LessonPartsMarkerProps {
  videoLink: string | null;
  durationSec: number | null;
  transcriptionLink: string | null;
  parts: PartDraft[];
  onChange: (parts: PartDraft[]) => void;
}

const SEGMENT_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-fuchsia-500", "bg-rose-500", "bg-cyan-500",
];

function nextPartNumber(parts: PartDraft[]): number {
  return parts.reduce((max, p) => Math.max(max, p.partNumber), 0) + 1;
}

/** Lessons saved before the km-client fix may still have the old `kabbalahmedia.info/cdn/{id}`
 *  link, whose redirect sends Cross-Origin-Resource-Policy: same-origin — blocked by the browser
 *  as a cross-origin <video> subresource. The cdn subdomain redirects to the same file without it. */
function playableVideoSrc(link: string | null): string | null {
  if (!link) return null;
  const m = link.match(/^https:\/\/kabbalahmedia\.info\/cdn\/([A-Za-z0-9_-]+)/);
  return m ? `https://cdn.kabbalahmedia.info/${m[1]}` : link;
}

/** A Google Docs "edit" link embedded as its read-only /preview view, for showing the
 *  transcript (with the team's own timecode notes) next to the player while marking parts. */
function googleDocEmbedUrl(link: string | null): string | null {
  if (!link) return null;
  const m = link.match(/^https:\/\/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)/);
  return m ? `https://docs.google.com/document/d/${m[1]}/preview` : null;
}

export function LessonPartsMarker({ videoLink, durationSec, transcriptionLink, parts, onChange }: LessonPartsMarkerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [nativeDuration, setNativeDuration] = useState(0);
  const [jumpInput, setJumpInput] = useState("");

  const totalSec = durationSec || nativeDuration || 0;
  const playableSrc = playableVideoSrc(videoLink);
  const docEmbedSrc = googleDocEmbedUrl(transcriptionLink);

  function updatePart(index: number, patch: Partial<PartDraft>) {
    onChange(parts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function removePart(index: number) {
    onChange(parts.filter((_, i) => i !== index));
  }

  function addPartFromPlayhead() {
    const start = videoRef.current ? secondsToTimecode(Math.floor(videoRef.current.currentTime)) : "";
    onChange([...parts, { partNumber: nextPartNumber(parts), startTimecode: start, endTimecode: "", broadcastDate: "", openingStatement: "", closingStatement: "", notes: "" }]);
  }

  function markIn(index: number) {
    if (!videoRef.current) return;
    updatePart(index, { startTimecode: secondsToTimecode(Math.floor(videoRef.current.currentTime)) });
  }

  function markOut(index: number) {
    if (!videoRef.current) return;
    updatePart(index, { endTimecode: secondsToTimecode(Math.floor(videoRef.current.currentTime)) });
  }

  function seekTo(sec: number) {
    if (!videoRef.current || !isFinite(sec)) return;
    videoRef.current.currentTime = Math.max(0, sec);
  }

  function skip(deltaSec: number) {
    if (!videoRef.current) return;
    seekTo(videoRef.current.currentTime + deltaSec);
  }

  function handleJump() {
    if (!jumpInput.trim()) return;
    seekTo(timecodeToSeconds(jumpInput));
  }

  function handleStripClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!totalSec) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seekTo(ratio * totalSec);
  }

  const segments = useMemo(() => {
    if (!totalSec) return [];
    return parts.map((p, i) => {
      const start = p.startTimecode ? timecodeToSeconds(p.startTimecode) : null;
      const end = p.endTimecode ? timecodeToSeconds(p.endTimecode) : null;
      if (start == null) return null;
      const left = (start / totalSec) * 100;
      const width = end != null && end > start ? ((end - start) / totalSec) * 100 : 0.5;
      return { index: i, left, width, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] };
    });
  }, [parts, totalSec]);

  const playheadPct = totalSec ? Math.min(100, (currentTime / totalSec) * 100) : 0;

  return (
    <div className="space-y-3" dir="ltr">
      <div className={docEmbedSrc ? "grid grid-cols-1 lg:grid-cols-2 gap-3 items-start" : ""}>
        <div className="space-y-2">
          {videoLink ? (
            <>
              <video
                ref={videoRef}
                src={playableSrc ?? undefined}
                controls
                className="w-full rounded-md bg-black max-h-80"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setNativeDuration(e.currentTarget.duration)}
              />
              <div
                className="relative h-6 rounded-md bg-muted cursor-pointer select-none"
                onClick={handleStripClick}
              >
                {segments.map((s) =>
                  s ? (
                    <div
                      key={s.index}
                      className={`absolute top-0 h-full rounded-sm opacity-70 ${s.color}`}
                      style={{ left: `${s.left}%`, width: `${s.width}%` }}
                      title={`חלק ${parts[s.index].partNumber}`}
                    />
                  ) : null
                )}
                <div
                  className="absolute top-0 h-full w-0.5 bg-foreground"
                  style={{ left: `${playheadPct}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => skip(-60)} title="דלג דקה אחורה">
                  <Rewind className="h-3 w-3" /> 1 דק&apos;
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => skip(-10)} title="דלג 10 שניות אחורה">
                  -10 שנ&apos;
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => skip(-1)} title="דלג שנייה אחורה">
                  -1 שנ&apos;
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => skip(1)} title="דלג שנייה קדימה">
                  +1 שנ&apos;
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => skip(10)} title="דלג 10 שניות קדימה">
                  +10 שנ&apos;
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => skip(60)} title="דלג דקה קדימה">
                  <FastForward className="h-3 w-3" /> 1 דק&apos;
                </Button>

                <span className="text-xs text-muted-foreground tabular-nums px-1">
                  זמן נוכחי: {secondsToTimecode(Math.floor(currentTime))}
                </span>

                <div className="flex items-center gap-1 ms-auto">
                  <Input
                    value={jumpInput}
                    onChange={(e) => setJumpInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleJump(); } }}
                    placeholder="קפוץ ל HH:MM:SS"
                    className="h-7 w-32 text-xs"
                    dir="ltr"
                  />
                  <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={handleJump} title="קפוץ לזמן">
                    <CornerDownLeft className="h-3 w-3" /> קפוץ
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">אין קישור וידאו — הדבק קישור לשיעור למעלה כדי לנגן ולסמן חלקים לפי הווידאו, או הזן זמנים ידנית.</p>
          )}
        </div>

        {docEmbedSrc && (
          <div className="space-y-1">
            <iframe
              src={docEmbedSrc}
              className="w-full h-80 rounded-md border border-border"
              title="תמליל"
            />
            <p className="text-xs text-muted-foreground">
              תמליל — אם המסמך לא נטען, ודאו שההרשאה מוגדרת ל&quot;כל מי שיש לו את הקישור&quot;
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {parts.map((p, i) => (
          <div key={i} className="border border-border rounded-md p-2 bg-muted/20 space-y-1.5">
            <div className="flex flex-wrap items-end gap-2">
              <div className={`w-2 self-stretch rounded-sm ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`} />
              <span className="text-xs font-medium w-14 shrink-0">חלק {p.partNumber}</span>

              {videoLink && (
                <Button type="button" variant="ghost" size="icon" title="נגן מכאן" onClick={() => seekTo(timecodeToSeconds(p.startTimecode || "0"))}>
                  <Play className="h-3.5 w-3.5" />
                </Button>
              )}

              <div className="flex items-center gap-1">
                <Input value={p.startTimecode} onChange={(e) => updatePart(i, { startTimecode: e.target.value })} placeholder="IN" className="h-8 w-24 text-xs" dir="ltr" />
                {videoLink && (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => markIn(i)}>
                    <Scissors className="h-3 w-3" /> סמן התחלה
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-1">
                <Input value={p.endTimecode} onChange={(e) => updatePart(i, { endTimecode: e.target.value })} placeholder="OUT" className="h-8 w-24 text-xs" dir="ltr" />
                {videoLink && (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => markOut(i)}>
                    <Scissors className="h-3 w-3" /> סמן סיום
                  </Button>
                )}
              </div>

              <Input type="date" value={p.broadcastDate} onChange={(e) => updatePart(i, { broadcastDate: e.target.value })} className="h-8 w-36 text-xs" dir="ltr" />
              <Input value={p.notes} onChange={(e) => updatePart(i, { notes: e.target.value })} placeholder="הערות" className="h-8 flex-1 min-w-24 text-xs" dir="rtl" />

              <Button type="button" variant="ghost" size="icon" onClick={() => removePart(i)} className="text-destructive hover:text-destructive shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 ps-4">
              <Input
                value={p.openingStatement}
                onChange={(e) => updatePart(i, { openingStatement: e.target.value })}
                placeholder="דבר המתחיל"
                className="h-8 flex-1 min-w-32 text-xs"
                dir="rtl"
              />
              <Input
                value={p.closingStatement}
                onChange={(e) => updatePart(i, { closingStatement: e.target.value })}
                placeholder="דברי סיום"
                className="h-8 flex-1 min-w-32 text-xs"
                dir="rtl"
              />
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addPartFromPlayhead} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        {videoLink ? "הוסף חלק מכאן" : "הוסף חלק"}
      </Button>
    </div>
  );
}
