import { randomUUID } from "crypto";
import { prisma } from "./db";
import { termIndex } from "./termLogic";
import { writeAuditLog } from "./audit";

// OBE goes by the TERM a course is taught, not by the batch's intake: with "OBE from Fall 2024", every course offered in
// Fall 2024 or later is an OBE course (CLOs, assessments mapped to CLOs, attainment) whichever batch takes it; courses
// taught earlier are grades-only (marks, grades, transcripts — no CLOs, not in attainment). Transcripts never change.
// No start term set = every course is OBE (as before).

const odb = prisma as unknown as Record<string, any>;
export type Term = { termName: string; termYear: number };
export const termLabel = (t: Term | null) => (t ? `${t.termName} ${t.termYear}` : "—");

/** The OBE start of the institute and of each program that set its own. */
export async function obeStarts(chairmanId: string) {
  const rows = ((await odb.obeStart.findMany({ where: { chairmanId } }).catch(() => [])) as (Term & { program: string; byName: string; at: Date })[]);
  return { institute: rows.find((r) => !r.program) || null, programs: rows.filter((r) => r.program) };
}
export async function setObeStart(chairmanId: string, program: string, t: Term | null, by: { id: string; name: string }) {
  const where = { chairmanId_program: { chairmanId, program } };
  if (!t) await odb.obeStart.delete({ where }).catch(() => null);
  else await odb.obeStart.upsert({ where, create: { id: randomUUID(), chairmanId, program, ...t, byId: by.id, byName: by.name }, update: { ...t, byId: by.id, byName: by.name, at: new Date() } });
  await writeAuditLog({ actorUserId: by.id, action: "OBE_START_SET", entityType: "Institute", entityId: chairmanId, metadata: { program: program || "(institute)", term: t ? termLabel(t) : "cleared" } }).catch(() => null);
}

type C = { id: string; semesterNumber: number | null; offeredTermName: string | null; offeredTermYear: number | null; batch: { degreeProgram: string; startTerm: string; startYear: number; coordinator: { managedById: string | null } } | null };
/** The term a course is (or was) taught: its offered term, else its batch's start term plus its semester. */
export function taughtTerm(c: Pick<C, "semesterNumber" | "offeredTermName" | "offeredTermYear" | "batch">): number | null {
  if (c.offeredTermName && c.offeredTermYear) return termIndex(c.offeredTermName, c.offeredTermYear);
  if (!c.batch || !c.semesterNumber) return null;
  return termIndex(c.batch.startTerm, c.batch.startYear) + c.semesterNumber - 1;
}

/** Of these courses, the ones that are grades-only (taught before the OBE start, or marked grades-only). */
export async function gradesOnlyCourses(courseIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(courseIds)).filter(Boolean);
  if (!ids.length) return out;
  const offs = ((await odb.obeCourseOff.findMany({ where: { courseId: { in: ids } } }).catch(() => [])) as { courseId: string; reason: string }[]);
  for (const o of offs) out.set(o.courseId, `marked grades-only: ${o.reason}`);
  const cs = (await prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, semesterNumber: true, offeredTermName: true, offeredTermYear: true, batch: { select: { degreeProgram: true, startTerm: true, startYear: true, coordinator: { select: { managedById: true } } } } } })) as C[];
  const chairmen = Array.from(new Set(cs.map((c) => c.batch?.coordinator.managedById).filter((x): x is string => !!x)));
  const starts = ((await odb.obeStart.findMany({ where: { chairmanId: { in: chairmen.concat("none") } } }).catch(() => [])) as (Term & { chairmanId: string; program: string })[]);
  for (const c of cs) {
    if (out.has(c.id) || !c.batch) continue;
    const cid = c.batch.coordinator.managedById;
    const s = starts.find((x) => x.chairmanId === cid && x.program === c.batch!.degreeProgram) || starts.find((x) => x.chairmanId === cid && !x.program);
    if (!s) continue;
    const t = taughtTerm(c);
    if (t !== null && t < termIndex(s.termName, s.termYear)) out.set(c.id, `taught before OBE (from ${termLabel(s)})`);
  }
  return out;
}

/** For a batch: which semesters were taught before OBE (for the "evidence from S3 onward" note). */
export async function batchObeNote(batchId: string) {
  const b = await prisma.batch.findUnique({ where: { id: batchId }, select: { degreeProgram: true, startTerm: true, startYear: true, coordinator: { select: { managedById: true } } } });
  if (!b?.coordinator.managedById) return null;
  const { institute, programs } = await obeStarts(b.coordinator.managedById);
  const s = programs.find((p) => p.program === b.degreeProgram) || institute;
  if (!s) return null;
  const first = termIndex(s.termName, s.termYear) - termIndex(b.startTerm, b.startYear) + 1; // first OBE semester of this batch
  if (first <= 1) return null;
  return { firstObeSemester: first, start: termLabel(s), text: `PLO evidence from S${first} (${termLabel(s)}) onward — S1–S${first - 1} were taught before OBE (grades only).` };
}
