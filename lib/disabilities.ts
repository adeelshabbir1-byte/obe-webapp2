import { prisma } from "./db";
import { rdb, type Who } from "./registers";

// Students with disabilities (HEC Policy for Students with Disabilities, 2021). The register is confidential: the
// disability focal person (the members of the Disability committee), Student Affairs and the institute head keep it.
// The exam office (Controller of Examinations, OMC) and a student's current teachers see only the accommodations.

export const DIS_HINT = "The disability register needs prisma/migration_disabilities.sql — run it in Supabase.";
export const CATEGORIES = ["Visual impairment", "Hearing impairment", "Physical / mobility", "Learning difficulty (e.g. dyslexia)", "Chronic illness", "Mental health", "Speech", "Other"];
export type Rec = { studentId: string; chairmanId: string; category: string; details: string | null; extraTimePct: number; seating: string | null; materials: string | null; assistive: string | null; other: string | null; validUntil: Date | null; verified: boolean; updatedAt: Date };

export async function keepsRegister(w: Who) {
  if (w.head || w.affairs) return true;
  return !!(await rdb.committeeMember.findFirst({ where: { userId: w.id, toDate: null, committeeId: { in: ((await rdb.committee.findMany({ where: { chairmanId: w.chairmanId, kind: "DISABILITY" }, select: { id: true } }).catch(() => [])) as { id: string }[]).map((c) => c.id).concat(["none"]) } } }).catch(() => null));
}
export const examOffice = (w: Who) => w.exam; // the Controller of Examinations (and exam branch) — not the OMC
export const accommodationText = (r: Rec) => [r.extraTimePct ? `${r.extraTimePct}% extra time in exams` : "", r.seating ? `seating: ${r.seating}` : "", r.materials ? `materials: ${r.materials}` : "", r.assistive ? `assistive: ${r.assistive}` : "", r.other || ""].filter(Boolean).join("; ") || "—";

/** Students whose accommodations this person may see: all of them for the exam office and register keepers; else the students of their current courses. */
export async function visibleAccommodations(w: Who) {
  const recs = (await rdb.disabilityRecord.findMany({ where: { chairmanId: w.chairmanId } }).catch(() => null)) as Rec[] | null;
  if (recs === null) return null;
  const live = recs.filter((r) => !r.validUntil || new Date(r.validUntil) >= new Date());
  if (examOffice(w) || (await keepsRegister(w))) return { recs: live, courses: new Map<string, string[]>() };
  const enr = await prisma.studentEnrollment.findMany({ where: { studentId: { in: live.map((r) => r.studentId).concat(["none"]) }, status: "ACTIVE", course: { isOffered: true, OR: [{ instructorId: w.id }, { sectionAssignments: { some: { instructorId: w.id } } }] } }, select: { studentId: true, course: { select: { code: true } } } });
  const courses = new Map<string, string[]>(); for (const e of enr) courses.set(e.studentId, [...(courses.get(e.studentId) || []), e.course.code]);
  return { recs: live.filter((r) => courses.has(r.studentId)), courses };
}
