import { randomUUID } from "crypto";
import { prisma } from "./db";
import { computeCgpa } from "./academicStanding";
import { notifyUsers } from "./notifications";

// Associate Degree programs (Adeel prompt §32; HEC UG Education Policy v1.1, sections V–VI):
//  • a program is BS or ADP; an ADP feeds into a BS (same discipline → 5th semester, no deficiency courses;
//    different discipline → a bridging semester first); minimum CGPA 2.00 (the institute may set higher);
//  • exit from BS with an AD: at least 60 CH in at least 4 semesters, including the 30 CH of General Education, CGPA ≥ 2.00;
//    the degree keeps the subject the student first enrolled in. The Controller approves.
const db = prisma as unknown as Record<string, any>;
export const UGEP = { adpMinCh: 60, adpMaxCh: 72, minCgpa: 2.0, exitMinCh: 60, exitMinSemesters: 4, geCh: 30 };

export async function programs(chairmanId: string) {
  const progs = Array.from(new Set((await prisma.batch.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { degreeProgram: true } })).map((b) => b.degreeProgram))).sort();
  const kinds = ((await db.programKind?.findMany({ where: { chairmanId } }).catch(() => [])) || []) as { degreeProgram: string; kind: string; feedsInto: string | null; discipline: string | null }[];
  return progs.map((p) => ({ program: p, ...(kinds.find((k) => k.degreeProgram === p) || { kind: /^(adp|associate)/i.test(p) ? "ADP" : "BS", feedsInto: null, discipline: null }) }));
}
export async function setKind(chairmanId: string, degreeProgram: string, kind: string, feedsInto: string | null, discipline: string | null) {
  if (!db.programKind) throw new Error("Run prisma/migration_adeel_p9.sql in Supabase first.");
  await db.programKind.upsert({ where: { chairmanId_degreeProgram: { chairmanId, degreeProgram } }, create: { chairmanId, degreeProgram, kind, feedsInto, discipline }, update: { kind, feedsInto, discipline, updatedAt: new Date() } });
}

/** UGEP VI exit check for one BS student. */
export async function exitCheck(studentId: string, minCgpa = UGEP.minCgpa) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, name: true, rollNumber: true, batchId: true, batch: { select: { degreeProgram: true } } } });
  if (!st) return null;
  const [recs, courses, cgpa] = await Promise.all([
    prisma.studentTranscriptRecord.findMany({ where: { studentId }, select: { courseCode: true, creditHours: true, grade: true, termName: true, termYear: true } }),
    prisma.course.findMany({ where: { batchId: st.batchId }, select: { code: true, courseType: true } }),
    computeCgpa(studentId).catch(() => null),
  ]);
  const passed = recs.filter((r) => !/^(F|W|I|ABS)$/i.test(r.grade.trim()));
  const type = new Map(courses.map((c) => [c.code.trim().toUpperCase(), c.courseType]));
  const ch = passed.reduce((a, r) => a + (r.creditHours || 0), 0);
  const ge = passed.filter((r) => /general education/i.test(type.get(r.courseCode.trim().toUpperCase()) || "")).reduce((a, r) => a + (r.creditHours || 0), 0);
  const sems = new Set(recs.map((r) => `${r.termName} ${r.termYear}`)).size;
  const checks = [
    { label: `At least ${UGEP.exitMinCh} credit hours passed`, ok: ch >= UGEP.exitMinCh, value: `${ch} CH` },
    { label: `In at least ${UGEP.exitMinSemesters} semesters`, ok: sems >= UGEP.exitMinSemesters, value: `${sems} semesters` },
    { label: `Including ${UGEP.geCh} CH of General Education`, ok: ge >= UGEP.geCh, value: `${ge} CH` },
    { label: `CGPA at least ${minCgpa.toFixed(2)}`, ok: cgpa != null && cgpa >= minCgpa, value: cgpa != null ? cgpa.toFixed(2) : "—" },
  ];
  return { student: st, checks, ok: checks.every((c) => c.ok), subject: st.batch?.degreeProgram || "" };
}
export async function requestExit(user: { id: string }, studentId: string) {
  const c = await exitCheck(studentId);
  if (!c) throw new Error("Student not found.");
  if (!c.ok) throw new Error("The student doesn't meet the exit conditions yet.");
  const id = randomUUID();
  await db.exitAward.create({ data: { id, studentId, kind: "AD_EXIT", checkJson: JSON.stringify(c.checks), requestedById: user.id } });
  return id;
}
export async function decideExit(user: { id: string; extraRoles?: string[]; role: string }, id: string, approve: boolean, degreeNo: string) {
  if (!(user.extraRoles || []).includes("EXAM_CONTROLLER") && user.role !== "CHAIRMAN") throw new Error("The Controller of Examinations decides.");
  const a = await db.exitAward.findUnique({ where: { id } });
  if (!a || a.status !== "PENDING") throw new Error("Not pending.");
  await db.exitAward.update({ where: { id }, data: { status: approve ? "AWARDED" : "REFUSED", decidedById: user.id, decidedAt: new Date(), degreeNo: approve ? degreeNo.slice(0, 40) || null : null } });
  if (approve) await prisma.student.update({ where: { id: a.studentId }, data: { status: "GRADUATED" } }).catch(() => null);
  await notifyUsers([a.requestedById], { kind: "RESULT", title: approve ? "Associate Degree awarded on exit" : "Associate Degree exit refused", href: "/adp" }).catch(() => null);
}
/** Lateral entry ADP → BS (UGEP VI): placement and what is needed. */
export function lateralEntry(cgpa: number, sameDiscipline: boolean, minCgpa = UGEP.minCgpa) {
  if (cgpa < minCgpa) return { ok: false, text: `CGPA ${cgpa.toFixed(2)} is below ${minCgpa.toFixed(2)}.` };
  return { ok: true, text: sameDiscipline ? "Admit to the 5th semester of the BS, with no deficiency courses. Exempted courses are decided case by case (Transfer → suggested matches)." : "Different discipline: deficiency courses in a bridging semester first, then the 5th semester. The Program Lead picks the deficiency courses." };
}
