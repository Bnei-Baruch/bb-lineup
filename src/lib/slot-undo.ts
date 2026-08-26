import { SlotWithLesson } from "@/types";

export interface UndoAction {
  label: string;
  perform: () => void;
}

export function persistReorder(dayId: string, orderedIds: string[]) {
  return fetch("/api/slots/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dayId, orderedIds }),
  });
}

// Strips relation fields the slots API doesn't accept as create/update data.
export function slotCreatePayload(slot: SlotWithLesson): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...slot };
  delete payload.id;
  delete payload.lesson;
  delete payload.component;
  delete payload.studyMaterialSource;
  return payload;
}

function slotsEqual(a: SlotWithLesson, b: SlotWithLesson): boolean {
  return JSON.stringify(slotCreatePayload(a)) === JSON.stringify(slotCreatePayload(b));
}

// Diffs a single day's slot list before/after a mutation (add/edit/delete/clear/reorder/
// apply-template all produce a before/after pair) and returns an action that replays the
// inverse against the API. Only safe for same-day changes — a cross-day move must be
// reverted with a dayId PATCH instead, since diffing per-day would see it as delete+add
// and recreate the slot under a new id instead of moving the real one back.
// Note: recreated slots (undoing a delete/clear) get new ids — content is restored, not
// the original record identity.
export function buildSlotsUndo(
  dayId: string,
  oldSlots: SlotWithLesson[],
  newSlots: SlotWithLesson[],
  setSlots: (updater: (prev: SlotWithLesson[]) => SlotWithLesson[]) => void
): UndoAction | null {
  const oldById = new Map(oldSlots.map((s) => [s.id, s]));
  const newById = new Map(newSlots.map((s) => [s.id, s]));

  const added = newSlots.filter((s) => !oldById.has(s.id));
  const removed = oldSlots.filter((s) => !newById.has(s.id));
  const changed = newSlots.filter((s) => {
    const prev = oldById.get(s.id);
    return prev && !slotsEqual(prev, s);
  });
  const orderSame = oldSlots.length === newSlots.length && oldSlots.every((s, i) => s.id === newSlots[i]?.id);

  if (added.length === 0 && removed.length === 0 && changed.length === 0 && orderSame) return null;

  return {
    label: "בוצע שינוי בתוכן היום",
    perform: async () => {
      await Promise.all(added.map((s) => fetch(`/api/slots/${s.id}`, { method: "DELETE" })));

      const idMap = new Map<string, string>();
      for (const s of removed) {
        const res = await fetch("/api/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(slotCreatePayload(s)),
        });
        if (res.ok) idMap.set(s.id, (await res.json()).id);
      }

      await Promise.all(
        changed.map((s) =>
          fetch(`/api/slots/${s.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(slotCreatePayload(oldById.get(s.id)!)),
          })
        )
      );

      const restoredSlots = oldSlots.map((s) => {
        const newId = idMap.get(s.id);
        return newId ? { ...s, id: newId } : s;
      });
      setSlots(() => restoredSlots);
      await persistReorder(dayId, restoredSlots.map((s) => s.id));
    },
  };
}
