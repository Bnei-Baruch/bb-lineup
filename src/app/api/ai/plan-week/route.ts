import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { formatDurationSec } from "@/lib/time";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
  const { weekStart, ruleSetId, dayOfWeeks, currentPlan, refinement } = await req.json();
  // dayOfWeeks: number[] — which days to plan (0=Sun..6=Sat), default all

  // ── Load rule set ──────────────────────────────────────────────────────────
  const ruleSet = await prisma.lineupRuleSet.findUnique({ where: { id: ruleSetId } });
  if (!ruleSet) return NextResponse.json({ error: "Rule set not found" }, { status: 404 });

  const dayTemplate: { type: string; componentId?: string; slotType?: string; label?: string }[] = (() => {
    try { const p = JSON.parse(ruleSet.dayTemplate || "[]"); return Array.isArray(p) ? p : []; } catch { return []; }
  })();
  const preferredSeriesIds: string[] = (() => {
    try { const p = JSON.parse(ruleSet.preferredSeriesIds || "[]"); return Array.isArray(p) ? p : []; } catch { return []; }
  })();

  // ── Load components referenced in template ─────────────────────────────────
  const componentIds = dayTemplate.filter((t) => t.componentId).map((t) => t.componentId!);
  const components = await prisma.lineupComponent.findMany({
    where: componentIds.length > 0 ? { id: { in: componentIds } } : {},
    select: { id: true, name: true, slotType: true, defaultDurationSec: true, defaultLabel: true },
  });
  const componentMap = Object.fromEntries(components.map((c) => [c.id, c]));

  // ── Load available lessons ─────────────────────────────────────────────────
  const whereClause = preferredSeriesIds.length > 0
    ? { approvalStatus: "approved", seriesId: { in: preferredSeriesIds } }
    : { approvalStatus: "approved" };

  const lessons = await prisma.lesson.findMany({
    where: whereClause,
    orderBy: [{ seriesId: "asc" }, { recordingDate: "asc" }],
    select: {
      id: true,
      sourceRef: true,
      recordingDate: true,
      videoDurationSec: true,
      narratorName: true,
      seriesId: true,
      series: { select: { name: true } },
      articleSourceRef: true,
      articleSourceLink: true,
      articleReadingSec: true,
      articleWordCount: true,
      kmPageLink: true,
    },
    take: 100,
  });

  // ── Load existing slots this week to avoid re-scheduling ──────────────────
  const ws = new Date(weekStart);
  const lineup = await prisma.lineup.findUnique({
    where: { weekStart: ws },
    include: { days: { include: { slots: { select: { lessonId: true, dayId: true } } } } },
  });
  const scheduledLessonIds = new Set(
    lineup?.days.flatMap((d) => d.slots.map((s) => s.lessonId).filter(Boolean)) ?? []
  );
  const unscheduledLessons = lessons.filter((l) => !scheduledLessonIds.has(l.id));

  // ── Load series for context ────────────────────────────────────────────────
  const series = await prisma.series.findMany({
    where: preferredSeriesIds.length > 0 ? { id: { in: preferredSeriesIds } } : {},
    select: { id: true, name: true },
  });

  // ── Article reading durations from DB (pre-calculated on library save) ────
  const articleDurationMap: Record<string, number> = {};
  for (const l of unscheduledLessons) {
    if ((l as { articleReadingSec?: number | null }).articleReadingSec) {
      articleDurationMap[l.id] = (l as { articleReadingSec: number }).articleReadingSec;
    }
  }

  // ── Build prompt context ───────────────────────────────────────────────────
  const daysToplan = dayOfWeeks ?? [0, 1, 2, 3, 4, 5, 6];
  const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

  const templateDesc = dayTemplate.map((t, i) => {
    if (t.type === "fixed" && t.componentId) {
      const c = componentMap[t.componentId];
      return `  ${i + 1}. [קבוע] ${c?.name ?? t.componentId} (${c?.slotType ?? ""}) משך: ${c?.defaultDurationSec ? formatDurationSec(c.defaultDurationSec) : "לא ידוע"}`;
    }
    if (t.type === "lesson") return `  ${i + 1}. [שיעור מוקלט] — בחר שיעור מהספרייה (lessonId חובה)`;
    if (t.type === "article") return `  ${i + 1}. [קריאת מאמר] — בחר שיעור שיש לו מאמר (חובה לכלול lessonId של השיעור שממנו קוראים)`;
    return `  ${i + 1}. [${t.slotType ?? t.type}] ${t.label ?? ""}`;
  }).join("\n");

  const lessonsDesc = unscheduledLessons.slice(0, 50).map((l, i) => {
    const articleDur = articleDurationMap[l.id];
    const videoPart = `וידאו: ${l.videoDurationSec ? formatDurationSec(l.videoDurationSec) : "לא ידוע"}`;
    const articlePart = l.articleSourceRef
      ? ` | מאמר: "${l.articleSourceRef.split("|").pop()?.trim() ?? l.articleSourceRef}" קריאה: ${articleDur ? formatDurationSec(articleDur) : "לא ידוע"}`
      : " | אין מאמר";
    return `  ${i + 1}. id:${l.id} | "${l.sourceRef ?? "ללא שם"}" | סדרה: ${l.series?.name ?? "ללא"} | ${videoPart}${articlePart} | תאריך: ${l.recordingDate?.toString().slice(0, 10) ?? "לא ידוע"}`;
  }).join("\n");

  const constraints = [
    `שעת שידור: ${ruleSet.broadcastStartTime}`,
    ruleSet.targetDurationSec ? `משך יעד: ${formatDurationSec(ruleSet.targetDurationSec)}` : null,
    ruleSet.hardMaxDurationSec ? `מקסימום קשיח: ${formatDurationSec(ruleSet.hardMaxDurationSec)}` : null,
    ruleSet.maxLessonDurationSec ? `מקסימום שיעור ביום: ${formatDurationSec(ruleSet.maxLessonDurationSec)}` : null,
    ruleSet.splitLongLessons ? "שיעורים ארוכים: פצל בין ימים (שמור timecodes)" : "אין פיצול שיעורים",
    ruleSet.extraInstructions,
  ].filter(Boolean).join("\n");

  // ── Mock mode (set MOCK_AI=1 to skip API call) ────────────────────────────
  if (process.env.MOCK_AI === "1") {
    const mockPlan = {
      reasoning: "Mock plan for testing — using first available lesson for each day",
      days: daysToplan.map((d: number) => {
        let lessonIdx = d * dayTemplate.filter(t => t.type === "lesson").length;
        return {
          dayOfWeek: d,
          slots: dayTemplate.map((t) => {
            if (t.type === "fixed" && t.componentId) {
              const c = componentMap[t.componentId];
              return { slotType: c?.slotType ?? "custom", componentId: t.componentId, label: c?.name, durationSec: c?.defaultDurationSec ?? 300 };
            }
            if (t.type === "lesson") {
              const lesson = unscheduledLessons[lessonIdx++ % Math.max(unscheduledLessons.length, 1)];
              return lesson ? { slotType: "recorded_lesson", lessonId: lesson.id, durationSec: lesson.videoDurationSec ?? 3600 } : { slotType: "recorded_lesson", label: "שיעור" };
            }
            if (t.type === "article") {
              return { slotType: "article_reading", label: "קריאת מאמר", durationSec: 600 };
            }
            return { slotType: t.slotType ?? "custom", label: t.label };
          }).filter(Boolean),
        };
      }),
    };
    return NextResponse.json(mockPlan);
  }

  // ── Call Claude ────────────────────────────────────────────────────────────
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    tools: [
      {
        name: "create_week_plan",
        description: "Create a structured weekly lineup plan as JSON",
        input_schema: {
          type: "object" as const,
          properties: {
            days: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  dayOfWeek: { type: "number", description: "0=Sun, 6=Sat" },
                  notes: { type: "string" },
                  slots: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        slotType: { type: "string" },
                        componentId: { type: "string" },
                        lessonId: { type: "string" },
                        label: { type: "string" },
                        durationSec: { type: "number" },
                        partNumber: { type: "number" },
                        transitionType: { type: "string" },
                        startTimecode: { type: "string" },
                        endTimecode: { type: "string" },
                        notes: { type: "string" },
                        narratorScript: { type: "string" },
                      },
                      required: ["slotType"],
                    },
                  },
                },
                required: ["dayOfWeek", "slots"],
              },
            },
            reasoning: { type: "string", description: "Brief explanation of choices made" },
          },
          required: ["days", "reasoning"],
        },
      },
    ],
    tool_choice: { type: "any" },
    messages: refinement && currentPlan ? [
      {
        role: "user",
        content: `אתה עוזר לתכנן לינאפ שבועי לשיעורי קבלה.

## שיעורים זמינים
${lessonsDesc || "אין שיעורים זמינים"}

## התכנית הנוכחית
\`\`\`json
${JSON.stringify(currentPlan.days, null, 2)}
\`\`\`

## בקשת שינוי
${refinement}

החזר את התכנית המעודכנת בשלמותה עם השינויים המבוקשים. שמור על כל הפריטים שלא ביקשתי לשנות.
פריטי [קריאת מאמר] חייבים לכלול lessonId של השיעור שממנו קוראים, ו-durationSec לפי עמודת "קריאה" ברשימת השיעורים.`,
      },
    ] : [
      {
        role: "user",
        content: `אתה עוזר לתכנן לינאפ שבועי לשיעורי קבלה. תפקידך לבנות לינאפ יומי לפי התבנית והמגבלות הנתונות.

## סדרות זמינות
${series.map((s) => `- ${s.name} (id: ${s.id})`).join("\n") || "אין"}

## שיעורים זמינים (לא משובצים עדיין)
${lessonsDesc || "אין שיעורים זמינים"}

## תבנית יום
${templateDesc || "אין תבנית — בנה לפי שיקול דעתך"}

## מגבלות
${constraints}

## ימים לתכנון
${daysToplan.map((d: number) => DAY_NAMES[d]).join(", ")}

## הוראות
- בנה לינאפ לכל יום לפי התבנית — **כל פריט בתבנית חייב להופיע בפלט, בדיוק באותו סדר**
- תבנית עם ${dayTemplate.filter(t => t.type === "lesson").length} פריטי [שיעור מוקלט] → חייב להיות ${dayTemplate.filter(t => t.type === "lesson").length} שיעורים שונים בכל יום
- שבץ שיעור **שונה** לכל פריט [שיעור מוקלט] — אל תשים אותו שיעור פעמיים
- שבץ שיעורים מתוך הרשימה הזמינה — השתמש ב-lessonId המדויק
- עבור פריטי [קריאת מאמר]: חובה לכלול lessonId של השיעור שממנו קוראים; השתמש בעמודת "קריאה: HH:MM:SS" כ-durationSec
- אם שיעור ארוך מהמקסימום היומי — פצל על פני ימים עם startTimecode/endTimecode
- שמור על סדר הסדרה (לפי סדר ברשימה)
- סמן חלקי יום עם part_header ו-partNumber
- החזר slots לכל יום לפי הסדר הנכון

## חישוב משך יומי
לכל יום, חשב את סך כל הפריטים:
- פריט קבוע: משתמש במשך הנתון בתבנית
- שיעור מוקלט: משתמש ב"וידאו: HH:MM:SS" מהרשימה (או החלק בלבד אם יש timecodes)
- קריאת מאמר: משתמש ב"קריאה: HH:MM:SS" מהרשימה
שידור מתחיל ב-${ruleSet.broadcastStartTime}${ruleSet.targetDurationSec ? ` — יעד לסיום: ${formatDurationSec(ruleSet.targetDurationSec)} לאחר תחילת השידור` : ""}${ruleSet.hardMaxDurationSec ? ` — מקסימום קשיח: ${formatDurationSec(ruleSet.hardMaxDurationSec)}` : ""}
בחר שיעורים כך שסך המשכים יתאים ליעד. אם שיעור ארוך מדי — השתמש ב-startTimecode/endTimecode לחיתוך.`,
      },
    ],
  });

  // Extract tool result
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ error: "AI did not return a plan" }, { status: 500 });
  }

  // Post-process: fill durationSec from actual DB data (lessons + components)
  const lessonMap = Object.fromEntries(lessons.map((l) => [l.id, l]));
  const toSec = (tc: string) => { const p = tc.split(":").map(Number); return (p[0] ?? 0) * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0); };
  const plan = toolUse.input as { days: { dayOfWeek: number; slots: Record<string, unknown>[] }[]; reasoning: string };
  const LESSON_SLOT_TYPES = ["recorded_lesson", "conversations_on_way"];
  for (const day of plan.days ?? []) {
    for (const slot of day.slots ?? []) {
      const slotType = slot.slotType as string;
      const lessonId = slot.lessonId as string | undefined;
      const componentId = slot.componentId as string | undefined;
      if (LESSON_SLOT_TYPES.includes(slotType) && lessonId && lessonMap[lessonId]) {
        const lesson = lessonMap[lessonId];
        const start = slot.startTimecode as string | undefined;
        const end = slot.endTimecode as string | undefined;
        if (start && end) {
          const dur = toSec(end) - toSec(start);
          slot.durationSec = dur > 0 ? dur : (lesson.videoDurationSec ?? null);
        } else {
          slot.durationSec = lesson.videoDurationSec ?? null;
        }
      } else if (slotType === "article_reading") {
        // use pre-fetched article duration if available; otherwise clear any wrong AI value
        const linkedLesson = lessonId ? lessonMap[lessonId] : null;
        const prefetched = linkedLesson ? articleDurationMap[linkedLesson.id] : null;
        slot.durationSec = prefetched ?? null;
      } else if (componentId && componentMap[componentId]) {
        slot.durationSec = slot.durationSec ?? componentMap[componentId].defaultDurationSec ?? null;
      }
    }
  }

  return NextResponse.json({ ...plan, _usage: response.usage });
  } catch (e: unknown) {
    console.error("[plan-week] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
