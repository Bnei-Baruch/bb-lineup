import { useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { SlotWithLesson, SLOT_TYPE_LABELS, TRANSITION_LABELS, SlotType, TransitionType, LESSON_SLOT_TYPES } from "@/types";

export const COLS = [
  { key: "time",     label: "שעות",       en: "Time",       cls: "sticky end-0 z-10", minWidth: 96,  sep: false },
  { key: "item",     label: "אייטם",       en: "Item",       cls: "",                  minWidth: 112, sep: true  },
  { key: "content",  label: "תוכן",        en: "Content",    cls: "",                  minWidth: 180, sep: true  },
  { key: "notes",    label: "הערות",       en: "Notes",      cls: "",                  minWidth: 120, sep: true  },
  { key: "material", label: "חומר לימוד",  en: "Study Mat.", cls: "",                  minWidth: 112, sep: true  },
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

export const Colgroup = ({ cols = COLS }: { cols?: readonly (typeof COLS)[number][] } = {}) => (
  <colgroup>
    {cols.map(c => <col key={c.key} style={{ width: `${c.minWidth}px` }} />)}
  </colgroup>
);

// Row highlight colors — a browser-local display preference (not saved to the
// lineup data), so a colleague viewing the same broadcast can mark rows for
// their own screen without affecting anyone else's view.
export const HIGHLIGHT_COLORS: Record<string, { bg: string; dot: string; label: string }> = {
  red:    { bg: "bg-red-100 dark:bg-red-500/30",       dot: "bg-red-500",    label: "אדום" },
  orange: { bg: "bg-orange-100 dark:bg-orange-500/30", dot: "bg-orange-500", label: "כתום" },
  yellow: { bg: "bg-yellow-100 dark:bg-yellow-500/30", dot: "bg-yellow-500", label: "צהוב" },
  green:  { bg: "bg-green-100 dark:bg-green-500/30",   dot: "bg-green-500",  label: "ירוק" },
  blue:   { bg: "bg-blue-100 dark:bg-blue-500/30",     dot: "bg-blue-500",   label: "כחול" },
  purple: { bg: "bg-purple-100 dark:bg-purple-500/30", dot: "bg-purple-500", label: "סגול" },
  pink:   { bg: "bg-pink-100 dark:bg-pink-500/30",     dot: "bg-pink-500",   label: "ורוד" },
  gray:   { bg: "bg-gray-200 dark:bg-gray-400/30",     dot: "bg-gray-500",   label: "אפור" },
};

export function RowColorPicker({ value, onChange }: { value: string | null; onChange: (color: string | null) => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (pos) { setPos(null); return; }
    const r = btnRef.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.min(r.right, window.innerWidth - 96) - 92 });
  }

  return (
    <div className="shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${value ? `${HIGHLIGHT_COLORS[value]?.dot} border-black/20 dark:border-white/40` : "border-foreground/40 bg-foreground/10 hover:bg-foreground/25 hover:border-foreground/70 dark:border-foreground/50 dark:bg-foreground/15 dark:hover:bg-foreground/30"}`}
        title="סמן שורה בצבע"
      />
      {pos && createPortal(
        // Portaled to document.body: the trigger sits inside a table cell
        // that's both `sticky` (own stacking context) and a descendant of a
        // `zoom`-scaled wrapper (the zoom controls) — either one turns a
        // "fixed" popover positioned in place into something still trapped
        // inside that ancestor, clipped/occluded by sibling rows. Rendering
        // outside the whole subtree is the only way to truly escape it.
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setPos(null); }} />
          <div
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-50 flex flex-wrap gap-1 p-1.5 rounded-md border border-border bg-popover shadow-md w-[92px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { onChange(null); setPos(null); }}
              className="h-4 w-4 rounded-full border border-border flex items-center justify-center text-[8px] leading-none text-muted-foreground hover:text-foreground"
              title="ללא צבע"
            >
              ✕
            </button>
            {Object.entries(HIGHLIGHT_COLORS).map(([key, c]) => (
              <button
                key={key}
                type="button"
                onClick={() => { onChange(key); setPos(null); }}
                className={`h-4 w-4 rounded-full ${c.dot} ${value === key ? "ring-2 ring-offset-1 ring-foreground" : ""}`}
                title={c.label}
              />
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

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

export function TableLink({ href, label, size = "sm" }: { href: string; label: string; size?: "sm" | "md" }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={label}
      className={`inline-block max-w-full truncate align-bottom px-2 py-1 rounded font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900 transition-colors ${size === "md" ? "text-sm" : "text-xs"}`}
    >
      {label}
    </a>
  );
}

const URL_SPLIT_REGEX = /(https?:\/\/\S+)/g;
const URL_TEST_REGEX = /^https?:\/\//;

/** Renders free text with any http(s) URLs turned into clickable links —
 *  notes are often used to paste a link when there's no dedicated field for it. */
export function linkifyText(text: string): React.ReactNode {
  if (!text) return text;
  return text.split(URL_SPLIT_REGEX).map((part, i) =>
    URL_TEST_REGEX.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-blue-600 hover:underline break-all dark:text-blue-400"
      >
        {part}
      </a>
    ) : (
      part
    )
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

const NARRATOR_SLOT_TYPES: SlotType[] = ["narrator_announcement", "narrator_read"];

export function itemLabel(slot: SlotWithLesson): string {
  if (slot.slotType === "part_header") {
    return `חלק ${slot.partNumber ?? "—"} / Part ${slot.partNumber ?? "—"}`;
  }
  // A lesson pulled from the library already shows its own title/reference in the
  // Content column — keep the Item column a plain type label so it doesn't duplicate it.
  if (LESSON_SLOT_TYPES.includes(slot.slotType as SlotType) && slot.lesson) {
    return SLOT_TYPE_LABELS[slot.slotType as SlotType];
  }
  // Article-reading always shows the plain item type (the Content column already
  // shows the specific article) — but a narrator slot's custom title, when set
  // (e.g. "מנחים"), is more useful than the generic "קריין" and should win.
  if (slot.slotType === "article_reading") {
    return SLOT_TYPE_LABELS["article_reading"];
  }
  if (NARRATOR_SLOT_TYPES.includes(slot.slotType as SlotType)) {
    return slot.label || SLOT_TYPE_LABELS[slot.slotType as SlotType];
  }
  // "אחר" (custom) components are a generic reusable bucket (e.g. named "שונות") —
  // the slot's own custom title is the specific, useful part, so it should win.
  if (slot.component?.category === "custom") {
    return slot.label || slot.component.name;
  }
  if (slot.component?.name) return slot.component.name;
  if (slot.label) return slot.label;
  if (slot.slotType === "transition" && slot.transitionType) {
    return `מעברון ${TRANSITION_LABELS[slot.transitionType as TransitionType] ?? slot.transitionType}`;
  }
  return SLOT_TYPE_LABELS[slot.slotType as SlotType] || slot.slotType;
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
    const main = slot.lessonPart ? `${slot.lesson.sourceRef} - חלק ${slot.lessonPart.partNumber}` : slot.lesson.sourceRef;
    return { main, sub: sourceSubline(src?.bookVolume, src?.bookPage) };
  }
  if (slot.mediaCode) return { main: slot.mediaCode, sub: "" };
  return { main: "", sub: "" };
}
