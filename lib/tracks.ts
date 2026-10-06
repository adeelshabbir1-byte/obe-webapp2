/** Curriculum tracks. A student follows exactly one track; a course either
 * belongs to every track (trackName = null) or to a single named track.
 * A track's semester plan is therefore "courses for everyone" plus "courses
 * for that track" — which is how a substitution is expressed: mark the
 * original course "Non-Medical" and its replacement "Pre-Medical". */
export const DEFAULT_TRACK = "Non-Medical";
export const TRACKS = ["Non-Medical", "Pre-Medical"] as const;

/** Does a student on `studentTrack` take a course whose trackName is `courseTrack`? */
export function courseAppliesToTrack(courseTrack: string | null | undefined, studentTrack: string | null | undefined): boolean {
  if (!courseTrack) return true;
  return courseTrack === (studentTrack || DEFAULT_TRACK);
}

/** Normalise free text coming from a form/upload to a known track name. */
export function normalizeTrack(raw: unknown): string {
  const t = String(raw ?? "").trim().toLowerCase();
  if (!t) return DEFAULT_TRACK;
  if (t.startsWith("pre") || t.startsWith("med")) return "Pre-Medical";
  return DEFAULT_TRACK;
}
