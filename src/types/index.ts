export type ApprovalStatus = "pending" | "approved";

/** Slot types whose duration comes from the linked lesson's video */
export const LESSON_SLOT_TYPES: SlotType[] = ["recorded_lesson", "conversations_on_way"];

export type SlotType =
  | "narrator_announcement"
  | "narrator_read"
  | "lesson_preparation"
  | "transition"
  | "article_reading"
  | "workshop"
  | "recorded_lesson"
  | "acapella"
  | "song"
  | "study_between_friends"
  | "building_spiritual_society"
  | "conversations_on_way"
  | "zohar_for_people"
  | "closing"
  | "slide_melodies"
  | "part_header"
  | "holiday_study"
  | "chevruta"
  | "group_study"
  | "management"
  | "custom";

export const SLOT_TYPE_LABELS: Record<SlotType, string> = {
  narrator_announcement: "הודעת קריין",
  narrator_read: "קריין",
  lesson_preparation: "הכנה לשיעור",
  transition: "מעברון",
  article_reading: "קריאת מאמר",
  workshop: "סדנה",
  recorded_lesson: "שיעור מוקלט",
  acapella: "אקפלה",
  song: "שיר",
  study_between_friends: "לימוד בין חברים",
  building_spiritual_society: "בונים חברה רוחנית",
  conversations_on_way: "שיחות על הדרך",
  zohar_for_people: "זוהר לעם",
  closing: "סגיר",
  slide_melodies: "שקופית + ניגונים",
  part_header: "כותרת חלק",
  holiday_study: "חומר לימוד",
  chevruta: "לימוד בחברותא",
  group_study: "לימוד קבוצתי",
  management: "הנהלה",
  custom: "פריט מותאם",
};

export const SLOT_TYPE_COLORS: Record<SlotType, string> = {
  narrator_announcement: "border-orange-300 bg-orange-50",
  narrator_read: "border-orange-400 bg-orange-50",
  lesson_preparation: "border-sky-300 bg-sky-50",
  transition: "border-slate-400 bg-slate-50",
  article_reading: "border-blue-400 bg-blue-50",
  workshop: "border-rose-400 bg-rose-50",
  recorded_lesson: "border-purple-400 bg-purple-50",
  acapella: "border-pink-300 bg-pink-50",
  song: "border-pink-400 bg-pink-50",
  study_between_friends: "border-emerald-400 bg-emerald-50",
  building_spiritual_society: "border-green-400 bg-green-50",
  conversations_on_way: "border-violet-400 bg-violet-50",
  zohar_for_people: "border-indigo-400 bg-indigo-50",
  closing: "border-gray-500 bg-gray-100",
  slide_melodies: "border-fuchsia-300 bg-fuchsia-50",
  part_header: "border-yellow-500 bg-yellow-100",
  holiday_study: "border-amber-400 bg-amber-50",
  chevruta: "border-green-400 bg-green-50",
  group_study: "border-teal-400 bg-teal-50",
  management: "border-cyan-500 bg-cyan-50",
  custom: "border-gray-400 bg-gray-50",
};

// Grouped for AddSlotMenu and ComponentForm
export const SLOT_TYPE_GROUPS: { label: string; types: SlotType[] }[] = [
  {
    label: "קריין והודעות",
    types: ["narrator_announcement", "narrator_read", "lesson_preparation"],
  },
  {
    label: "שיעור",
    types: ["article_reading", "recorded_lesson", "conversations_on_way", "zohar_for_people"],
  },
  {
    label: "תוכן חי",
    types: ["workshop", "study_between_friends", "building_spiritual_society", "management"],
  },
  {
    label: "מוזיקה ומעברונים",
    types: ["transition", "acapella", "song", "slide_melodies"],
  },
  {
    label: "מבנה",
    types: ["part_header", "closing", "holiday_study", "custom"],
  },
];

export type TransitionType =
  | "tes"
  | "rabash"
  | "bonim_chevra"
  | "baal_hasulam"
  | "zohar"
  | "limud_bein_chaverim"
  | "regular";

export const TRANSITION_LABELS: Record<TransitionType, string> = {
  tes: "תלמוד עשר הספירות",
  rabash: "כתבי רב״ש",
  bonim_chevra: "בונים חברה רוחנית",
  baal_hasulam: "כתבי בעל הסולם",
  zohar: "זוהר",
  limud_bein_chaverim: "לימוד בין חברים",
  regular: "רגיל",
};

export const COMPONENT_CATEGORIES = [
  { value: "narrator", label: "קריין והודעות" },
  { value: "transition", label: "מעברונים" },
  { value: "live_content", label: "תוכן חי" },
  { value: "workshop", label: "סדנה" },
  { value: "music", label: "מוזיקה" },
  { value: "header", label: "כותרות" },
  { value: "custom", label: "אחר" },
] as const;

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number]["value"];

export interface LessonSummary {
  id: string;
  sourceRef: string | null;
  articleSourceRef: string | null;
  narratorName: string | null;
  recordingDate: string | null;
  videoDurationSec: number | null;
  articleReadingMin: number | null;
  articleReadingSec: number | null;
  approvalStatus: string;
  tags: string | null;
  seriesId: string | null;
  kmPageLink: string | null;
  videoLink: string | null;
  articleSourceLink: string | null;
}

export interface SlotWithLesson {
  id: string;
  dayId: string;
  slotType: SlotType;
  sortOrder: number;
  label: string | null;
  durationSec: number | null;
  lessonId: string | null;
  lesson: LessonSummary | null;
  partNumber: number | null;
  narratorScript: string | null;
  transitionType: string | null;
  studyMaterialLink: string | null;
  studyMaterialSourceRef: string | null;
  studyMaterialSourceId: string | null;
  studyMaterialSource: { bookVolume: number | null; bookPage: number | null } | null;
  mediaCode: string | null;
  lineupLink: string | null;
  recordedLessonLink: string | null;
  startTimecode: string | null;
  endTimecode: string | null;
  openingWords: string | null;
  closingWords: string | null;
  hasSubtitles: boolean;
  hasWorkshopQuestions: boolean;
  language: string | null;
  chevrutaPartners: string | null;
  groupLeader: string | null;
  contactPerson: string | null;
  holidayTag: string | null;
  notes: string | null;
  componentId: string | null;
  component: { id: string; name: string; category: string } | null;
}

export interface DayWithSlots {
  id: string;
  lineupId: string;
  dayOfWeek: number;
  sessionIndex: number;
  sessionLabel: string | null;
  notes: string | null;
  broadcastStartTime: string | null;
  broadcastEndTime: string | null;
  contentStartIndex: number | null;
  contentCutoffIndex: number | null;
  slots: SlotWithLesson[];
}

export interface LineupWithDays {
  id: string;
  weekStart: string;
  notes: string | null;
  days: DayWithSlots[];
}

export interface SeriesSummary {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  currentArticleRef: string | null;
  currentLessonRef: string | null;
  currentPage: string | null;
}

export interface ComponentSummary {
  id: string;
  name: string;
  category: string;
  slotType: string;
  sortOrder: number;
  defaultLabel: string | null;
  defaultDurationSec: number | null;
  defaultNarratorScript: string | null;
  defaultTransitionType: string | null;
  defaultMediaCode: string | null;
}
