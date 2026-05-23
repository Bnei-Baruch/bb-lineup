"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Check, ChevronDown, ChevronUp, Send } from "lucide-react";
import { SLOT_TYPE_LABELS, SlotType } from "@/types";
import { formatDurationSec } from "@/lib/time";

interface RuleSet {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
}

interface PlannedSlot {
  slotType: string;
  componentId?: string;
  lessonId?: string;
  label?: string;
  durationSec?: number;
  partNumber?: number;
  transitionType?: string;
  startTimecode?: string;
  endTimecode?: string;
  notes?: string;
  narratorScript?: string;
}

interface PlannedDay {
  dayOfWeek: number;
  notes?: string;
  slots: PlannedSlot[];
}

interface PlanResult {
  days: PlannedDay[];
  reasoning: string;
  _usage?: { input_tokens: number; output_tokens: number };
}

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

interface Props {
  open: boolean;
  onClose: () => void;
  weekStart: string;
  ruleSets: RuleSet[];
  dayIds: Record<number, string>; // dayOfWeek -> dayId
}

export function PlanWeekDialog({ open, onClose, weekStart, ruleSets, dayIds }: Props) {
  const router = useRouter();
  const defaultRuleSet = ruleSets.find((r) => r.isDefault) ?? ruleSets[0];
  const [selectedRuleSetId, setSelectedRuleSetId] = useState(defaultRuleSet?.id ?? "");
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refinement, setRefinement] = useState("");

  function toggleDay(d: number) {
    setSelectedDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  function toggleExpand(d: number) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }

  async function handleGenerate() {
    if (!selectedRuleSetId) return;
    setLoading(true);
    setError(null);
    setPlan(null);
    setRefinement("");
    try {
      const res = await fetch("/api/ai/plan-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, ruleSetId: selectedRuleSetId, dayOfWeeks: selectedDays }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPlan(data);
      setExpandedDays(new Set(data.days.map((d: PlannedDay) => d.dayOfWeek)));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleRefine() {
    if (!plan || !refinement.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/plan-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          ruleSetId: selectedRuleSetId,
          dayOfWeeks: selectedDays,
          currentPlan: plan,
          refinement: refinement.trim(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPlan(data);
      setRefinement("");
      setExpandedDays(new Set(data.days.map((d: PlannedDay) => d.dayOfWeek)));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!plan) return;
    setSaving(true);
    setError(null);
    const failures: string[] = [];
    try {
      for (const day of plan.days) {
        const dayId = dayIds[day.dayOfWeek];
        if (!dayId) continue;
        for (const slot of day.slots) {
          const res = await fetch("/api/slots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dayId, ...slot }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => res.statusText);
            failures.push(`יום ${DAY_NAMES[day.dayOfWeek]} – ${slot.label ?? slot.slotType}: ${text}`);
          }
        }
      }
      router.refresh();
      if (failures.length > 0) {
        setError(`חלק מהפריטים לא נשמרו:\n${failures.join("\n")}`);
      } else {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="!max-w-[96vw] w-[96vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            תכנון לינאפ עם AI
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Rule set selection */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">תבנית תכנון</label>
            {ruleSets.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין תבניות — <a href="/settings/lineup-rules" className="text-blue-600 hover:underline">צור תבנית</a></p>
            ) : (
              <select
                value={selectedRuleSetId}
                onChange={(e) => setSelectedRuleSetId(e.target.value)}
                className="w-full text-sm border border-input rounded-md px-3 py-2 bg-background"
              >
                {ruleSets.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}{r.description ? ` — ${r.description}` : ""}</option>
                ))}
              </select>
            )}
          </div>

          {/* Day selection */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">ימים לתכנון</label>
            <div className="flex flex-wrap gap-2">
              {DAY_NAMES.map((name, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-3 py-1 rounded text-xs border transition-colors ${
                    selectedDays.includes(i)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Generated plan preview */}
          {plan && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">תכנית מוצעת</h3>
              </div>

              {plan.reasoning && (
                <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">{plan.reasoning}</p>
              )}

              {plan._usage && (
                <p className="text-[11px] text-muted-foreground text-end tabular-nums">
                  טוקנים: {plan._usage.input_tokens.toLocaleString()} קלט / {plan._usage.output_tokens.toLocaleString()} פלט
                  {" · "}~${(((plan._usage.input_tokens * 3) + (plan._usage.output_tokens * 15)) / 1_000_000).toFixed(4)}
                </p>
              )}

              {/* Refinement input */}
              <div className="flex gap-2">
                <input
                  value={refinement}
                  onChange={(e) => setRefinement(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleRefine()}
                  placeholder="שפר את התכנית... למשל: החלף את השיעור השני ביום שני"
                  className="flex-1 text-sm border border-input rounded-md px-3 py-1.5 bg-background"
                  dir="rtl"
                  disabled={loading}
                />
                <Button size="sm" onClick={handleRefine} disabled={loading || !refinement.trim()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>

              {plan.days.map((day) => {
                const expanded = expandedDays.has(day.dayOfWeek);
                const lessonSlots = day.slots.filter((s) => s.lessonId || ["recorded_lesson", "article_reading"].includes(s.slotType));
                return (
                  <div key={day.dayOfWeek} className="border border-border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleExpand(day.dayOfWeek)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-muted hover:bg-accent/50 text-sm font-medium"
                    >
                      <span>יום {DAY_NAMES[day.dayOfWeek]}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{day.slots.length} פריטים, {lessonSlots.length} תוכן</span>
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </button>

                    {expanded && (
                      <div className="divide-y divide-border">
                        {day.slots.map((slot, i) => {
                          const label = slot.label || SLOT_TYPE_LABELS[slot.slotType as SlotType] || slot.slotType;
                          return (
                            <div key={i} className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
                              <div className="min-w-0">
                                {slot.slotType === "part_header" ? (
                                  <span className="font-bold">חלק {slot.partNumber ?? "—"}</span>
                                ) : (
                                  <>
                                    <span className="font-medium">{label}</span>
                                    {slot.notes && <span className="block text-muted-foreground truncate">{slot.notes}</span>}
                                    {slot.startTimecode && <span className="text-muted-foreground tabular-nums"> {slot.startTimecode} → {slot.endTimecode}</span>}
                                  </>
                                )}
                              </div>
                              {slot.durationSec && (
                                <span className="tabular-nums text-muted-foreground shrink-0">
                                  {formatDurationSec(slot.durationSec)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          {!plan ? (
            <Button onClick={handleGenerate} disabled={loading || !selectedRuleSetId || selectedDays.length === 0}>
              {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Sparkles className="me-2 h-4 w-4" />}
              {loading ? "מתכנן..." : "צור תכנית"}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleGenerate} disabled={loading}>
                {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : "נסה שוב"}
              </Button>
              <Button onClick={handleApply} disabled={saving}>
                {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Check className="me-2 h-4 w-4" />}
                החל על הלינאפ
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
