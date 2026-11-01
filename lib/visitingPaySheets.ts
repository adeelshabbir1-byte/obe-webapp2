import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { vdb, ruleFor, setVisiting, type Claim, type Line } from "./visitingPay";
import { lateOf, paySheet, periodRange, toMin, DEFAULT_TAX, type LateRule, type TaxTable, type LateMode } from "./visitingPayCore";

// Visiting pay, the rest of Prompt 10 section 10 on top of lib/visitingPay.ts: the institute's late and tax rules and the
// pay period, each teacher's category / hourly rate / filer status and the term's rate card, accepting or rejecting each
// mismatch between the class log, the biometric record and the timetable, pay sheets (verified hours × rate + PhD bonus
// − late deductions − income tax = net) the HOD approves and Accounts marks paid, the late-arrival report for every
// teacher, and handing unassigned courses to "Visiting Faculty (to be decided)".

type Who = { id: string; role: string; name: string; managedById: string | null; departmentId?: string | null };
export type PaySetting = { lateMode: LateMode; lateFixed: number; lateEveryN: number; periodWeeks: number; tax: TaxTable; biometricMap: Record<string, string> };

export async function settingOf(chairmanId: string): Promise<PaySetting> {
  const r = await vdb.visitingPaySetting?.findUnique({ where: { chairmanId } }).catch(() => null);
  let tax: TaxTable = DEFAULT_TAX, map: Record<string, string> = {};
  try { tax = r ? { ...DEFAULT_TAX, ...JSON.parse(r.taxJson) } : DEFAULT_TAX; } catch { tax = DEFAULT_TAX; }
  try { map = r ? JSON.parse(r.biometricMapJson || "{}") : {}; } catch { map = {}; }
  return { lateMode: (r?.lateMode as LateMode) || "PCT", lateFixed: r?.lateFixed ?? 0, lateEveryN: r?.lateEveryN ?? 3, periodWeeks: r?.periodWeeks ?? 4, tax, biometricMap: map };
}
export async function saveSetting(chairmanId: string, s: Partial<PaySetting>, by: string) {
  const cur = await settingOf(chairmanId);
  const n = { ...cur, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) } as PaySetting;
  const data = { lateMode: ["FIXED", "PCT", "MINUTES", "COUNT"].includes(n.lateMode) ? n.lateMode : "PCT", lateFixed: Math.max(0, Number(n.lateFixed) || 0), lateEveryN: Math.max(1, Math.round(Number(n.lateEveryN) || 3)), periodWeeks: Math.max(1, Math.round(Number(n.periodWeeks) || 4)), taxJson: JSON.stringify(n.tax), biometricMapJson: JSON.stringify(n.biometricMap || {}), updatedById: by, updatedAt: new Date() };
  await vdb.visitingPaySetting.upsert({ where: { chairmanId }, create: { chairmanId, ...data }, update: data });
}
async function lateRule(chairmanId: string, departmentId: string | null): Promise<LateRule> {
  const [rule, s] = await Promise.all([ruleFor(chairmanId, departmentId), settingOf(chairmanId)]);
  return { graceMin: rule?.lateGraceMin ?? 10, mode: s.lateMode, fixed: s.lateFixed, pct: rule?.latePenaltyPct ?? 0, everyN: s.lateEveryN };
}

/** A teacher's category, hourly rate override and filer status. */
export async function saveProfile(chairmanId: string, userId: string, p: { category?: string | null; ratePerHour?: number | null; filer?: boolean }) {
  const data = { category: p.category ? String(p.category).slice(0, 60) : null, ratePerHour: p.ratePerHour !== null && p.ratePerHour !== undefined && Number(p.ratePerHour) > 0 ? Number(p.ratePerHour) : null, filer: p.filer !== false, updatedAt: new Date() };
  await vdb.visitingPayProfile.upsert({ where: { userId }, create: { userId, chairmanId, ...data }, update: data });
}
export async function saveRate(chairmanId: string, termLabel: string, category: string, ratePerHour: number) {
  if (!termLabel || !category || !(ratePerHour > 0)) throw new Error("Give the term, the category and the rate per hour.");
  await vdb.visitingRateCard.upsert({ where: { chairmanId_termLabel_category: { chairmanId, termLabel, category } }, create: { id: randomUUID(), chairmanId, termLabel, category, ratePerHour }, update: { ratePerHour, updatedAt: new Date() } });
}
/** The hourly rate: the teacher's own override, else the term's rate for their category, else the department rule's rate. */
export async function rateFor(chairmanId: string, userId: string, termLabel: string, departmentId: string | null) {
  const p = await vdb.visitingPayProfile?.findUnique({ where: { userId } }).catch(() => null);
  if (p?.ratePerHour) return { rate: Number(p.ratePerHour), filer: p.filer !== false, source: "own rate" };
  const card = p?.category ? await vdb.visitingRateCard?.findFirst({ where: { chairmanId, termLabel, category: p.category } }).catch(() => null) : null;
  if (card) return { rate: Number(card.ratePerHour), filer: p?.filer !== false, source: `${p!.category} rate for ${termLabel}` };
  const rule = await ruleFor(chairmanId, departmentId);
  return { rate: rule?.rateTheory || 0, filer: p?.filer !== false, source: "department rule" };
}
export const termLabelOf = (d: Date) => `${d.getUTCMonth() < 6 ? "Spring" : "Fall"} ${d.getUTCFullYear()}`;
const hasPhd = async (userId: string) => (await prisma.facultyRecord.count({ where: { userId, kind: "EDUCATION", title: { contains: "PhD", mode: "insensitive" } } }).catch(() => 0)) > 0;

/** The Program Lead accepts or rejects one mismatch (log vs biometric vs timetable), with a reason. */
export async function decideLine(by: Who, claimId: string, lectureNumber: number, accept: boolean, reason: string) {
  const c = (await vdb.visitingClaim.findUnique({ where: { id: claimId } })) as Claim | null;
  if (!c) throw new Error("Claim not found.");
  const course = await prisma.course.findUnique({ where: { id: c.courseId }, select: { coordinatorId: true } });
  if (course?.coordinatorId !== by.id) throw new Error("Only the course's Program Lead decides.");
  if (reason.trim().length < 3) throw new Error("Give the reason.");
  const lines = (JSON.parse(c.linesJson) as (Line & { decision?: string; decisionReason?: string })[]).map((l) => (l.lectureNumber === lectureNumber ? { ...l, counted: accept, decision: accept ? "ACCEPTED" : "REJECTED", decisionReason: reason.trim().slice(0, 300) } : l));
  await vdb.visitingClaim.update({ where: { id: claimId }, data: { linesJson: JSON.stringify(lines), updatedAt: new Date() } });
}

/** A teacher's pay sheet for a period: the verified classes of their vetted claims. */
export async function buildSheet(by: Who, chairmanId: string, userId: string, at = new Date()) {
  const [rule0, s] = await Promise.all([ruleFor(chairmanId, null), settingOf(chairmanId)]);
  const mode = rule0?.period === "SEMESTER" ? "SEMESTER" : s.periodWeeks && rule0?.period === "WEEKS" ? "WEEKS" : rule0?.period || "MONTHLY";
  const [from, to] = periodRange(at, mode, s.periodWeeks);
  const claims = ((await vdb.visitingClaim.findMany({ where: { chairmanId, userId, status: { in: ["PL_FORWARDED", "DEAN_APPROVED"] }, periodStart: { lte: to }, periodEnd: { gte: from } } })) as Claim[]);
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true, name: true } });
  const late = await lateRule(chairmanId, u?.departmentId || null);
  const { rate, filer } = await rateFor(chairmanId, userId, termLabelOf(from), u?.departmentId || null);
  const lines = claims.flatMap((c) => (JSON.parse(c.linesJson) as Line[]).filter((l) => l.counted).map((l) => { const lt = l.mode === "ON_CAMPUS" ? lateOf(l.start, l.inAt, late.graceMin) : { late: false, minutes: 0 }; return { courseId: c.courseId, lecture: l.lectureNumber, date: l.date, start: l.start, inAt: l.inAt, minutes: l.minutes, lateMinutes: lt.minutes, late: lt.late }; }));
  const phd = rule0?.phdBonusPct && (await hasPhd(userId)) ? rule0.phdBonusPct : 0;
  const sh = paySheet(lines, rate, late, s.tax, filer, phd);
  const ex = await vdb.visitingPaySheet.findFirst({ where: { chairmanId, userId, periodStart: from } });
  if (ex && ex.status !== "DRAFT") throw new Error("This period's pay sheet is already approved.");
  const data = { periodEnd: to, claimIdsJson: JSON.stringify(claims.map((c) => c.id)), linesJson: JSON.stringify(lines), hours: sh.hours, rate, gross: sh.gross, deductions: sh.deductions, bonus: sh.bonus, tax: sh.tax, net: sh.net };
  if (ex) await vdb.visitingPaySheet.update({ where: { id: ex.id }, data });
  const id = ex?.id || randomUUID();
  if (!ex) await vdb.visitingPaySheet.create({ data: { id, chairmanId, userId, periodStart: from, status: "DRAFT", ...data } });
  await writeAuditLog({ actorUserId: by.id, action: "VISITING_SHEET_BUILT", entityType: "User", entityId: userId, metadata: { from: from.toISOString().slice(0, 10), net: sh.net } });
  return { id, ...sh, rate };
}
/** The teacher's Head of Department approves the sheet; then it goes to Accounts. */
export async function hodApprove(by: Who, chairmanId: string, sheetId: string) {
  const sh = await vdb.visitingPaySheet.findUnique({ where: { id: sheetId } });
  if (!sh || sh.chairmanId !== chairmanId) throw new Error("Pay sheet not found.");
  if (sh.status !== "DRAFT") throw new Error("Already approved.");
  const t = await prisma.user.findUnique({ where: { id: sh.userId }, select: { departmentId: true } });
  if (!(by.role === "CHAIRMAN" || (by.role === "HEAD_OF_DEPARTMENT" && by.departmentId && by.departmentId === t?.departmentId))) throw new Error("The teacher's Head of Department approves the pay sheet.");
  await vdb.visitingPaySheet.update({ where: { id: sheetId }, data: { status: "HOD_APPROVED", hodId: by.id, hodAt: new Date() } });
  const fin = await prisma.user.findMany({ where: { role: "FINANCE_OFFICER" as never, OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }, select: { id: true } });
  await notifyUsers(fin.map((f) => f.id), { kind: "ASSIGNMENT", title: "Visiting pay sheet to pay", body: `Net Rs ${Number(sh.net).toLocaleString("en-PK")}`, href: "/visiting-pay" }).catch(() => null);
}
/** Accounts marks the sheet paid (date and reference); its claims are paid too; the teacher sees it. */
export async function markSheetPaid(by: Who, chairmanId: string, sheetId: string, ref: string, date?: string) {
  const sh = await vdb.visitingPaySheet.findUnique({ where: { id: sheetId } });
  if (!sh || sh.chairmanId !== chairmanId) throw new Error("Pay sheet not found.");
  if (sh.status !== "HOD_APPROVED") throw new Error("The HOD has not approved this pay sheet yet.");
  const paidAt = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date();
  await vdb.visitingPaySheet.update({ where: { id: sheetId }, data: { status: "PAID", paidRef: ref.trim().slice(0, 120) || null, paidAt } });
  const ids = JSON.parse(sh.claimIdsJson || "[]") as string[];
  if (ids.length) await vdb.visitingClaim.updateMany({ where: { id: { in: ids } }, data: { status: "PAID", paidRef: ref.trim().slice(0, 120) || null, paidAt } }).catch(() => null);
  await notifyUsers([sh.userId], { kind: "ASSIGNMENT", title: "Visiting pay paid", body: `Rs ${Number(sh.net).toLocaleString("en-PK")} · ${ref}`, href: "/visiting-pay" }).catch(() => null);
  await writeAuditLog({ actorUserId: by.id, action: "VISITING_SHEET_PAID", entityType: "VisitingPaySheet", entityId: sheetId, metadata: { ref } });
}
export async function sheetsOf(where: Record<string, unknown>) {
  return (await vdb.visitingPaySheet?.findMany({ where, orderBy: { periodStart: "desc" }, take: 200 }).catch(() => [])) as { id: string; userId: string; periodStart: Date; periodEnd: Date; hours: number; rate: number; gross: number; bonus: number; deductions: number; tax: number; net: number; status: string; paidRef: string | null; paidAt: Date | null; linesJson: string }[];
}
export async function sheetPdf(sheetId: string) {
  const sh = await vdb.visitingPaySheet.findUnique({ where: { id: sheetId } });
  if (!sh) throw new Error("Pay sheet not found.");
  const [u, head] = await Promise.all([prisma.user.findUnique({ where: { id: sh.userId }, select: { name: true, department_: { select: { name: true } } } }), prisma.user.findUnique({ where: { id: sh.chairmanId }, select: { instituteName: true } })]);
  const lines = JSON.parse(sh.linesJson || "[]") as { date: string; lecture: number; start: string | null; inAt: string | null; minutes: number; late: boolean; lateMinutes: number }[];
  const { PdfDoc } = await import("./pdfDoc");
  const pdf = await PdfDoc.create(`${head?.instituteName || ""} — visiting pay sheet`);
  pdf.title("Visiting pay sheet", `${u?.name || ""}${u?.department_?.name ? ` · ${u.department_.name}` : ""} · ${sh.periodStart.toISOString().slice(0, 10)} to ${sh.periodEnd.toISOString().slice(0, 10)}`);
  pdf.table([["Date", 80], ["Lecture", 50], ["Class starts", 70], ["In (biometric)", 80], ["Minutes", 60], ["Late", 80]], lines.map((l) => [l.date, `L${l.lecture}`, l.start || "—", l.inAt || "—", l.minutes, l.late ? `${l.lateMinutes} min` : ""]), { size: 8.5 });
  pdf.kv([["Verified hours", sh.hours], ["Rate per hour", `Rs ${sh.rate}`], ["Gross", `Rs ${sh.gross}`], ["PhD bonus", `Rs ${sh.bonus}`], ["Late deductions", `Rs ${sh.deductions}`], ["Income tax", `Rs ${sh.tax}`], ["Net pay", `Rs ${sh.net}`], ["Status", sh.status === "PAID" ? `Paid ${sh.paidAt ? sh.paidAt.toISOString().slice(0, 10) : ""} (${sh.paidRef || ""})` : sh.status === "HOD_APPROVED" ? "Approved by the HOD — with Accounts" : "Draft — waiting for the HOD"]]);
  return { bytes: await pdf.save(), name: `pay-sheet-${(u?.name || "teacher").replace(/[^A-Za-z0-9]+/g, "-")}-${sh.periodStart.toISOString().slice(0, 7)}.pdf` };
}

/** Late arrivals of every teacher (permanent, shared, visiting) in a month: classes from the timetable vs the biometric "in". */
export async function lateReport(chairmanId: string, month: string) {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  const from = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
  const grace = (await ruleFor(chairmanId, null))?.lateGraceMin ?? 10;
  const entries = await prisma.timetableEntry.findMany({ where: { scheduleSection: { course: { coordinator: { managedById: chairmanId } } } }, select: { dayOfWeek: true, startHour: true, scheduleSection: { select: { instructorId: true } } }, take: 5000 }).catch(() => []);
  const punches = ((await vdb.biometricPunch?.findMany({ where: { chairmanId, date: { gte: from.toISOString().slice(0, 10), lte: to.toISOString().slice(0, 10) } } }).catch(() => [])) || []) as { userId: string; date: string; inAt: string | null }[];
  const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const per = new Map<string, { lates: number; minutes: number; weeks: Record<string, { lates: number; minutes: number }> }>();
  for (const p of punches) {
    const d = new Date(`${p.date}T00:00:00Z`);
    const first = entries.filter((e) => e.scheduleSection.instructorId === p.userId && e.dayOfWeek.toLowerCase().startsWith(DAYS[d.getUTCDay()])).map((e) => e.startHour).sort((a, b) => a - b)[0];
    if (first === undefined) continue;
    const start = `${String(Math.floor(first)).padStart(2, "0")}:${String(Math.round((first % 1) * 60)).padStart(2, "0")}`;
    const lt = lateOf(start, p.inAt, grace);
    if (!lt.late) continue;
    const wk = `W${Math.ceil(d.getUTCDate() / 7)}`;
    const e = per.get(p.userId) || { lates: 0, minutes: 0, weeks: {} };
    e.lates++; e.minutes += lt.minutes; e.weeks[wk] = { lates: (e.weeks[wk]?.lates || 0) + 1, minutes: (e.weeks[wk]?.minutes || 0) + lt.minutes };
    per.set(p.userId, e);
  }
  const users = await prisma.user.findMany({ where: { id: { in: Array.from(per.keys()).concat("none") } }, select: { id: true, name: true, department_: { select: { name: true } } } });
  const types = new Map((await prisma.facultyProfile.findMany({ where: { userId: { in: users.map((x) => x.id) } }, select: { userId: true, employmentType: true } })).map((p) => [p.userId, p.employmentType]));
  return users.map((x) => ({ userId: x.id, name: x.name, department: x.department_?.name || "", type: types.get(x.id) || "Permanent", ...per.get(x.id)! })).sort((a, b) => b.lates - a.lates);
}

/** Every offered course still without a teacher goes to "Visiting Faculty (to be decided)" in one click. */
export async function unassignedToVisiting(by: Who, chairmanId: string) {
  const { getOrCreateVisitingFaculty } = await import("./departments");
  const placeholder = await getOrCreateVisitingFaculty(chairmanId);
  const r = await prisma.course.updateMany({ where: { coordinatorId: by.id, isOffered: true, instructorId: null }, data: { instructorId: placeholder.id } });
  return r.count;
}
/** A visiting course (one on the placeholder) gets its hired teacher; it is paid as visiting teaching. */
export async function assignVisiting(by: Who, chairmanId: string, courseId: string, userId: string) {
  const c = await prisma.course.findFirst({ where: { id: courseId, coordinatorId: by.id }, select: { id: true } });
  if (!c) throw new Error("Course not found.");
  await prisma.course.update({ where: { id: courseId }, data: { instructorId: userId } });
  await prisma.courseSectionAssignment.updateMany({ where: { courseId }, data: { instructorId: userId } }).catch(() => null);
  return setVisiting(by, chairmanId, courseId, userId, true, "Visiting course");
}
export { toMin };
