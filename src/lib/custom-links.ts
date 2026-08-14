export interface CustomLink {
  name: string;
  url: string;
}

export function parseCustomLinks(json: string | null | undefined): CustomLink[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is CustomLink => !!l && typeof l.url === "string" && l.url.length > 0
    );
  } catch {
    return [];
  }
}

export function stringifyCustomLinks(links: CustomLink[]): string | null {
  const cleaned = links
    .map((l) => ({ name: l.name.trim(), url: l.url.trim() }))
    .filter((l) => l.url);
  return cleaned.length ? JSON.stringify(cleaned) : null;
}
