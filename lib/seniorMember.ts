/** Picks the "senior" member of a combined (equivalence) group — the member
 * whose batch is furthest along in the degree (highest semester number,
 * then the earliest start year). A combined class is shown under that
 * member's course code and title everywhere the Assigner sees it, so the
 * row reads like a normal course instead of an internal group name. */
type MemberLike = { course: { semesterNumber: number | null; batch?: { startYear: number } | null } };

export function seniorMember<T extends MemberLike>(members: T[]): T | undefined {
  return [...members].sort((a, b) =>
    (b.course.semesterNumber ?? 0) - (a.course.semesterNumber ?? 0) ||
    (a.course.batch?.startYear ?? 9999) - (b.course.batch?.startYear ?? 9999),
  )[0];
}
