import { SlotWithLesson, SLOT_TYPE_LABELS, TRANSITION_LABELS, SlotType, TransitionType } from "@/types";

export const COLS = [
  { key: "time",     label: "שעות",       en: "Time",       cls: "sticky end-0 z-10", minWidth: 96,  sep: false },
  { key: "item",     label: "אייטם",       en: "Item",       cls: "",                  minWidth: 112, sep: true  },
  { key: "content",  label: "תוכן",        en: "Content",    cls: "",                  minWidth: 180, sep: true  },
  { key: "notes",    label: "הערות",       en: "Notes",      cls: "",                  minWidth: 120, sep: true  },
  { key: "material", label: "חומר לימוד",  en: "Study Mat.", cls: "",                  minWidth: 96,  sep: true  },
  { key: "recorded", label: "שיעור מוקלט", en: "Recorded",   cls: "",                  minWidth: 80,  sep: true  },
  { key: "startTc",  label: "החל מדקה",    en: "From TC",    cls: "",                  minWidth: 76,  sep: true  },
  { key: "opening",  label: "דבר המתחיל",  en: "Opening",    cls: "",                  minWidth: 140, sep: true  },
  { key: "endTc",    label: "עד דקה",      en: "To TC",      cls: "",                  minWidth: 76,  sep: true  },
  { key: "closing",  label: "דברי סיום",   en: "Closing",    cls: "",                  minWidth: 140, sep: true  },
  { key: "recTime",  label: "משך",         en: "Duration",   cls: "",                  minWidth: 72,  sep: true  },
  { key: "endTime",  label: "שעת סיום",    en: "End Time",   cls: "",                  minWidth: 72,  sep: true  },
  { key: "subs",     label: "כתוביות",     en: "Subs",       cls: "text-center",       minWidth: 64,  sep: true  },
  { key: "workshop", label: "סדנה",        en: "Workshop",   cls: "text-center",       minWidth: 56,  sep: true  },
  { key: "lang",     label: "שפה",         en: "Lang",       cls: "",                  minWidth: 56,  sep: true  },
] as const;

export const TABLE_MIN_WIDTH = COLS.reduce((sum, c) => sum + c.minWidth, 0);
// table-layout:fixed only respects `width` on <col>, not minWidth.
// width:100% + minWidth on the table lets it fill the container but never shrink below its natural width.
export const TABLE_STYLE: React.CSSProperties = { tableLayout: "fixed", width: "100%", minWidth: `${TABLE_MIN_WIDTH}px` };

export const Colgroup = () => (
  <colgroup>
    {COLS.map(c => <col key={c.key} style={{ width: `${c.minWidth}px` }} />)}
  </colgroup>
);

export const SLOT_ROW_COLORS: Partial<Record<string, string>> = {
  recorded_lesson: "border-s-purple-400",
  article_reading: "border-s-green-400",
  transition:      "border-s-gray-300",
  narrator:        "border-s-blue-300",
  workshop:        "border-s-orange-400",
  live_content:    "border-s-teal-400",
  song:            "border-s-pink-400",
  acapella:        "border-s-pink-300",
};

export function TableLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
    >
      {label}
    </a>
  );
}

export function timeToSec(hhmm: string): number {
  const parts = hhmm.split(":").map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

export function secToHHMMSS(totalSec: number): string {
  const sec = ((totalSec % 86400) + 86400) % 86400;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function itemLabel(slot: SlotWithLesson): string {
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

export function sourceSubline(vol: number | null | undefined, page: number | null | undefined): string {
  const parts = [vol ? `כרך ${vol}` : null, page ? `עמוד ${page}` : null].filter(Boolean);
  return parts.join(" · ");
}

export function contentText(slot: SlotWithLesson): { main: string; sub: string } {
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
