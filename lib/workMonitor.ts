import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { calendarOf, fixedIds } from "./workCalendar";
import { moveDue } from "./workDaysCore";
import { statusOf } from "./deadlines";

// Queue item 20: constant monitoring — everyone's responsibilities on time, adviser notes, lab equipment against the
// courses that need it, co-curricular activities (also for ODL students), the compliance list, and one Reports page.
const db = prisma as unknown as Record<string, any>;
export const MON_HINT = "Run prisma/migration_adeel_p13.sql (System Health → database updates) first.";

/** Every person's deadlines (named, or through the courses they teach / design) judged on their own working days. */
export async function responsibility(chairmanId: string, from: Date, to: Date) {
  const rows = await prisma.deadline.findMany({ where: { chairmanId, allCourses: false, dueDate: { gte: from, lte: to } }, select: { id: true, assigneeId: true, role: true, kind: true, courseId: true, dueDate: true, completedAt: true } });
  const courseIds = Array.from(new Set(rows.map((r) => r.courseId).filter((x): x is string => !!x)));
  const courses = new Map((courseIds.length ? await prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, instructorId: true, subjectExpertId: true, coordinatorId: true } }) : []).map((c) => [c.id, c]));
  const fixed = await fixedIds(rows.map((r) => r.id));
  const per = new Map<string, { onTime: number; late: number; overdue: number; open: number; lateDays: number }>();
  for (const r of rows) {
    const c = r.courseId ? courses.get(r.courseId) : null;
    const who = r.assigneeId || (r.role === "SUBJECT_EXPERT" ? c?.subjectExpertId : r.role === "PROGRAM_COORDINATOR" ? c?.coordinatorId : c?.instructorId) || null;
    if (!who) continue;
    const cal = await calendarOf(who, chairmanId);
    const due = moveDue(r.dueDate, cal, fixed.has(r.id)).due;
    const st = statusOf({ dueDate: due, completedAt: r.completedAt });
    const e = per.get(who) || { onTime: 0, late: 0, overdue: 0, open: 0, lateDays: 0 };
    if (st === "ON_TIME") e.onTime++; else if (st === "LATE_DONE") { e.late++; e.lateDays += Math.max(0, Math.round(((r.completedAt as Date).getTime() - due.getTime()) / 864e5)); } else if (st === "OVERDUE") { e.overdue++; e.lateDays += Math.round((Date.now() - due.getTime()) / 864e5); } else e.open++;
    per.set(who, e);
  }
  const users = await prisma.user.findMany({ where: { id: { in: Array.from(per.keys()) } }, select: { id: true, name: true, role: true, department_: { select: { name: true } } } }).catch(() => [] as { id: string; name: string; role: string; department_: { name: string } | null }[]);
  return users.map((u) => { const e = per.get(u.id)!; const judged = e.onTime + e.late + e.overdue; return { id: u.id, name: u.name, role: u.role, department: u.department_?.name || "—", ...e, pct: judged ? Math.round((100 * e.onTime) / judged) : null }; }).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.name.localeCompare(b.name));
}
/** Monthly, on the 1st: the Head's summary of last month (cron). */
export async function monthlySummary() {
  const now = new Date(); if (now.getUTCDate() !== 1) return 0;
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)), to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN", isActive: true }, select: { id: true } });
  let n = 0;
  for (const h of heads) {
    const r = await responsibility(h.id, from, to).catch(() => []); if (!r.length) continue;
    const late = r.filter((x) => x.overdue || x.late);
    await scheduledReports(h.id).catch(() => 0);
    await notifyUsers([h.id], { kind: "INFO", title: `Last month: ${r.length - late.length} of ${r.length} people on time`, body: late.slice(0, 5).map((x) => `${x.name}: ${x.overdue} overdue, ${x.late} late`).join("; "), href: "/responsibility" }).catch(() => null); n++;
  }
  return n;
}

// ---- Adviser notes and semester plan approval.
export async function adviserNotes(studentId: string) { return ((await db.adviserNote?.findMany({ where: { studentId }, orderBy: { at: "desc" } }).catch(() => null)) ?? null) as { id: string; adviserId: string; text: string; planTerm: string | null; planApproved: boolean; at: Date }[] | null; }
export async function addAdviserNote(adviserId: string, studentId: string, text: string, planTerm: string | null, planApproved: boolean) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { batch: { select: { advisorId: true } } } });
  if (st?.batch?.advisorId !== adviserId) throw new Error("Only the batch's adviser.");
  await db.adviserNote.create({ data: { id: randomUUID(), studentId, adviserId, text: text.slice(0, 3000), planTerm: planTerm?.slice(0, 40) || null, planApproved } });
}

// ---- Lab equipment against the courses that need it (accreditation "lab adequacy").
export async function labNeeds(chairmanId: string) {
  const needs = ((await db.labCourseNeed?.findMany({ where: { chairmanId } }).catch(() => null)) ?? null) as { id: string; courseId: string; category: string; perStudents: number; labId: string | null; note: string | null }[] | null;
  if (!needs) return null;
  const courses = new Map((await prisma.course.findMany({ where: { id: { in: needs.map((n) => n.courseId).concat("none") } }, select: { id: true, code: true, title: true, _count: { select: { studentEnrollments: true } } } })).map((c) => [c.id, c]));
  const assets = (await db.asset.findMany({ where: { chairmanId, status: "WORKING" }, select: { labId: true, category: true } }).catch(() => [])) as { labId: string | null; category: string }[];
  return needs.map((n) => {
    const c = courses.get(n.courseId); const students = c?._count.studentEnrollments || 0;
    const need = Math.ceil(students / Math.max(1, n.perStudents));
    const have = assets.filter((a) => a.category.toLowerCase() === n.category.toLowerCase() && (!n.labId || a.labId === n.labId)).length;
    return { ...n, course: c ? `${c.code} ${c.title}` : n.courseId, students, need, have, short: Math.max(0, need - have) };
  });
}
export async function saveLabNeed(chairmanId: string, d: { courseId: string; category: string; perStudents: number; labId?: string | null; note?: string | null }) {
  await db.labCourseNeed.create({ data: { id: randomUUID(), chairmanId, courseId: d.courseId, category: d.category.slice(0, 80), perStudents: Math.max(1, Math.round(d.perStudents || 1)), labId: d.labId || null, note: d.note?.slice(0, 300) || null } });
}

// ---- Co-curricular activities per program and year, with the online ones ODL students can join.
export async function activitiesReport(chairmanId: string, year: number) {
  const ev = (await db.societyEvent.findMany({ where: { chairmanId, eventDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } }, select: { title: true, category: true, eventDate: true, venue: true, participants: true, status: true } }).catch(() => [])) as { title: string; category: string; eventDate: Date; venue: string | null; participants: number | null; status: string }[];
  const online = (v: string | null) => /online|virtual|zoom|meet|teams|webinar/i.test(v || "");
  const byCat = new Map<string, { n: number; people: number; online: number }>();
  for (const e of ev) { const x = byCat.get(e.category) || { n: 0, people: 0, online: 0 }; x.n++; x.people += e.participants || 0; if (online(e.venue)) x.online++; byCat.set(e.category, x); }
  return { events: ev.length, online: ev.filter((e) => online(e.venue)).length, people: ev.reduce((a, e) => a + (e.participants || 0), 0), byCat: Array.from(byCat.entries()).sort((a, b) => b[1].n - a[1].n) };
}

// ---- Compliance monitor: one list of every requirement, with owner, due date, evidence and improvement.
export type CItem = { id: string; body: string; code: string; title: string; ownerId: string | null; dueDate: Date | null; status: string; evidenceUrl: string | null; improvement: string | null; checkedAt: Date | null };
export async function compliance(chairmanId: string) {
  const rows = ((await db.complianceItem?.findMany({ where: { chairmanId }, orderBy: [{ body: "asc" }, { code: "asc" }] }).catch(() => null)) ?? null) as CItem[] | null;
  if (!rows) return null;
  const now = Date.now();
  return rows.map((r) => ({ ...r, slipping: r.status !== "MET" && !!r.dueDate && r.dueDate.getTime() < now }));
}
/** Seeds the list from the accreditation catalogue already in OBEHUB (council standards), so nothing is invented. */
export async function seedCompliance(chairmanId: string, body: string) {
  const { CATALOGUE } = await import("./accreditation/catalogue");
  const cat = (CATALOGUE as Record<string, { tasks: { code: string; title: string }[] }>)[body];
  if (!cat) throw new Error("Unknown council.");
  let n = 0;
  for (const t of cat.tasks) { const r = await db.complianceItem.upsert({ where: { chairmanId_body_code: { chairmanId, body, code: t.code } }, create: { id: randomUUID(), chairmanId, body, code: t.code, title: t.title }, update: {} }).catch(() => null); if (r) n++; }
  return n;
}
export async function saveCompliance(chairmanId: string, d: Partial<CItem> & { id?: string }) {
  const data = { ownerId: d.ownerId || null, dueDate: d.dueDate ? new Date(d.dueDate) : null, status: ["OPEN", "MET"].includes(String(d.status)) ? d.status : "OPEN", evidenceUrl: d.evidenceUrl || null, improvement: d.improvement?.slice(0, 2000) || null, checkedAt: new Date(), updatedAt: new Date() };
  if (d.id) { await db.complianceItem.updateMany({ where: { id: d.id, chairmanId }, data }); return; }
  if (!d.body || !d.code || !d.title) throw new Error("Give the body (HEC, QEC, NCEAC…), a code and the requirement.");
  await db.complianceItem.create({ data: { id: randomUUID(), chairmanId, body: d.body.slice(0, 20), code: d.code.slice(0, 40), title: d.title.slice(0, 300), ...data } });
}
/** Daily: items past their date and not met go to their owner and the QEC (cron). */
export async function complianceAlerts() {
  const rows = ((await db.complianceItem?.findMany({ where: { status: { not: "MET" }, dueDate: { lt: new Date(), gte: new Date(Date.now() - 864e5) } } }).catch(() => [])) || []) as (CItem & { chairmanId: string })[];
  for (const r of rows) await notifyUsers([r.ownerId, r.chairmanId], { kind: "APPROVAL", title: `${r.body} ${r.code} is slipping`, body: r.title.slice(0, 160), href: "/compliance" }).catch(() => null);
  return rows.length;
}

// ---- Reports page.
export const REPORTS: { kind: string; title: string; href: string; who: string }[] = [
  { kind: "SAR", title: "NBEAC Self-Assessment Report (SAR)", href: "/accreditation/nbeac", who: "Accreditation" },
  { kind: "AAS", title: "NCEAC AAS forms", href: "/accreditation/aas", who: "Accreditation" },
  { kind: "NCEAC", title: "NCEAC portal data", href: "/accreditation/nceac-portal", who: "Accreditation" },
  { kind: "OUTCOMES", title: "Outcomes report", href: "/accreditation/outcomes-report", who: "Accreditation" },
  { kind: "READINESS", title: "Accreditation readiness and visit dossier", href: "/accreditation/readiness", who: "Accreditation" },
  { kind: "QEC", title: "QEC proformas", href: "/qec-proformas", who: "QEC" },
  { kind: "HEMIS", title: "HEMIS export", href: "/hemis", who: "HEC" },
  { kind: "COURSEFILES", title: "Course files", href: "/coordinator/course-folders", who: "Departments" },
  { kind: "ODL", title: "ODL evidence files", href: "/collab", who: "ODL" },
  { kind: "CURRICULUM", title: "Curriculum PDFs and comparison", href: "/curriculum-compare", who: "Curriculum" },
  { kind: "PILOT", title: "Pilot figures", href: "/pilot-figures", who: "Head" },
];
export async function logReport(chairmanId: string, kind: string, byId: string) {
  const r = REPORTS.find((x) => x.kind === kind); if (!r) return null;
  await db.reportVersion?.create({ data: { id: randomUUID(), chairmanId, kind, title: r.title, byId } }).catch(() => null);
  return r.href;
}
export async function reportLog(chairmanId: string) { return ((await db.reportVersion?.findMany({ where: { chairmanId }, orderBy: { at: "desc" }, take: 60 }).catch(() => [])) || []) as { kind: string; title: string; byId: string | null; at: Date }[]; }

// ---- Scheduled reports (item 20): the reports an institute ticks are refreshed into the log on the 1st of each month
// and the Institute Head gets one notice with the links (each opens with the month's live figures and its PDF button).
export async function reportSchedule(chairmanId: string): Promise<string[]> {
  const { allStored } = await import("./scopedSettings");
  const r = (await allStored(chairmanId)).find((x) => x.scopeType === "INSTITUTE" && x.key === "reports.schedule");
  try { return r ? (JSON.parse(r.value) as string[]).filter((k) => REPORTS.some((x) => x.kind === k)) : []; } catch { return []; }
}
export async function saveReportSchedule(chairmanId: string, kinds: string[], byId: string) {
  const { saveSetting } = await import("./scopedSettings");
  await saveSetting(chairmanId, "INSTITUTE", chairmanId, "reports.schedule", JSON.stringify(kinds.filter((k) => REPORTS.some((x) => x.kind === k))), byId);
}
export async function scheduledReports(chairmanId: string) {
  const kinds = await reportSchedule(chairmanId); if (!kinds.length) return 0;
  for (const k of kinds) { const r = REPORTS.find((x) => x.kind === k)!; await db.reportVersion?.create({ data: { id: randomUUID(), chairmanId, kind: k, title: `${r.title} (monthly)`, byId: chairmanId } }).catch(() => null); }
  await notifyUsers([chairmanId], { kind: "INFO", title: `This month's reports are ready (${kinds.length})`, body: kinds.map((k) => REPORTS.find((x) => x.kind === k)!.title).join(" · "), href: "/reports-center" }).catch(() => null);
  return kinds.length;
}
