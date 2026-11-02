import { randomUUID } from "crypto";
import { prisma } from "./db";
import { universityOf } from "./curriculumLibrary";
import { courseItems, courseMarks, courseSettings } from "./cloMethods";
import { studentClo } from "./cloMethodCore";
import { gaFrom, totalPct } from "./uniResultsCore";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";

// One exam, two complete OBE records (affiliated colleges). The university enters its heads (e.g. the final) straight
// into the college's course (lib/affiliates.ts), so the college's own OBE data is complete. Here:
//  • university registration numbers of college students (the college asks, the university confirms) — the key that
//    links one student on both sides;
//  • the college submits its sessional marks: a snapshot is kept and those heads lock (only the university reopens);
//  • the university's own OBE record of every college student (CLO and graduate-attribute results per course), refreshed
//    whenever either side's marks change — for OBE transcripts and roll-ups. Re-checked marks update both sides.
const db = prisma as unknown as Record<string, any>;
export const OBE_HINT = "Run prisma/migration_adeel_p10.sql in Supabase first.";
const norm = (s: string) => s.trim().toLowerCase();

// ---------------------------------------------------------------- registration numbers
export async function regMap(studentIds: string[]) {
  const rows = ((await db.affStudentReg?.findMany({ where: { studentId: { in: studentIds.concat("none") } } }).catch(() => [])) || []) as { studentId: string; regNo: string | null; status: string }[];
  return new Map(rows.map((r) => [r.studentId, r]));
}
export async function collegeStudents(collegeId: string) {
  return prisma.student.findMany({ where: { batch: { coordinator: { managedById: collegeId } } }, select: { id: true, name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { rollNumber: "asc" }, take: 5000 });
}
/** The college asks for registration numbers for every student who has none yet. */
export async function requestRegs(by: { id: string }, collegeId: string) {
  if (!db.affStudentReg) throw new Error(OBE_HINT);
  const uni = await universityOf(collegeId); if (!uni) throw new Error("This college is not affiliated to a university.");
  const st = await collegeStudents(collegeId);
  const have = await regMap(st.map((s) => s.id));
  const need = st.filter((s) => !have.has(s.id));
  for (let i = 0; i < need.length; i += 500) await db.affStudentReg.createMany({ data: need.slice(i, i + 500).map((s) => ({ studentId: s.id, universityId: uni, collegeId, status: "REQUESTED" })), skipDuplicates: true });
  if (need.length) await notifyUsers([uni], { kind: "APPROVAL", title: `${need.length} registration number(s) requested by a college`, href: "/affiliation?tab=RESULTS" }).catch(() => null);
  await writeAuditLog({ actorUserId: by.id, action: "AFF_REG_REQUESTED", entityType: "User", entityId: collegeId, metadata: { n: need.length } }).catch(() => null);
  return need.length;
}
/** The university confirms numbers: lines "college roll number, registration number". */
export async function confirmRegs(by: { id: string }, universityId: string, collegeId: string, lines: string) {
  const st = await collegeStudents(collegeId);
  const byRoll = new Map(st.map((s) => [s.rollNumber.trim().toUpperCase(), s.id]));
  let ok = 0; const bad: string[] = [];
  for (const raw of lines.split(/\r?\n/)) {
    const m = raw.trim().match(/^(.+?)[\s,;\t]+([A-Za-z0-9\-/]+)$/); if (!m) { if (raw.trim()) bad.push(raw.trim()); continue; }
    const sid = byRoll.get(m[1].trim().toUpperCase()); if (!sid) { bad.push(m[1]); continue; }
    try {
      await db.affStudentReg.upsert({ where: { studentId: sid }, create: { studentId: sid, universityId, collegeId, regNo: m[2], status: "CONFIRMED", confirmedAt: new Date(), confirmedById: by.id }, update: { regNo: m[2], status: "CONFIRMED", confirmedAt: new Date(), confirmedById: by.id } });
      ok++;
    } catch { bad.push(`${m[2]} (already used)`); }
  }
  await writeAuditLog({ actorUserId: by.id, action: "AFF_REG_CONFIRMED", entityType: "User", entityId: collegeId, metadata: { ok, bad: bad.length } }).catch(() => null);
  return `${ok} confirmed.${bad.length ? ` Not matched: ${bad.slice(0, 8).join(", ")}${bad.length > 8 ? "…" : ""}` : ""}`;
}

// ---------------------------------------------------------------- the university's OBE record
type CItem = Awaited<ReturnType<typeof courseItems>>["items"][number];
async function headsBy(courseId: string) {
  const p = await (await import("./affiliates")).policyFor(courseId).catch(() => null);
  return p ? { college: p.heads.filter((h) => h.by === "COLLEGE").map((h) => norm(h.type)), uni: p.heads.filter((h) => h.by === "UNIVERSITY").map((h) => norm(h.type)) } : null;
}
/** Recomputes the university's OBE record for every student of one college course. */
export async function syncCourseObe(courseId: string) {
  if (!db.uniObeRecord) return 0;
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, title: true, offeredTermName: true, offeredTermYear: true, coordinator: { select: { managedById: true } } } });
  const collegeId = c?.coordinator.managedById || null;
  const uni = await universityOf(collegeId).catch(() => null);
  if (!c || !uni || !collegeId) return 0;
  const { items, clos } = await courseItems(courseId, "INSTRUCTOR");
  const settings = await courseSettings(courseId);
  const students = await courseMarks(courseId, items);
  const maps = await prisma.cLO.findMany({ where: { id: { in: clos.map((x) => x.id).concat("none") } }, select: { id: true, mappedPlo: { select: { number: true } } } });
  const gaOf = new Map(maps.map((m) => [m.id, m.mappedPlo ? `GA-${m.mappedPlo.number}` : null]));
  const regs = await regMap(students.map((s) => s.studentId));
  const term = c.offeredTermName && c.offeredTermYear ? `${c.offeredTermName} ${c.offeredTermYear}` : "";
  const graded = items.filter((i: CItem) => i.gradePct > 0);
  for (const s of students) {
    const cl = clos.map((x) => { const r = studentClo(settings, items, x.id, s.marks); return { code: x.code, pct: r.pct, status: r.status, ga: gaOf.get(x.id) || null }; });
    const data = { collegeId, regNo: regs.get(s.studentId)?.regNo || null, courseTitle: c.title, totalPct: totalPct(graded, s.marks), cloJson: JSON.stringify(cl), gaJson: JSON.stringify(gaFrom(cl, settings.passPct)), updatedAt: new Date() };
    await db.uniObeRecord.upsert({ where: { universityId_studentId_courseCode_term: { universityId: uni, studentId: s.studentId, courseCode: c.code, term } }, create: { id: randomUUID(), universityId: uni, studentId: s.studentId, courseCode: c.code, term, ...data }, update: data });
  }
  return students.length;
}
export async function syncCollege(collegeId: string) {
  const cs = await prisma.course.findMany({ where: { coordinator: { managedById: collegeId }, isOffered: true }, select: { id: true } });
  let n = 0; for (const c of cs) n += await syncCourseObe(c.id).catch(() => 0);
  return { courses: cs.length, records: n };
}

// ---------------------------------------------------------------- sessional submission (college) and its lock
const lockKey = (courseId: string) => `uni.sessLock.${courseId}`;
export async function sessionalLock(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { coordinator: { select: { managedById: true } } } });
  const cid = c?.coordinator.managedById; if (!cid) return null;
  return (await (await import("./scopedSettings")).allStored(cid).catch(() => [])).find((r) => r.key === lockKey(courseId) && r.scopeType === "INSTITUTE")?.value || null;
}
/** Refusal for a college teacher changing a sessional mark after the college submitted them to the university. */
export async function sessionalBlock(courseId: string, instrumentIds: string[]) {
  const at = await sessionalLock(courseId); if (!at) return null;
  const h = await headsBy(courseId); if (!h) return null;
  const insts = await prisma.assessmentInstrument.findMany({ where: { id: { in: instrumentIds } }, select: { type: true } });
  return insts.some((i) => h.college.includes(norm(i.type))) ? `Sessional marks were submitted to the university on ${new Date(at).toLocaleDateString("en-GB")} and are locked. The university can reopen them.` : null;
}
export async function submitSessionals(by: { id: string; name: string }, courseId: string) {
  if (!db.uniSessional) throw new Error(OBE_HINT);
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, title: true, coordinator: { select: { managedById: true } } } });
  const collegeId = c?.coordinator.managedById || ""; const uni = await universityOf(collegeId);
  const h = await headsBy(courseId);
  if (!c || !uni || !h) throw new Error("This course has no marks distribution from the university.");
  const { items, clos } = await courseItems(courseId, "INSTRUCTOR");
  const own = items.filter((i: CItem) => h.college.includes(norm(i.type)));
  const settings = await courseSettings(courseId);
  const students = await courseMarks(courseId, items);
  const missing = students.filter((s) => own.some((i: CItem) => s.marks[i.id] == null)).length;
  const regs = await regMap(students.map((s) => s.studentId));
  for (const s of students) {
    const cl = Object.fromEntries(clos.map((x) => [x.code, studentClo(settings, own, x.id, s.marks).pct]));
    const data = { collegeId, courseId, regNo: regs.get(s.studentId)?.regNo || null, pct: totalPct(own, s.marks), cloJson: JSON.stringify(cl), submittedById: by.id, submittedAt: new Date() };
    await db.uniSessional.upsert({ where: { paperId_studentId: { paperId: courseId, studentId: s.studentId } }, create: { id: randomUUID(), paperId: courseId, studentId: s.studentId, ...data }, update: data });
  }
  await (await import("./scopedSettings")).saveSetting(collegeId, "INSTITUTE", collegeId, lockKey(courseId), new Date().toISOString(), by.id);
  await syncCourseObe(courseId).catch(() => 0);
  await notifyUsers([uni], { kind: "APPROVAL", title: `Sessional marks submitted: ${c.code} ${c.title}`, body: `${students.length} students${missing ? `, ${missing} with blanks (absent)` : ""}.`, href: "/affiliation?tab=RESULTS" }).catch(() => null);
  await writeAuditLog({ actorUserId: by.id, action: "AFF_SESSIONALS_SUBMITTED", entityType: "Course", entityId: courseId, metadata: { students: students.length } }).catch(() => null);
  return `Submitted for ${students.length} students; the sessional marks are now locked.`;
}
export async function reopenSessionals(by: { id: string }, courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { coordinator: { select: { managedById: true } } } });
  const cid = c?.coordinator.managedById; if (!cid) throw new Error("Not found.");
  await (await import("./scopedSettings")).clearSetting(cid, "INSTITUTE", cid, lockKey(courseId));
  await writeAuditLog({ actorUserId: by.id, action: "AFF_SESSIONALS_REOPENED", entityType: "Course", entityId: courseId }).catch(() => null);
}
/** A college's offered courses with their sessional status, for both sides. */
export async function collegeCourses(collegeId: string) {
  const cs = await prisma.course.findMany({ where: { coordinator: { managedById: collegeId }, isOffered: true }, select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { code: "asc" }, take: 300 });
  const stored = await (await import("./scopedSettings")).allStored(collegeId).catch(() => []);
  return cs.map((c) => ({ ...c, lockedAt: stored.find((r) => r.key === lockKey(c.id))?.value || null }));
}

// ---------------------------------------------------------------- OBE transcript
export type ObeRow = { courseCode: string; courseTitle: string | null; term: string | null; totalPct: number | null; clos: { code: string; pct: number | null; status: string; ga: string | null }[]; gas: { ga: string; pct: number; attained: boolean }[] };
export async function obeTranscript(universityId: string, studentId: string) {
  const rows = ((await db.uniObeRecord?.findMany({ where: { universityId, studentId }, orderBy: [{ term: "asc" }, { courseCode: "asc" }] }).catch(() => [])) || []) as { courseCode: string; courseTitle: string | null; term: string | null; totalPct: number | null; cloJson: string; gaJson: string; collegeId: string; regNo: string | null }[];
  const J = <T>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
  const courses: ObeRow[] = rows.map((r) => ({ courseCode: r.courseCode, courseTitle: r.courseTitle, term: r.term, totalPct: r.totalPct, clos: J(r.cloJson, []), gas: J(r.gaJson, []) }));
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true, coordinator: { select: { managedById: true } } } } } });
  const collegeId = st?.batch.coordinator.managedById || rows[0]?.collegeId || "";
  const [col, uni, reg] = await Promise.all([prisma.user.findUnique({ where: { id: collegeId }, select: { instituteName: true, name: true } }), prisma.user.findUnique({ where: { id: universityId }, select: { instituteName: true, instituteLogo: true } }), regMap([studentId])]);
  const all = courses.flatMap((c) => c.gas.map((g) => ({ code: c.courseCode, pct: g.pct, ga: g.ga })));
  const overall = gaFrom(all, 50).map((g) => ({ ...g, courses: Array.from(new Set(all.filter((x) => x.ga === g.ga).map((x) => x.code))) }));
  return { student: st, regNo: reg.get(studentId)?.regNo || null, college: col?.instituteName || col?.name || "", university: uni?.instituteName || "", logo: uni?.instituteLogo || null, collegeId, courses, overall };
}
/** Students with OBE records at the university (optionally one college, or a search by name / roll / registration no.). */
export async function obeStudents(universityId: string, collegeId?: string | null, q?: string) {
  const rows = ((await db.uniObeRecord?.findMany({ where: { universityId, ...(collegeId ? { collegeId } : {}) }, select: { studentId: true, regNo: true, collegeId: true }, distinct: ["studentId"], take: 3000 }).catch(() => [])) || []) as { studentId: string; regNo: string | null; collegeId: string }[];
  const st = await prisma.student.findMany({ where: { id: { in: rows.map((r) => r.studentId).concat("none") } }, select: { id: true, name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  const needle = (q || "").trim().toLowerCase();
  return st.map((s) => ({ ...s, regNo: rows.find((r) => r.studentId === s.id)?.regNo || null, collegeId: rows.find((r) => r.studentId === s.id)?.collegeId || "" }))
    .filter((s) => !needle || `${s.name} ${s.rollNumber} ${s.regNo || ""}`.toLowerCase().includes(needle)).sort((a, b) => a.rollNumber.localeCompare(b.rollNumber)).slice(0, 200);
}
