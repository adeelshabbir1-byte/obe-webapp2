import { randomUUID } from "crypto";
import { prisma } from "./db";
import { EXAM_CONTROLLER, academicRules } from "./academicRules";
import { chairmanIdFor } from "./reportScope";
import { notifyUsers } from "./notifications";
import { notifyStudents } from "./studentNotices";
import { writeAuditLog } from "./audit";
import { attendancePolicy, coursesAttendance } from "./attendance";
import { computeCgpa } from "./academicStanding";
import { standingWith } from "./academicRules";

// The Controller of Examinations' own work: publishing approved results (students see them as final), the re-checking
// window and requests, debarred (short attendance) lists for an exam session, admit cards and standing (merit) lists.
// Exam sessions, date sheets, seating and invigilation stay on /exams (the Controller is part of the exam branch).

export const xdb = prisma as unknown as Record<string, any>;
export const CONTROLLER_HINT = "Needs prisma/migration_exam_controller.sql — run it in Supabase.";

type U = { id: string; role: string; managedById: string | null; extraRoles?: string[] | null };
export const isController = (u: U) => u.role === "CHAIRMAN" || (u.extraRoles || []).includes(EXAM_CONTROLLER);

/** The institute this person controls exams for, else null. */
export async function controllerChairman(u: U): Promise<string | null> {
  if (!isController(u)) return null;
  return u.role === "CHAIRMAN" ? u.id : await chairmanIdFor(u as never).catch(() => null);
}

const instituteCourses = (chairmanId: string) => ({ coordinator: { managedById: chairmanId } });

export async function publications(courseIds: string[]) {
  const rows = (await xdb.resultPublication.findMany({ where: { courseId: { in: courseIds.concat("none") } } }).catch(() => [])) as { courseId: string; publishedAt: Date; recheckUntil: Date | null }[];
  return new Map(rows.map((r) => [r.courseId, r]));
}
export async function publicationOf(courseId: string) {
  return ((await xdb.resultPublication.findUnique({ where: { courseId } }).catch(() => null)) as { publishedAt: Date; recheckUntil: Date | null } | null);
}

/** Approved results of offered courses, with whether each is published. */
export async function resultBoard(chairmanId: string) {
  const courses = await prisma.course.findMany({ where: { ...instituteCourses(chairmanId), isOffered: true }, select: { id: true, code: true, title: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } }, _count: { select: { studentEnrollments: true } } }, orderBy: { code: "asc" } });
  const ids = courses.map((c) => c.id);
  const results = (await xdb.courseResult.findMany({ where: { courseId: { in: ids.concat("none") } }, select: { courseId: true, status: true, decidedAt: true } }).catch(() => [])) as { courseId: string; status: string; decidedAt: Date | null }[];
  const st = new Map(results.map((r) => [r.courseId, r]));
  const pub = await publications(ids);
  return courses.map((c) => ({ ...c, status: st.get(c.id)?.status || "DRAFT", approvedAt: st.get(c.id)?.decidedAt || null, published: pub.get(c.id) || null }));
}

/** Publish approved results. Only APPROVED results can be published (approval is the OMC / HOD step before this). */
export async function publishResults(chairmanId: string, by: { id: string; name: string }, courseIds: string[], recheckDays: number) {
  const board = (await resultBoard(chairmanId)).filter((c) => courseIds.includes(c.id));
  const ready = board.filter((c) => c.status === "APPROVED" && !c.published);
  if (!ready.length) throw new Error(board.some((c) => c.status !== "APPROVED") ? "Only approved results can be published." : "Nothing to publish.");
  const until = recheckDays > 0 ? new Date(Date.now() + recheckDays * 86400000) : null;
  for (const c of ready) {
    await xdb.resultPublication.upsert({ where: { courseId: c.id }, create: { courseId: c.id, chairmanId, publishedById: by.id, recheckUntil: until }, update: { publishedAt: new Date(), publishedById: by.id, recheckUntil: until } });
    const en = await prisma.studentEnrollment.findMany({ where: { courseId: c.id, status: "ACTIVE" }, select: { studentId: true } });
    await notifyStudents(en.map((e) => e.studentId), { kind: "RESULT", title: `Result published: ${c.code}`, body: until ? `You may ask for re-checking until ${until.toDateString()}.` : "Your final grade is on your transcript.", href: "/student/transcript" }, chairmanId);
  }
  await writeAuditLog({ actorUserId: by.id, action: "RESULTS_PUBLISHED", entityType: "Course", entityId: ready[0].id, metadata: { count: ready.length, codes: ready.map((c) => c.code).join(", ").slice(0, 500), recheckDays } as never });
  return ready.length;
}

export async function unpublish(chairmanId: string, by: string, courseId: string) {
  await xdb.resultPublication.deleteMany({ where: { courseId, chairmanId } });
  await writeAuditLog({ actorUserId: by, action: "RESULT_UNPUBLISHED", entityType: "Course", entityId: courseId });
}

// ---- Re-checking ----
export async function requestRecheck(student: { id: string; name: string }, courseId: string, reason: string) {
  const p = await publicationOf(courseId);
  if (!p) throw new Error("This result is not published yet.");
  if (!p.recheckUntil || p.recheckUntil < new Date()) throw new Error("The re-checking window for this result has closed.");
  const en = await prisma.studentEnrollment.findFirst({ where: { courseId, studentId: student.id }, select: { course: { select: { code: true, instructorId: true, coordinator: { select: { managedById: true } } } } } });
  if (!en) throw new Error("You are not in this course.");
  if (reason.trim().length < 10) throw new Error("Say what you want re-checked (at least a sentence).");
  const chairmanId = en.course.coordinator.managedById || "";
  await xdb.resultRecheck.upsert({ where: { courseId_studentId: { courseId, studentId: student.id } }, create: { id: randomUUID(), chairmanId, courseId, studentId: student.id, reason: reason.slice(0, 1500) }, update: { reason: reason.slice(0, 1500), status: "PENDING", decidedAt: null, decidedById: null, note: null } });
  const ctl = await prisma.user.findMany({ where: { extraRoles: { has: EXAM_CONTROLLER }, OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }, select: { id: true } });
  await notifyUsers([...ctl.map((x) => x.id), en.course.instructorId], { kind: "RESULT", title: `Re-checking asked: ${en.course.code}`, body: `${student.name}: ${reason.slice(0, 160)}`, href: "/controller?tab=recheck" });
}

export async function decideRecheck(chairmanId: string, by: string, id: string, status: "UPHELD" | "CHANGED" | "REJECTED", note: string) {
  const r = (await xdb.resultRecheck.findFirst({ where: { id, chairmanId } })) as { id: string; studentId: string; courseId: string } | null;
  if (!r) throw new Error("Not found.");
  await xdb.resultRecheck.update({ where: { id }, data: { status, note: note.slice(0, 1000) || null, decidedById: by, decidedAt: new Date() } });
  const c = await prisma.course.findUnique({ where: { id: r.courseId }, select: { code: true } });
  const what = status === "CHANGED" ? "your grade is being changed (see your transcript once approved)" : status === "UPHELD" ? "the result stands as published" : "the request was not accepted";
  await notifyStudents([r.studentId], { kind: "RESULT", title: `Re-checking ${c?.code || ""}: ${status.toLowerCase()}`, body: `${what}${note ? ` — ${note}` : ""}.`, href: "/student/recheck" }, chairmanId);
}

// ---- Debarred lists ----
export async function sessionCourses(sessionId: string) {
  const papers = (await xdb.examPaper.findMany({ where: { sessionId }, select: { courseId: true } }).catch(() => [])) as { courseId: string }[];
  return papers.map((p) => p.courseId);
}

/** Students below the minimum attendance in this session's courses, merged with the saved list (saved decisions win). */
export async function debarList(chairmanId: string, sessionId: string) {
  const ids = await sessionCourses(sessionId);
  const rules = await academicRules(chairmanId);
  const pol = await attendancePolicy(chairmanId);
  const { shortages } = await coursesAttendance(ids, { ...pol, minPct: rules.minAttendanceForExam || pol.minPct });
  const saved = (await xdb.debarEntry.findMany({ where: { sessionId } }).catch(() => [])) as { id: string; courseId: string; studentId: string; pct: number; status: string; note: string | null }[];
  const key = (c: string, s: string) => `${c}|${s}`;
  const sv = new Map(saved.map((x) => [key(x.courseId, x.studentId), x]));
  const rows = shortages.filter((s) => s.pct < (rules.minAttendanceForExam || pol.minPct)).map((s) => ({ courseId: s.courseId, code: s.code, studentId: s.studentId, name: s.name, rollNumber: s.rollNumber, pct: s.pct, saved: sv.get(key(s.courseId, s.studentId)) || null }));
  return { min: rules.minAttendanceForExam || pol.minPct, rows, savedCount: saved.length, condoned: saved.filter((x) => x.status === "CONDONED").length };
}

export async function saveDebarList(chairmanId: string, by: string, sessionId: string) {
  const d = await debarList(chairmanId, sessionId);
  let n = 0;
  for (const r of d.rows) {
    if (r.saved) continue;
    await xdb.debarEntry.create({ data: { id: randomUUID(), sessionId, courseId: r.courseId, studentId: r.studentId, pct: r.pct, decidedById: by } });
    await notifyStudents([r.studentId], { kind: "EXAM", title: `Debarred from the ${r.code} paper`, body: `Your attendance is ${r.pct.toFixed(0)}% (minimum ${d.min}%). Contact the Controller of Examinations if you have a valid reason.`, href: "/student/exams" }, chairmanId);
    n++;
  }
  const teachers = await prisma.course.findMany({ where: { id: { in: Array.from(new Set(d.rows.map((r) => r.courseId))).concat("none") } }, select: { instructorId: true } });
  if (n) await notifyUsers(teachers.map((t) => t.instructorId), { kind: "EXAM", title: "Debarred list issued", body: `${n} student(s) are debarred from papers of your course(s) for short attendance.`, href: "/exams" });
  return n;
}

export async function setDebarStatus(sessionId: string, by: string, id: string, status: "DEBARRED" | "CONDONED", note: string) {
  await xdb.debarEntry.updateMany({ where: { id, sessionId }, data: { status, note: note.slice(0, 500) || null, decidedById: by } });
}

export async function debarredFor(studentId: string, sessionId?: string) {
  return ((await xdb.debarEntry.findMany({ where: { studentId, status: "DEBARRED", ...(sessionId ? { sessionId } : {}) } }).catch(() => [])) as { sessionId: string; courseId: string; pct: number }[]);
}

// ---- Admit cards ----
const SLOT = (json: string, i: number | null) => { try { return i === null ? "" : (JSON.parse(json) as string[])[i] || ""; } catch { return ""; } };
export async function admitCards(sessionId: string, studentIds: string[]) {
  const s = (await xdb.examSession.findUnique({ where: { id: sessionId } }).catch(() => null)) as { id: string; name: string; slotsJson: string; status: string } | null;
  if (!s) return null;
  const papers = (await xdb.examPaper.findMany({ where: { sessionId } })) as { courseId: string; date: Date | null; slot: number | null; roomsJson: string }[];
  const [courses, rooms, studs, en, deb] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: papers.map((p) => p.courseId).concat("none") } }, select: { id: true, code: true, title: true } }),
    prisma.room.findMany({ select: { id: true, name: true } }).catch(() => [] as { id: string; name: string }[]),
    prisma.student.findMany({ where: { id: { in: studentIds.concat("none") } }, select: { id: true, name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { rollNumber: "asc" } }),
    prisma.studentEnrollment.findMany({ where: { studentId: { in: studentIds.concat("none") }, courseId: { in: papers.map((p) => p.courseId).concat("none") }, status: "ACTIVE" }, select: { studentId: true, courseId: true } }),
    xdb.debarEntry.findMany({ where: { sessionId, status: "DEBARRED", studentId: { in: studentIds.concat("none") } } }).catch(() => []) as Promise<{ studentId: string; courseId: string }[]>,
  ]);
  const cname = new Map(courses.map((c) => [c.id, c]));
  const rname = new Map(rooms.map((r) => [r.id, r.name]));
  return { session: s, cards: studs.map((st) => ({
    student: st,
    papers: en.filter((e) => e.studentId === st.id).map((e) => {
      const p = papers.find((x) => x.courseId === e.courseId)!;
      let room = ""; try { const r = (JSON.parse(p.roomsJson) as { roomId: string; studentIds: string[] }[]).find((x) => x.studentIds.includes(st.id)); room = r ? rname.get(r.roomId) || "" : ""; } catch { /* none */ }
      return { code: cname.get(e.courseId)?.code || "", title: cname.get(e.courseId)?.title || "", date: p.date, slot: SLOT(s.slotsJson, p.slot), room, debarred: deb.some((d) => d.studentId === st.id && d.courseId === e.courseId) };
    }).sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0)),
  })) };
}

// ---- Standing (merit) list ----
export async function standingList(chairmanId: string, batchId: string) {
  const rules = await academicRules(chairmanId);
  const st = await prisma.student.findMany({ where: { batchId }, select: { id: true, name: true, rollNumber: true }, orderBy: { rollNumber: "asc" } });
  const rows = await Promise.all(st.map(async (s) => ({ ...s, cgpa: await computeCgpa(s.id) })));
  rows.sort((a, b) => (b.cgpa ?? -1) - (a.cgpa ?? -1));
  let pos = 0, last: number | null = -2;
  return rows.map((r, i) => { if (r.cgpa !== last) { pos = i + 1; last = r.cgpa; } return { ...r, position: r.cgpa === null ? null : pos, standing: standingWith(r.cgpa, rules) }; });
}

/** Dashboard counts. */
export async function controllerSummary(chairmanId: string) {
  const board = await resultBoard(chairmanId);
  const [sessions, rechecks, changes, debarred, degrees] = await Promise.all([
    xdb.examSession.findMany({ where: { chairmanId }, orderBy: { startDate: "desc" }, take: 6, select: { id: true, name: true, examType: true, startDate: true, endDate: true, status: true } }).catch(() => []),
    xdb.resultRecheck.count({ where: { chairmanId, status: "PENDING" } }).catch(() => null),
    xdb.gradeChangeRequest.count({ where: { status: "PENDING", courseId: { in: board.map((c) => c.id).concat("none") } } }).catch(() => 0),
    xdb.debarEntry.count({ where: { status: "DEBARRED", courseId: { in: board.map((c) => c.id).concat("none") } } }).catch(() => null),
    xdb.degreeIssue.count({ where: { chairmanId } }).catch(() => null),
  ]);
  return {
    board, sessions: sessions as { id: string; name: string; examType: string; startDate: Date; endDate: Date; status: string }[],
    toPublish: board.filter((c) => c.status === "APPROVED" && !c.published).length, published: board.filter((c) => c.published).length,
    awaitingApproval: board.filter((c) => c.status === "SUBMITTED").length, notSubmitted: board.filter((c) => c.status === "DRAFT" || c.status === "RETURNED").length,
    rechecks: rechecks as number | null, changes: changes as number, debarred: debarred as number | null, degrees: degrees as number | null,
  };
}
