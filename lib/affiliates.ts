import crypto from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { universityOf, collegesOf } from "./curriculumLibrary";
import { copyCourseContent } from "./benchmarkCopy";
import { refreshInstructorCopy, ensureInstructorCopy } from "./instructorCopy";

// Affiliated colleges follow their university.
// 1. No Subject Expert and no OMC at a college: the university's Subject Expert designs each course (CLOs, PLO mapping,
//    lecture plan, assessments plan, paper blueprint) and the college takes that design as it is; its teachers work
//    like normal instructors. The university's OMC looks after its colleges' courses too.
// 2. Marks distribution set by the university: for each assessment head (Quiz, Assignment, Midterm, Final, Lab,
//    Project …) its share and who enters it — the college's teacher or the university (e.g. the final it conducts).
//    Per college and per course, with a default for all colleges.

export const adb = prisma as unknown as Record<string, any>;
export const AFFILIATE_HINT = "Affiliated-college tables are not set up yet — run the latest migration (System Health → Run migrations).";
export const HEADS = ["Quiz", "Assignment", "Midterm", "Final", "Lab", "Project"] as const;
export type Head = { type: string; pct: number; by: "COLLEGE" | "UNIVERSITY" };
export type Policy = { id: string; universityId: string; collegeId: string | null; courseKey: string | null; headsJson: string; updatedAt: Date };
const norm = (t: string) => t.trim().toLowerCase();
export const courseKeyOf = (c: { code: string; title: string }) => `${c.code.trim().toUpperCase()}`;

// ---------------------------------------------------------------- 1. roles
/** The university an institute is affiliated to (null when it is a university or stands alone). */
export const collegeUniversity = (chairmanId: string | null | undefined) => universityOf(chairmanId);

/** Refusal when a college tries to make a Subject Expert or an OMC member. */
export async function collegeRoleBlock(chairmanId: string | null | undefined, role: string): Promise<string | null> {
  if (role !== "SUBJECT_EXPERT" && role !== "OMC") return null;
  const uni = await universityOf(chairmanId);
  if (!uni) return null;
  const u = await prisma.user.findUnique({ where: { id: uni }, select: { instituteName: true, name: true } });
  const name = u?.instituteName || u?.name || "your university";
  return role === "SUBJECT_EXPERT"
    ? `An affiliated college has no Subject Experts: ${name}'s Subject Expert designs each course and your teachers follow it. Add them as Instructors.`
    : `An affiliated college has no OMC: ${name}'s OMC monitors your courses.`;
}

/** Colleges whose courses a university's OMC also looks after. */
export async function collegeIdsOf(universityId: string | null | undefined): Promise<string[]> {
  if (!universityId) return [];
  const rows = (await adb.instituteAffiliation.findMany({ where: { universityId, status: "ACTIVE" }, select: { collegeId: true } }).catch(() => [])) as { collegeId: string }[];
  return rows.map((r) => r.collegeId);
}

// ---------------------------------------------------------------- 1. course design from the university
type Fp = { courseId: string; fromCourseId: string; fingerprint: string; syncedAt: Date };

async function fingerprint(courseId: string) {
  const [clos, rows, insts] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId, source: "SE" }, orderBy: { orderIndex: "asc" }, select: { code: true, statement: true, bloomLevel: true, mappedPlo: { select: { number: true } }, ploContributionPct: true } }),
    prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, orderBy: { lectureNumber: "asc" }, select: { lectureNumber: true, topic: true, subtopic: true, clo: { select: { code: true } } } }),
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "SE" }, orderBy: [{ type: "asc" }, { label: "asc" }], select: { type: true, label: true, marksPct: true, maxScore: true } }),
  ]);
  return { n: clos.length, hash: crypto.createHash("sha1").update(JSON.stringify([clos, rows, insts])).digest("hex") };
}

/** The university's course a college course follows: same master course (or code), in a university batch, with the Subject Expert's design. */
export async function universityCourseFor(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, masterCourseId: true, coordinator: { select: { managedById: true } }, batch: { select: { degreeProgram: true } } } });
  if (!c) return null;
  const uni = await universityOf(c.coordinator.managedById);
  if (!uni) return null;
  const match = c.masterCourseId ? [{ masterCourseId: c.masterCourseId }, { code: c.code }] : [{ code: c.code }];
  const cands = await prisma.course.findMany({ where: { coordinator: { managedById: uni }, OR: match, clos: { some: { source: "SE" } } }, orderBy: { createdAt: "desc" }, select: { id: true, code: true, title: true, masterCourseId: true, templateStatus: true, subjectExpert: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } }, take: 20 });
  const score = (x: (typeof cands)[number]) => Number(!!c.masterCourseId && x.masterCourseId === c.masterCourseId) * 4 + Number(x.templateStatus === "approved") * 2 + Number(x.batch?.degreeProgram === c.batch?.degreeProgram);
  return cands.sort((a, b) => score(b) - score(a))[0] || null;
}

export type DesignState = { status: "NONE" | "NEW" | "CHANGED" | "SAME"; from: Awaited<ReturnType<typeof universityCourseFor>>; syncedAt: Date | null };
export async function designState(courseId: string): Promise<DesignState> {
  const from = await universityCourseFor(courseId);
  if (!from) return { status: "NONE", from: null, syncedAt: null };
  const rec = (await adb.affiliateCourseSync.findUnique({ where: { courseId } }).catch(() => null)) as Fp | null;
  if (!rec) return { status: "NEW", from, syncedAt: null };
  const fp = await fingerprint(from.id);
  return { status: rec.fromCourseId === from.id && rec.fingerprint === fp.hash ? "SAME" : "CHANGED", from, syncedAt: rec.syncedAt };
}

/** Take (or refresh) the university Subject Expert's design into a college course. The instructor's own copy is refreshed too until teaching starts. */
export async function takeDesign(actorId: string, courseId: string): Promise<string> {
  const from = await universityCourseFor(courseId);
  if (!from) throw new Error("The university has no designed course to follow for this one yet (no Subject Expert plan with the same course).");
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true } });
  if (!course) throw new Error("Course not found.");
  const had = await prisma.cLO.count({ where: { courseId, source: "SE" } });
  if (had) {
    await prisma.$transaction([
      prisma.paperDistributionItem.deleteMany({ where: { courseId, source: "SE" } }),
      prisma.lectureRowInstrument.deleteMany({ where: { lectureRow: { courseId, source: "SE" } } }),
      prisma.lectureRow.deleteMany({ where: { courseId, source: "SE" } }),
      prisma.assessmentInstrument.deleteMany({ where: { courseId, source: "SE" } }),
      prisma.cLO.deleteMany({ where: { courseId, source: "SE" } }),
      prisma.coursePloMapping.deleteMany({ where: { courseId } }),
    ]).catch(() => { throw new Error("This course's plan is already in use and can't be replaced here."); });
  }
  const r = await copyCourseContent(from.id, courseId);
  if (!r) throw new Error("Nothing could be copied.");
  await prisma.course.update({ where: { id: courseId }, data: { templateStatus: "approved" } }).catch(() => null);
  let note = "";
  if (await prisma.cLO.count({ where: { courseId, source: "INSTRUCTOR" } })) {
    const blocked = await refreshInstructorCopy(courseId);
    note = blocked ? " The teacher's own copy was kept because teaching has started — the changes show beside it." : " The teacher's copy was refreshed.";
  } else await ensureInstructorCopy(courseId);
  const fp = await fingerprint(from.id);
  await adb.affiliateCourseSync.upsert({ where: { courseId }, create: { courseId, fromCourseId: from.id, fingerprint: fp.hash, syncedAt: new Date() }, update: { fromCourseId: from.id, fingerprint: fp.hash, syncedAt: new Date() } });
  await writeAuditLog({ actorUserId: actorId, action: "AFFILIATE_DESIGN_TAKEN", entityType: "Course", entityId: courseId, metadata: { fromCourseId: from.id } });
  return `${course.code}: took ${from.subjectExpert?.name ? `${from.subjectExpert.name}'s` : "the university's"} design (${from.batch?.degreeProgram || ""} ${from.batch?.batchName || ""}).${note}`;
}

/** Every course of a college: where its design stands. */
export async function collegeDesignBoard(collegeId: string, opts: { all?: boolean; coordinatorId?: string } = {}) {
  const courses = await prisma.course.findMany({ where: { coordinator: { managedById: collegeId }, ...(opts.all ? {} : { isOffered: true }), ...(opts.coordinatorId ? { coordinatorId: opts.coordinatorId } : {}) }, select: { id: true, code: true, title: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: [{ code: "asc" }], take: 600 });
  const rows = [];
  for (const c of courses) rows.push({ ...c, state: await designState(c.id) });
  return rows;
}

// ---------------------------------------------------------------- 2. marks distribution
export function parseHeads(json: string | null | undefined): Head[] {
  try { const v = JSON.parse(json || "[]"); return Array.isArray(v) ? v.filter((h) => h && h.type).map((h) => ({ type: String(h.type), pct: Number(h.pct) || 0, by: h.by === "UNIVERSITY" ? "UNIVERSITY" : "COLLEGE" })) : []; } catch { return []; }
}
export const DEFAULT_HEADS: Head[] = [
  { type: "Quiz", pct: 10, by: "COLLEGE" }, { type: "Assignment", pct: 10, by: "COLLEGE" }, { type: "Midterm", pct: 20, by: "COLLEGE" }, { type: "Final", pct: 60, by: "UNIVERSITY" },
];

export async function policies(universityId: string) {
  return (await adb.affiliateMarksPolicy.findMany({ where: { universityId }, orderBy: [{ collegeId: "asc" }, { courseKey: "asc" }] })) as Policy[];
}
/** The policy for one college course: college + course, then college, then course, then the university's default. */
export async function policyFor(courseId: string): Promise<{ universityId: string; collegeId: string; heads: Head[]; scope: string } | null> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, title: true, coordinator: { select: { managedById: true } } } });
  const collegeId = c?.coordinator.managedById || null;
  const uni = await universityOf(collegeId);
  if (!c || !uni || !collegeId) return null;
  const ps = (await adb.affiliateMarksPolicy.findMany({ where: { universityId: uni, OR: [{ collegeId }, { collegeId: null }] } }).catch(() => [])) as Policy[];
  const key = courseKeyOf(c);
  const order: [string | null, string | null, string][] = [[collegeId, key, "this college, this course"], [collegeId, null, "this college"], [null, key, "this course, all colleges"], [null, null, "all colleges"]];
  for (const [col, k, scope] of order) { const p = ps.find((x) => x.collegeId === col && x.courseKey === k); if (p) return { universityId: uni, collegeId, heads: parseHeads(p.headsJson), scope }; }
  return null;
}
export const headOf = (heads: Head[], instrumentType: string) => heads.find((h) => norm(h.type) === norm(instrumentType)) || null;

/** Refusal when a college teacher enters marks of a head the university enters. */
export async function collegeMarksBlock(courseId: string, instrumentIds: string[]): Promise<string | null> {
  const p = await policyFor(courseId).catch(() => null);
  if (!p) return null;
  const uniHeads = p.heads.filter((h) => h.by === "UNIVERSITY").map((h) => norm(h.type));
  if (!uniHeads.length || !instrumentIds.length) return null;
  const insts = await prisma.assessmentInstrument.findMany({ where: { id: { in: instrumentIds } }, select: { type: true, label: true } });
  const bad = insts.filter((i) => uniHeads.includes(norm(i.type)));
  return bad.length ? `${Array.from(new Set(bad.map((b) => b.type))).join(", ")} marks are entered by the university for affiliated colleges (${bad.map((b) => b.label).join(", ")}).` : null;
}

export async function savePolicy(actorId: string, universityId: string, a: Record<string, unknown>) {
  const collegeId = a.collegeId ? String(a.collegeId) : null;
  if (collegeId && !(await collegeIdsOf(universityId)).includes(collegeId)) throw new Error("That college is not affiliated to you.");
  const courseKey = a.courseKey ? String(a.courseKey).trim().toUpperCase().slice(0, 30) : null;
  const heads: Head[] = [];
  for (const h of HEADS) {
    const pct = Number(a[`pct_${h}`] || 0);
    if (!pct) continue;
    if (pct < 0 || pct > 100) throw new Error(`${h}: share must be 0–100.`);
    heads.push({ type: h, pct, by: a[`by_${h}`] === "UNIVERSITY" ? "UNIVERSITY" : "COLLEGE" });
  }
  const total = heads.reduce((s, h) => s + h.pct, 0);
  if (Math.round(total) !== 100) throw new Error(`The shares add up to ${total}%, not 100%.`);
  const existing = (await adb.affiliateMarksPolicy.findFirst({ where: { universityId, collegeId, courseKey } })) as Policy | null;
  if (existing) await adb.affiliateMarksPolicy.update({ where: { id: existing.id }, data: { headsJson: JSON.stringify(heads), updatedById: actorId, updatedAt: new Date() } });
  else await adb.affiliateMarksPolicy.create({ data: { id: crypto.randomUUID(), universityId, collegeId, courseKey, headsJson: JSON.stringify(heads), updatedById: actorId } });
  await writeAuditLog({ actorUserId: actorId, action: "AFFILIATE_MARKS_POLICY", entityType: "User", entityId: universityId, metadata: { collegeId, courseKey, heads: JSON.stringify(heads) } });
  return "Saved. Colleges see it on their marks pages at once.";
}
export async function deletePolicy(actorId: string, universityId: string, id: string) {
  const p = (await adb.affiliateMarksPolicy.findFirst({ where: { id, universityId } })) as Policy | null;
  if (!p) throw new Error("Not found.");
  await adb.affiliateMarksPolicy.delete({ where: { id } });
  await writeAuditLog({ actorUserId: actorId, action: "AFFILIATE_MARKS_POLICY_REMOVED", entityType: "User", entityId: universityId, metadata: { id } });
  return "Removed.";
}

/** Instruments marks go on: a split Project / Lab is marked on its parts, not on the container. */
function leaves<T extends { id: string; partOfId: string | null }>(xs: T[]) { const parents = new Set(xs.map((x) => x.partOfId).filter(Boolean)); return xs.filter((x) => !parents.has(x.id)); }

/** Marks progress of a college course, by who enters each head. */
export async function marksStatus(courseId: string) {
  const p = await policyFor(courseId);
  if (!p) return null;
  const [insts, enrolled] = await Promise.all([
    prisma.assessmentInstrument.findMany({ where: { courseId, source: "INSTRUCTOR" }, select: { id: true, type: true, label: true, maxScore: true, partOfId: true, _count: { select: { studentMarks: true } } } }).then(leaves),
    prisma.studentEnrollment.count({ where: { courseId, status: { not: "WITHDRAWN" } } }),
  ]);
  const side = (by: "COLLEGE" | "UNIVERSITY") => {
    const types = p.heads.filter((h) => h.by === by).map((h) => norm(h.type));
    const xs = insts.filter((i) => types.includes(norm(i.type)));
    const need = xs.length * enrolled, got = xs.reduce((s, i) => s + Math.min(enrolled, i._count.studentMarks), 0);
    return { items: xs.length, need, got, done: xs.length > 0 && enrolled > 0 && got >= need };
  };
  return { policy: p, college: side("COLLEGE"), university: side("UNIVERSITY"), enrolled };
}

/** University side: the college courses with a head the university enters. */
export async function universityMarkCourses(universityId: string, collegeId: string) {
  if (!(await collegeIdsOf(universityId)).includes(collegeId)) throw new Error("That college is not affiliated to you.");
  const courses = await prisma.course.findMany({ where: { coordinator: { managedById: collegeId }, isOffered: true }, select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { code: "asc" }, take: 400 });
  const out = [];
  for (const c of courses) { const s = await marksStatus(c.id); if (s && s.policy.heads.some((h) => h.by === "UNIVERSITY")) out.push({ ...c, status: s }); }
  return out;
}

/** University side: one college course's university-entered instruments and its students. */
export async function universitySheet(universityId: string, courseId: string) {
  const p = await policyFor(courseId);
  if (!p || p.universityId !== universityId) throw new Error("This course is not one of your affiliated colleges' courses.");
  await ensureInstructorCopy(courseId);
  const types = p.heads.filter((h) => h.by === "UNIVERSITY").map((h) => norm(h.type));
  const insts = leaves(await prisma.assessmentInstrument.findMany({ where: { courseId, source: "INSTRUCTOR" }, select: { id: true, type: true, label: true, maxScore: true, partOfId: true }, orderBy: { label: "asc" } })).filter((i) => types.includes(norm(i.type)));
  const enr = await prisma.studentEnrollment.findMany({ where: { courseId, status: { not: "WITHDRAWN" } }, select: { student: { select: { id: true, name: true, rollNumber: true } } }, orderBy: { student: { rollNumber: "asc" } } });
  const marks = await prisma.studentMark.findMany({ where: { courseId, instrumentId: { in: insts.map((i) => i.id).concat("none") } }, select: { studentId: true, instrumentId: true, score: true } });
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  return { course, insts, students: enr.map((e) => e.student), marks, heads: p.heads };
}

/** University side: save scores (instrumentId → rollNumber → score), or paste "roll, score" lines for one instrument. */
export async function universitySave(actorId: string, universityId: string, courseId: string, instrumentId: string, lines: string) {
  const sheet = await universitySheet(universityId, courseId);
  const inst = sheet.insts.find((i) => i.id === instrumentId);
  if (!inst) throw new Error("That assessment is not one the university enters.");
  const byRoll = new Map(sheet.students.map((s) => [s.rollNumber.trim().toUpperCase(), s.id]));
  let saved = 0; const unknown: string[] = []; const bad: string[] = [];
  for (const raw of lines.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    if (/^[^,;\t]+[,;\t]\s*$/.test(line)) continue; // a roll number with no score yet
    const m = line.match(/^(.+?)[\s,;\t]+(-?\d+(?:\.\d+)?)$/);
    if (!m) { bad.push(line); continue; }
    const sid = byRoll.get(m[1].trim().toUpperCase());
    if (!sid) { unknown.push(m[1].trim()); continue; }
    const score = Number(m[2]);
    if (score < 0 || score > inst.maxScore) { bad.push(line); continue; }
    await prisma.studentMark.upsert({ where: { studentId_instrumentId: { studentId: sid, instrumentId } }, create: { studentId: sid, courseId, instrumentId, score, enteredById: actorId }, update: { score, enteredById: actorId } });
    saved++;
  }
  await writeAuditLog({ actorUserId: actorId, action: "AFFILIATE_UNIVERSITY_MARKS", entityType: "Course", entityId: courseId, metadata: { instrumentId, saved, unknown: unknown.length, bad: bad.length } });
  return `Saved ${saved} mark(s) for ${inst.label}.${unknown.length ? ` Unknown roll numbers: ${unknown.slice(0, 8).join(", ")}${unknown.length > 8 ? "…" : ""}.` : ""}${bad.length ? ` ${bad.length} line(s) skipped (not "roll, score" or above ${inst.maxScore}).` : ""}`;
}

export { collegesOf };
