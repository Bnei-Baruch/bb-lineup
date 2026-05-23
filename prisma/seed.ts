import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

const dbPath = path.resolve(process.cwd(), "prisma/lineup.db");
const adapter = new PrismaLibSql({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const components = [
  // ─── Narrator ────────────────────────
  { name: "הודעת קריין לפני הכנה", category: "narrator", slotType: "narrator_announcement", sortOrder: 0, defaultNarratorScript: "חברים יקרים,\nנבקש מכל החברים להשתיק את המכשירים הניידים.\nחבר שהמכשיר שלו יצלצל במהלך השיעור מתבקש לצאת מהאולם עד לסיום השיעור." },
  { name: "הודעת קריין - רמקול", category: "narrator", slotType: "narrator_announcement", sortOrder: 1, defaultNarratorScript: "חברים יקרים,\nנבקש מכל החברים להתחשב בחברים שמסביב ולא לפתוח רמקול בקום רם בזמן קריאת המאמר" },
  { name: "הודעת קריין - אוזניות", category: "narrator", slotType: "narrator_announcement", sortOrder: 2, defaultNarratorScript: "כל מי שמקבל תרגום סימולטני מתבקש להכניס את שתי האוזניות ולהנמיך את הווליום, כדי לא להפריע לסובבים." },
  { name: "קריין - מעבר לחלק הבא", category: "narrator", slotType: "narrator_read", sortOrder: 3, defaultNarratorScript: "נעבור לחלק הבא של השיעור" },
  { name: "קריין - שיר ביחד", category: "narrator", slotType: "narrator_read", sortOrder: 4, defaultNarratorScript: "נעבור לחלק הבא של השיעור ולפני כן, נשיר ביחד שיר" },
  { name: "הכנה לשיעור", category: "narrator", slotType: "lesson_preparation", sortOrder: 5, defaultHasSubtitles: true, defaultHasWorkshopQuestions: true },

  // ─── Transition ──────────────────────
  { name: "מעברון בונים חברה רוחנית (כחול)", category: "transition", slotType: "transition", sortOrder: 0, defaultTransitionType: "bonim_chevra" },
  { name: "מעברון תלמוד עשר הספירות", category: "transition", slotType: "transition", sortOrder: 1, defaultTransitionType: "tes" },
  { name: "מעברון כתבי רב״ש", category: "transition", slotType: "transition", sortOrder: 2, defaultTransitionType: "rabash" },
  { name: "מעברון כתבי בעל הסולם", category: "transition", slotType: "transition", sortOrder: 3, defaultTransitionType: "baal_hasulam" },
  { name: "מעברון זוהר", category: "transition", slotType: "transition", sortOrder: 4, defaultTransitionType: "zohar" },
  { name: "מעברון לימוד בין חברים", category: "transition", slotType: "transition", sortOrder: 5, defaultTransitionType: "limud_bein_chaverim" },
  { name: "מעברון רגיל", category: "transition", slotType: "transition", sortOrder: 6, defaultTransitionType: "regular" },
  { name: "מעברון לימוד חברתי", category: "transition", slotType: "transition", sortOrder: 7, defaultTransitionType: "regular", defaultLabel: "מעברון לימוד חברתי" },

  // ─── Workshop ────────────────────────
  { name: "סדנת סיכום - 6 דקות", category: "workshop", slotType: "workshop", sortOrder: 0, defaultDurationMin: 6, defaultLabel: "סדנת סיכום" },
  { name: "סדנה אחרי קריאה", category: "workshop", slotType: "workshop", sortOrder: 1, defaultNarratorScript: "נסכם בעשירייה את הנקודות המרכזיות מתוך המאמר.", defaultNotes: "כתובית בלבד - ללא קריין" },

  // ─── Music ───────────────────────────
  { name: "אקפלה מניתוב", category: "music", slotType: "acapella", sortOrder: 0 },
  { name: "שיר מהניתוב", category: "music", slotType: "song", sortOrder: 1, defaultDurationMin: 3 },
  { name: "שקופית + ניגונים", category: "music", slotType: "slide_melodies", sortOrder: 2 },

  // ─── Headers ─────────────────────────
  { name: "חלק 1 / Part 1", category: "header", slotType: "part_header", sortOrder: 0, defaultPartNumber: 1 },
  { name: "חלק 2 / Part 2", category: "header", slotType: "part_header", sortOrder: 1, defaultPartNumber: 2 },
  { name: "חלק 3 / Part 3", category: "header", slotType: "part_header", sortOrder: 2, defaultPartNumber: 3 },

  // ─── Custom ──────────────────────────
  { name: "סגיר", category: "custom", slotType: "closing", sortOrder: 0 },
  { name: "הודעות לסיום", category: "custom", slotType: "narrator_read", sortOrder: 1, defaultLabel: "הודעות לסיום" },
];

async function main() {
  console.log("Seeding components...");
  for (const c of components) {
    await prisma.lineupComponent.upsert({
      where: { name: c.name },
      update: c,
      create: c,
    });
  }
  console.log(`Seeded ${components.length} components.`);

  // Seed initial series
  const series = [
    { name: "רב״ש", slug: "rabash", color: "purple", sortOrder: 0 },
    { name: "תע״ס", slug: "tes", color: "blue", sortOrder: 1 },
    { name: "זוהר לעם", slug: "zohar", color: "indigo", sortOrder: 2 },
    { name: "שיחות על הדרך", slug: "conversations", color: "violet", sortOrder: 3 },
    { name: "בונים חברה רוחנית", slug: "bonim-chevra", color: "green", sortOrder: 4 },
    { name: "לימוד בין חברים", slug: "limud-bein-chaverim", color: "emerald", sortOrder: 5 },
  ];

  console.log("Seeding series...");
  for (const s of series) {
    await prisma.series.upsert({
      where: { slug: s.slug },
      update: s,
      create: s,
    });
  }
  console.log(`Seeded ${series.length} series.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
