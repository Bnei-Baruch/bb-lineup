/** "חלק N" plus the chosen header-component name, when set — the one shared format used
 *  everywhere a LessonPart's title is displayed. The study.kli.one partType is intentionally
 *  not part of this string; it's shown as its own separate badge wherever parts are listed. */
export function partTitle(partNumber: number, componentName: string | null | undefined): string {
  return componentName ? `חלק ${partNumber} — ${componentName}` : `חלק ${partNumber}`;
}
