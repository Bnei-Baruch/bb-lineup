/** "חלק N: <type label>" — the one shared format used everywhere a LessonPart's title is
 *  displayed. The type label comes from study.kli.one's template catalog (src/lib/kli-client.ts);
 *  study-materials auto-populates a part's own title from the same chosen template, so this
 *  format is what will sync directly as that part's title. */
export function partTitle(partNumber: number, typeLabel: string | null | undefined): string {
  return typeLabel ? `חלק ${partNumber}: ${typeLabel}` : `חלק ${partNumber}`;
}
