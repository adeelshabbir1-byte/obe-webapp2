import crypto from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";

// Visiting teaching pay. A section marked Visiting (a visiting teacher, or a permanent teacher above their load) is paid
// per the Dean's rules. Each period the claim is pre-filled from the lecture log, the timetable and the biometric
// record; the teacher adds reasons and sends it → Program Lead vets (adjusts) → Dean vets → Accounts pays.

export const vdb = prisma as unknown as Record<string, any>;
export const VP_HINT = "Visiting-pay tables are not set up yet — run the latest migration (System Health → Run migrations).";
export const BASES = [["LECTURE", "Per lecture"], ["CREDIT_HOUR", "Per credit hour (per month)"], ["MONTH", "Fixed per month"], ["SEMESTER", "Lump sum per semester"]] as const;
export const STATUS: Record<string, string> = { DRAFT: "Draft — teacher to send", SUBMITTED: "With the Program Lead", PL_HELD: "Held by the Program Lead", PL_FORWARDED: "With the Dean", DEAN_RETURNED: "Returned by the Dean", DEAN_APPROVED: "With Accounts", PAID: "Paid" };

export type Rule = { id: string; chairmanId: string; departmentId: string | null; basis: string; rateTheory: number; rateLab: number; phdBonusPct: number; period: string; lateGraceMin: number; latePenaltyPct: number; marksWithinDays: number; requireAttendance: boolean; requireTopics: boolean; updatedById: string };
export type Assign = { id: string; chairmanId: string; courseId: string; userId: string; basis: string | null; rate: number | null; note: string | null; active: boolean };
export type Line = { lectureNumber: number; date: string; start: string | null; end: string | null; minutes: number; mode: "ON_CAMPUS" | "ONLINE"; topic: string; attendance: boolean; inAt: string | null; outAt: string | null; flag: string | null; reason: string | null; counted: boolean; plNote: string | null };
export type Claim = { id: string; chairmanId: string; assignmentId: string; courseId: string; userId: string; periodStart: Date; periodEnd: Date; linesJson: string; requirementsJson: string; amount: number; adjustedAmount: number | null; status: string; teacherNote: string | null; plNote: string | null; deanNote: string | null; paidRef: string | null; paidAt: Date | null; createdAt: Date; updatedAt: Date };

// ---------------------------------------------------------------- rules (Dean / Institute Head)
export async function ruleFor(chairmanId: string, departmentId: string | null): Promise<Rule | null> {
  const rs = ((await vdb.visitingPayRule.findMany({ where: { chairmanId } }).catch(() => [])) as Rule[]);
  return rs.find((r) => r.departmentId === departmentId) || rs.find((r) => r.departmentId === null) || null;
}
export async function saveRule(by: { id: string }, chairmanId: string, a: Record<string, unknown>) {
  const num = (k: string, d = 0) => { const n = Number(a[k]); return Number.isFinite(n) && n >= 0 ? n : d; };
  const departmentId = a.departmentId ? String(a.departmentId) : null;
  const basis = BASES.some(([k]) => k === a.basis) ? String(a.basis) : "LECTURE";
  const data = { basis, rateTheory: num("rateTheory"), rateLab: num("rateLab"), phdBonusPct: num("phdBonusPct"), period: a.period === "SEMESTER" ? "SEMESTER" : "MONTHLY", lateGraceMin: num("lateGraceMin", 10), latePenaltyPct: num("latePenaltyPct", 0), marksWithinDays: num("marksWithinDays", 14), requireAttendance: a.requireAttendance !== false, requireTopics: a.requireTopics !== false, updatedById: by.id };
  const ex = ((await vdb.visitingPayRule.findFirst({ where: { chairmanId, departmentId } })) as Rule | null);
  if (ex) await vdb.visitingPayRule.update({ where: { id: ex.id }, data });
  else await vdb.visitingPayRule.create({ data: { id: crypto.randomUUID(), chairmanId, departmentId, ...data } });
  await writeAuditLog({ actorUserId: by.id, action: "VISITING_PAY_RULE", entityType: "User", entityId: chairmanId, metadata: { departmentId, ...data } as never });
  return "Rules saved.";
}

// ---------------------------------------------------------------- marking a section Visiting
export async function setVisiting(by: { id: string }, chairmanId: string, courseId: string, userId: string, on: boolean, note = "") {
  const c = await prisma.course.findFirst({ where: { id: courseId, coordinator: { managedById: chairmanId } }, select: { id: true } });
  if (!c) throw new Error("Course not found.");
  const ex = ((await vdb.visitingAssignment.findFirst({ where: { courseId, userId } })) as Assign | null);
  if (ex) await vdb.visitingAssignment.update({ where: { id: ex.id }, data: { active: on, note: note || ex.note } });
  else if (on) await vdb.visitingAssignment.create({ data: { id: crypto.randomUUID(), chairmanId, courseId, userId, active: true, note: note || null } });
  await writeAuditLog({ actorUserId: by.id, action: on ? "VISITING_MARKED" : "VISITING_UNMARKED", entityType: "Course", entityId: courseId, metadata: { userId } });
  return on ? "Marked as visiting teaching — it gets a pay claim each period." : "No longer visiting.";
}

// ---------------------------------------------------------------- biometric upload
/** Rows: code (employee code or CNIC), date, time in, time out. */
export async function saveBiometric(by: { id: string }, chairmanId: string, rows: { code: string; date: string; inAt: string; outAt: string }[]) {
  const profs = await prisma.facultyProfile.findMany({ where: { OR: [{ employeeCode: { not: null } }, { cnic: { not: null } }] }, select: { userId: true, employeeCode: true, cnic: true } });
  const byCode = new Map<string, string>();
  for (const p of profs) { if (p.employeeCode) byCode.set(p.employeeCode.trim().toLowerCase(), p.userId); if (p.cnic) byCode.set(p.cnic.replace(/\D/g, ""), p.userId); }
  let saved = 0; const unmatched = new Set<string>();
  for (const r of rows) {
    const uid = byCode.get(r.code.trim().toLowerCase()) || byCode.get(r.code.replace(/\D/g, ""));
    const day = new Date(r.date); if (isNaN(day.getTime())) continue;
    if (!uid) { unmatched.add(r.code); continue; }
    const date = day.toISOString().slice(0, 10);
    await vdb.biometricPunch.upsert({ where: { userId_date: { userId: uid, date } }, create: { id: crypto.randomUUID(), chairmanId, userId: uid, date, inAt: r.inAt || null, outAt: r.outAt || null }, update: { inAt: r.inAt || null, outAt: r.outAt || null } });
    saved++;
  }
  await writeAuditLog({ actorUserId: by.id, action: "BIOMETRIC_UPLOADED", entityType: "User", entityId: chairmanId, metadata: { saved, unmatched: unmatched.size } });
  return `Saved ${saved} day record(s).${unmatched.size ? ` ${unmatched.size} code(s) matched no one (set the employee code or CNIC in their profile): ${Array.from(unmatched).slice(0, 8).join(", ")}${unmatched.size > 8 ? "…" : ""}.` : ""}`;
}

// ---------------------------------------------------------------- building a claim
const hm = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
const mins = (t: string | null) => { if (!t) return null; const m = t.match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function periodOf(d: Date, period: string): [Date, Date] {
  if (period === "SEMESTER") return [new Date(d.getFullYear(), d.getMonth() < 6 ? 0 : 6, 1), new Date(d.getFullYear(), d.getMonth() < 6 ? 6 : 12, 0, 23, 59)];
  return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59)];
}

/** Pre-fill (or refresh, while still a draft) the claim of one visiting assignment for the period containing `at`. */
export async function buildClaim(assignmentId: string, at = new Date()) {
  const a = ((await vdb.visitingAssignment.findUnique({ where: { id: assignmentId } })) as Assign | null);
  if (!a) throw new Error("Not a visiting assignment.");
  const c = await prisma.course.findUnique({ where: { id: a.courseId }, select: { id: true, code: true, title: true, creditHours: true, hasLab: true, labPct: true, coordinator: { select: { departmentId: true } } } });
  if (!c) throw new Error("Course not found.");
  const rule = await ruleFor(a.chairmanId, c.coordinator.departmentId);
  const [from, to] = periodOf(at, rule?.period || "MONTHLY");
  const lectures = await prisma.lectureRow.findMany({ where: { courseId: c.id, source: "INSTRUCTOR", actualDate: { gte: from, lte: to } }, select: { id: true, lectureNumber: true, topic: true, actualDate: true, teachingMethod: true, _count: { select: { attendanceRecords: true } } }, orderBy: { actualDate: "asc" } });
  const slots = await prisma.timetableEntry.findMany({ where: { scheduleSection: { courseId: c.id, instructorId: a.userId } }, select: { dayOfWeek: true, startHour: true, endHour: true }, orderBy: { timetableRunId: "desc" }, take: 10 }).catch(() => []);
  const punches = ((await vdb.biometricPunch.findMany({ where: { userId: a.userId, date: { gte: from.toISOString().slice(0, 10), lte: to.toISOString().slice(0, 10) } } }).catch(() => [])) as { date: string; inAt: string | null; outAt: string | null }[]);
  const old = ((await vdb.visitingClaim.findFirst({ where: { assignmentId, periodStart: from } })) as Claim | null);
  const oldLines = old ? (JSON.parse(old.linesJson) as Line[]) : [];
  const grace = rule?.lateGraceMin ?? 10;
  const lines: Line[] = lectures.map((l) => {
    const d = l.actualDate!; const date = d.toISOString().slice(0, 10);
    const slot = slots.find((s) => s.dayOfWeek.toLowerCase().startsWith(DAYS[d.getDay()].toLowerCase().slice(0, 3)));
    const start = slot ? hm(slot.startHour) : null, end = slot ? hm(slot.endHour) : null;
    const prev = oldLines.find((x) => x.lectureNumber === l.lectureNumber);
    const mode: "ON_CAMPUS" | "ONLINE" = prev?.mode || (/online|zoom|teams|meet/i.test(l.teachingMethod || "") ? "ONLINE" : "ON_CAMPUS");
    const p = punches.find((x) => x.date === date);
    let flag: string | null = null;
    if (mode === "ON_CAMPUS") {
      if (!p || (!p.inAt && !p.outAt)) flag = punches.length ? "No biometric record that day" : null;
      else if (start && p.inAt && (mins(p.inAt)! > mins(start)! + grace)) flag = `Arrived ${p.inAt} (lecture ${start})`;
      else if (end && p.outAt && mins(p.outAt)! < mins(end)!) flag = `Left ${p.outAt} (lecture ends ${end})`;
    }
    if (rule?.requireAttendance && !l._count.attendanceRecords) flag = flag ? `${flag}; no attendance marked` : "No attendance marked";
    if (rule?.requireTopics && !l.topic.trim()) flag = flag ? `${flag}; no topic logged` : "No topic logged";
    return { lectureNumber: l.lectureNumber, date, start, end, minutes: slot ? Math.round((slot.endHour - slot.startHour) * 60) : 60, mode, topic: l.topic, attendance: l._count.attendanceRecords > 0, inAt: p?.inAt || null, outAt: p?.outAt || null, flag, reason: prev?.reason || null, counted: prev ? prev.counted : true, plNote: prev?.plNote || null };
  });
  // Requirements due by the period end: assessments whose planned week has passed must have marks.
  const insts = await prisma.assessmentInstrument.findMany({ where: { courseId: c.id, source: "INSTRUCTOR" }, select: { label: true, type: true, lectureLinks: { select: { lectureRow: { select: { actualDate: true } } } }, _count: { select: { studentMarks: true } } } });
  const dueBy = new Date(to.getTime() - (rule?.marksWithinDays ?? 14) * 86400000);
  const reqs = insts.map((i) => { const held = i.lectureLinks.map((x) => x.lectureRow.actualDate).filter((x): x is Date => !!x).sort((p, q) => q.getTime() - p.getTime())[0]; return held && held <= dueBy ? { item: `${i.type}: ${i.label}`, ok: i._count.studentMarks > 0, note: i._count.studentMarks ? "marks entered" : "marks not entered" } : null; }).filter(Boolean);
  const counted = lines.filter((l) => l.counted);
  const isLab = !!c.hasLab && (c.labPct || 0) >= 100;
  const rate = a.rate ?? (isLab ? rule?.rateLab : rule?.rateTheory) ?? 0;
  const basis = a.basis || rule?.basis || "LECTURE";
  let amount = basis === "LECTURE" ? counted.length * rate : basis === "CREDIT_HOUR" ? c.creditHours * rate : rate;
  const late = counted.filter((l) => l.flag && /Arrived|Left/.test(l.flag)).length;
  if (rule?.latePenaltyPct && basis === "LECTURE") amount -= late * rate * (rule.latePenaltyPct / 100);
  amount = Math.round(amount);
  const data = { linesJson: JSON.stringify(lines), requirementsJson: JSON.stringify(reqs), amount, updatedAt: new Date() };
  if (old) { if (["DRAFT", "DEAN_RETURNED", "PL_HELD"].includes(old.status)) await vdb.visitingClaim.update({ where: { id: old.id }, data }); return old.id; }
  const id = crypto.randomUUID();
  await vdb.visitingClaim.create({ data: { id, chairmanId: a.chairmanId, assignmentId, courseId: c.id, userId: a.userId, periodStart: from, periodEnd: to, status: "DRAFT", ...data } });
  return id;
}

// ---------------------------------------------------------------- the chain: teacher → Program Lead → Dean → Accounts
export async function teacherUpdate(by: { id: string }, claimId: string, a: { reasons?: Record<string, string>; modes?: Record<string, string>; note?: string; send?: boolean }) {
  const c = ((await vdb.visitingClaim.findUnique({ where: { id: claimId } })) as Claim | null);
  if (!c || c.userId !== by.id) throw new Error("Not your claim.");
  if (!["DRAFT", "DEAN_RETURNED", "PL_HELD"].includes(c.status)) throw new Error("Already sent.");
  const lines = (JSON.parse(c.linesJson) as Line[]).map((l) => ({ ...l, reason: a.reasons?.[l.lectureNumber] !== undefined ? a.reasons[l.lectureNumber].slice(0, 300) || null : l.reason, mode: (a.modes?.[l.lectureNumber] === "ONLINE" ? "ONLINE" : a.modes?.[l.lectureNumber] === "ON_CAMPUS" ? "ON_CAMPUS" : l.mode) as Line["mode"] }));
  await vdb.visitingClaim.update({ where: { id: claimId }, data: { linesJson: JSON.stringify(lines), teacherNote: a.note?.slice(0, 1000) ?? c.teacherNote, ...(a.send ? { status: "SUBMITTED" } : {}), updatedAt: new Date() } });
  if (a.send) {
    const course = await prisma.course.findUnique({ where: { id: c.courseId }, select: { coordinatorId: true, code: true } });
    if (course) await notifyUsers([course.coordinatorId], { kind: "ASSIGNMENT", title: `Visiting pay claim to vet: ${course.code}`, body: `${lines.length} lecture(s)`, href: "/visiting-pay" }).catch(() => null);
  }
  return a.send ? "Sent to the Program Lead." : "Saved.";
}
export async function plDecide(by: { id: string }, claimId: string, a: { decision: "FORWARD" | "HOLD"; note: string; adjustedAmount?: number | null; uncount?: number[] }) {
  const c = ((await vdb.visitingClaim.findUnique({ where: { id: claimId } })) as Claim | null);
  if (!c || !["SUBMITTED", "PL_HELD", "DEAN_RETURNED"].includes(c.status)) throw new Error("Not waiting for the Program Lead.");
  const course = await prisma.course.findUnique({ where: { id: c.courseId }, select: { coordinatorId: true, code: true, coordinator: { select: { department_: { select: { facultyId: true } } } } } });
  if (course?.coordinatorId !== by.id) throw new Error("Only the course's Program Lead vets this claim.");
  if (a.decision === "HOLD" && a.note.trim().length < 3) throw new Error("Say why it is held (e.g. marks pending).");
  const lines = (JSON.parse(c.linesJson) as Line[]).map((l) => (a.uncount?.includes(l.lectureNumber) ? { ...l, counted: false } : l));
  await vdb.visitingClaim.update({ where: { id: claimId }, data: { linesJson: JSON.stringify(lines), plNote: a.note.trim() || null, adjustedAmount: a.adjustedAmount ?? c.adjustedAmount, status: a.decision === "FORWARD" ? "PL_FORWARDED" : "PL_HELD", updatedAt: new Date() } });
  const deans = a.decision === "FORWARD" && course?.coordinator.department_?.facultyId ? await prisma.user.findMany({ where: { role: "DEAN", facultyId: course.coordinator.department_.facultyId }, select: { id: true } }) : [];
  await notifyUsers(a.decision === "FORWARD" ? deans.map((d) => d.id) : [c.userId], { kind: "ASSIGNMENT", title: a.decision === "FORWARD" ? `Visiting pay claim to approve: ${course?.code}` : `Your visiting pay claim is held: ${course?.code}`, body: a.note, href: "/visiting-pay" }).catch(() => null);
  await writeAuditLog({ actorUserId: by.id, action: "VISITING_CLAIM_PL", entityType: "VisitingClaim", entityId: claimId, metadata: { decision: a.decision, adjustedAmount: a.adjustedAmount ?? null } });
  return a.decision === "FORWARD" ? "Forwarded to the Dean." : "Held; the teacher is told why.";
}
export async function deanDecide(by: { id: string }, claimId: string, approve: boolean, note: string) {
  const c = ((await vdb.visitingClaim.findUnique({ where: { id: claimId } })) as Claim | null);
  if (!c || c.status !== "PL_FORWARDED") throw new Error("Not waiting for the Dean.");
  if (!approve && note.trim().length < 3) throw new Error("Say why it is returned.");
  await vdb.visitingClaim.update({ where: { id: claimId }, data: { status: approve ? "DEAN_APPROVED" : "DEAN_RETURNED", deanNote: note.trim() || null, updatedAt: new Date() } });
  const fin = approve ? await prisma.user.findMany({ where: { role: "FINANCE_OFFICER", OR: [{ managedById: c.chairmanId }, { managedBy: { managedById: c.chairmanId } }] }, select: { id: true } }) : [];
  await notifyUsers(approve ? fin.map((f) => f.id).concat(c.userId) : [c.userId], { kind: "ASSIGNMENT", title: approve ? "Visiting pay claim approved for payment" : "Visiting pay claim returned by the Dean", body: note, href: "/visiting-pay" }).catch(() => null);
  await writeAuditLog({ actorUserId: by.id, action: "VISITING_CLAIM_DEAN", entityType: "VisitingClaim", entityId: claimId, metadata: { approve } });
  return approve ? "Approved — sent to Accounts." : "Returned to the Program Lead.";
}
export async function markPaid(by: { id: string }, claimId: string, ref: string) {
  const c = ((await vdb.visitingClaim.findUnique({ where: { id: claimId } })) as Claim | null);
  if (!c || c.status !== "DEAN_APPROVED") throw new Error("Not approved for payment.");
  await vdb.visitingClaim.update({ where: { id: claimId }, data: { status: "PAID", paidRef: ref.trim().slice(0, 120) || null, paidAt: new Date(), updatedAt: new Date() } });
  await notifyUsers([c.userId], { kind: "ASSIGNMENT", title: "Visiting pay paid", body: ref, href: "/visiting-pay" }).catch(() => null);
  await writeAuditLog({ actorUserId: by.id, action: "VISITING_CLAIM_PAID", entityType: "VisitingClaim", entityId: claimId, metadata: { ref } });
  return "Marked paid.";
}
