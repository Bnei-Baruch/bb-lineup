const KLI_BASE = "https://study.kli.one";

export interface KliTemplate {
  id: string;
  translations: Record<string, string>; // keyed by language code, e.g. "he", "en"
  visible: boolean;
}

/** The 22-ish content-type categories study.kli.one's own study platform uses (tes, zohar,
 *  live, recorded, ...). Slow-changing reference data, cached for a day like km-client.ts's
 *  fetchSourceTree. */
export async function fetchTemplates(): Promise<KliTemplate[]> {
  const res = await fetch(`${KLI_BASE}/api/templates`, { next: { revalidate: 86400 } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.templates ?? [];
}

/** Resolve a stored template id to its label in the given language — falls back to the raw id
 *  if the list couldn't be fetched or no longer contains it (e.g. renamed upstream), so a part
 *  that already has a type set never silently loses its badge. */
export function templateLabel(templates: KliTemplate[], id: string | null | undefined, lang: string = "he"): string | null {
  if (!id) return null;
  return templates.find((t) => t.id === id)?.translations[lang] ?? id;
}
