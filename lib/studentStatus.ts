import { randomUUID } from "crypto";
import { prisma } from "./db";
import { approverFor, type PositionKey } from "./approvers";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";
import { academicRules } from "./academicRules";
import { holdBacks, setHoldBack } from "./semesterSync";
import { balanceOf } from "./fees";
import { titlesFor } from "./titles";

// Student status changes — one request with an approval chain: the Program Lead or batch advisor raises it, the
// department's Chairman/HoD approves, then the Controller of Examinations (titles are the institute's own; a missing
// position passes to the next one up, lib/approvers.ts). When approved and its effective date has come, it is applied:
// current courses are dropped (or W after the drop deadline), the teachers are told, the degree plan is locked, held
// registrations are cancelled, earned results stay, the student keeps read-only portal access for a while, the exit
// survey and parents are informed, and the Finance Officer is asked to work out any refund.

const sdb = prisma as unknown as Record<string, any>;
export const STATUS_HINT = "Student status changes need prisma/migration_student_status.sql — run it in Supabase.";

export const TYPES: Record<string, { label: string; becomes: string | null; what: string }> = {
  DROPPED: { label: "Dropped (academic)", becomes: "DROPPED", what: "Dismissed under the Controller of Examinations' CGPA rules." },
  LEFT: { label: "Left / withdrew", becomes: "LEFT", what: "The student's own decision to leave; fees must be cleared first." },
  FREEZE: { label: "Semester freeze", becomes: "FROZEN", what: "Pause for one or two semesters, then continue with the next batch on the same curriculum." },
  TRANSFER_INTERNAL: { label: "Transfer within the institute", becomes: null, what: "Move to another program or batch; passed courses are carried over where they match." },
  TRANSFER_OUT: { label: "Transfer out", becomes: "TRANSFERRED", what: "Move to another university; a transcript and course outlines pack is prepared." },
  TRANSFER_IN: { label: "Transfer in (credit transfer)", becomes: null, what: "Credits from another university, shown as TR on the transcript with no grade points." },
  RUSTICATED: { label: "Rusticated / expelled", becomes: "RUSTICATED", what: "Disciplinary, linked to the case record." },
  READMISSION: { label: "Readmission", becomes: "ACTIVE", what: "Reverses Left, Dropped, Freeze or Rustication; earlier results are kept." },
};
/** Statuses with which the portal is read-only (and switched off after the policy's period). */
export const AWAY = ["LEFT", "DROPPED", "FROZEN", "TRANSFERRED", "RUSTICATED"];
export const STUDENT_STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", GRADUATED: "Graduated", LEFT: "Left", DROPPED: "Dropped", FROZEN: "Semester frozen", TRANSFERRED: "Transferred out", RUSTICATED: "Rusticated" };

export type Policy = { transferMinGrade: string; transferMaxPct: number; dropDeadlineWeek: number; readOnlyDays: number };
export const DEFAULT_POLICY: Policy = { transferMinGrade: "C", transferMaxPct: 50, dropDeadlineWeek: 8, readOnlyDays: 180 };
export async function policyFor(chairmanId: string): Promise<Policy> {
  try { const r = await sdb.studentStatusPolicy.findUnique({ where: { chairmanId } }); return r ? { transferMinGrade: r.transferMinGrade, transferMaxPct: r.transferMaxPct, dropDeadlineWeek: r.dropDeadlineWeek, readOnlyDays: r.readOnlyDays } : DEFAULT_POLICY; } catch { return DEFAULT_POLICY; }
}
export async function savePolicy(chairmanId: string, p: Policy, by: string) {
  const data = { transferMinGrade: p.transferMinGrade, transferMaxPct: Math.max(0, Math.min(100, Math.round(p.transferMaxPct))), dropDeadlineWeek: Math.max(1, Math.min(20, Math.round(p.dropDeadlineWeek))), readOnlyDays: Math.max(0, Math.min(3650, Math.round(p.readOnlyDays))), updatedById: by, updatedAt: new Date() };
  await sdb.studentStatusPolicy.upsert({ where: { chairmanId }, create: { id: randomUUID(), chairmanId, ...data }, update: data });
}

export const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"];
export const gradeOk = (g: string | null | undefined, min: string) => { const i = GRADES.indexOf((g || "").toUpperCase().trim()), m = GRADES.indexOf(min); return i >= 0 && m >= 0 && i <= m; };

export type Req = { id: string; chairmanId: string; studentId: string; type: string; effectiveDate: Date; reason: string; fromStatus: string | null; freezeSemesters: number | null; targetBatchId: string | null; otherInstitute: string | null; caseReference: string | null; docName: string | null; docType: string | null; creditsJson: string; suggested: boolean; feeOverride: boolean; status: string; stage: string; raisedById: string; raisedAs: string; appliedAt: Date | null; effectsJson: string; decidedAt: Date | null; createdAt: Date };
export type Credit = { id: string; requestId: string; studentId: string; fromCode: string; fromTitle: string; creditHours: number; grade: string | null; toCode: string | null; status: string; note: string | null; decidedById: string | null };

async function studentCtx(studentId: string) {
  return prisma.student.findUnique({ where: { id: studentId }, select: { id: true, name: true, rollNumber: true, status: true, batchId: true, batch: { select: { id: true, degreeProgram: true, batchName: true, coordinatorId: true, advisorId: true, startYear: true, coordinator: { select: { managedById: true, departmentId: true } } } } } });
}

export const STAGES: { stage: string; key: PositionKey; label: string }[] = [
  { stage: "HOD", key: "HEAD_OF_DEPARTMENT", label: "Chairman / HoD" },
  { stage: "CONTROLLER", key: "EXAM_CONTROLLER", label: "Controller of Examinations" },
];
/** Who decides a stage of this request now (acting holders and covering positions included). */
export async function stageApprovers(r: { chairmanId: string; studentId: string }, stage: string) {
  const st = await studentCtx(r.studentId);
  const s = STAGES.find((x) => x.stage === stage);
  if (!s || !st) return { ids: [] as string[], note: "" };
  const a = await approverFor(r.chairmanId, s.key, { departmentId: st.batch.coordinator.departmentId });
  return { ids: a.ids, note: a.covering ? a.note : "" };
}

/** May this person raise a request for this student? The batch's Program Lead, its advisor, or the Institute Head. */
export async function canRaise(user: { id: string; role: string }, studentId: string) {
  const st = await studentCtx(studentId);
  if (!st) return null;
  const chairmanId = st.batch.coordinator.managedById || "";
  if (user.role === "CHAIRMAN" && user.id === chairmanId) return { st, chairmanId, as: "INSTITUTE_HEAD" };
  if (st.batch.coordinatorId === user.id) return { st, chairmanId, as: "PROGRAM_LEAD" };
  if (st.batch.advisorId === user.id) return { st, chairmanId, as: "ADVISOR" };
  return null;
}

/** Program credits of a batch (non-credit courses left out). */
async function programCredits(batchId: string) {
  const cs = await prisma.course.findMany({ where: { batchId, isNonCredit: false }, select: { creditHours: true } });
  return cs.reduce((a, c) => a + c.creditHours, 0);
}

/** Courses carried over by an internal transfer: passed courses whose code or title is in the target batch's scheme. */
async function carryOver(studentId: string, targetBatchId: string) {
  const [recs, target] = await Promise.all([
    prisma.studentTranscriptRecord.findMany({ where: { studentId }, select: { courseCode: true, courseTitle: true, creditHours: true, grade: true, gpaPoints: true } }),
    prisma.course.findMany({ where: { batchId: targetBatchId }, select: { code: true, title: true } }),
  ]);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const best = new Map<string, (typeof recs)[number]>();
  for (const r of recs) { const passed = r.grade === "P" || (r.gpaPoints !== null && r.gpaPoints > 0); if (!passed) continue; const k = r.courseCode.toUpperCase(); if (!best.has(k) || (best.get(k)!.gpaPoints || 0) < (r.gpaPoints || 0)) best.set(k, r); }
  return Array.from(best.values()).map((r) => {
    const m = target.find((t) => t.code.toUpperCase() === r.courseCode.toUpperCase()) || target.find((t) => norm(t.title) === norm(r.courseTitle));
    return { fromCode: r.courseCode, fromTitle: r.courseTitle, creditHours: r.creditHours, grade: r.grade, toCode: m?.code || null, status: m ? "MATCHED" : "PENDING" };
  });
}

export type RaiseInput = { studentId: string; type: string; effectiveDate: Date; reason: string; freezeSemesters?: number | null; targetBatchId?: string | null; otherInstitute?: string | null; caseReference?: string | null; doc?: { name: string; type: string; data: string } | null; credits?: { code: string; title: string; creditHours: number; grade: string; toCode?: string | null }[]; suggested?: boolean };
export async function raise(user: { id: string; role: string; name: string }, inp: RaiseInput) {
  if (!TYPES[inp.type]) throw new Error("Choose the kind of change.");
  const who = await canRaise(user, inp.studentId);
  if (!who) throw new Error("Only the batch's Program Lead or advisor (or the Institute Head) can raise this.");
  const { st, chairmanId } = who;
  if (!inp.reason.trim()) throw new Error("Give the reason.");
  if (inp.type === "READMISSION" && !AWAY.includes(st.status)) throw new Error("Readmission is for a student who left, was dropped, froze or was rusticated.");
  if (inp.type !== "READMISSION" && AWAY.includes(st.status)) throw new Error(`The student is already ${STUDENT_STATUS_LABEL[st.status] || st.status}. Raise a readmission first.`);
  if (inp.type === "FREEZE" && ![1, 2].includes(Number(inp.freezeSemesters))) throw new Error("A freeze is for one or two semesters.");
  if (inp.type === "TRANSFER_INTERNAL") {
    const t = inp.targetBatchId ? await prisma.batch.findFirst({ where: { id: inp.targetBatchId, coordinator: { managedById: chairmanId } }, select: { id: true } }) : null;
    if (!t || t.id === st.batchId) throw new Error("Choose the program and batch the student moves to.");
    if (await prisma.student.findFirst({ where: { batchId: t.id, rollNumber: st.rollNumber } })) throw new Error("A student with this roll number is already in that batch.");
  }
  if ((inp.type === "TRANSFER_OUT" || inp.type === "TRANSFER_IN") && !(inp.otherInstitute || "").trim()) throw new Error("Name the other university.");
  if (inp.type === "RUSTICATED" && !(inp.caseReference || "").trim()) throw new Error("Give the disciplinary case reference.");
  if (inp.doc && (!/^(application\/pdf|image\/(png|jpe?g))$/.test(inp.doc.type) || inp.doc.data.length > 4_200_000)) throw new Error("The document must be a PDF or an image of up to 3 MB.");
  const id = randomUUID();
  await sdb.studentStatusRequest.create({ data: {
    id, chairmanId, studentId: st.id, type: inp.type, effectiveDate: inp.effectiveDate, reason: inp.reason.trim().slice(0, 2000), fromStatus: st.status,
    freezeSemesters: inp.type === "FREEZE" ? Number(inp.freezeSemesters) : null, targetBatchId: inp.type === "TRANSFER_INTERNAL" || inp.type === "READMISSION" ? inp.targetBatchId || null : null,
    otherInstitute: inp.otherInstitute?.trim() || null, caseReference: inp.caseReference?.trim() || null,
    docName: inp.doc?.name || null, docType: inp.doc?.type || null, docData: inp.doc?.data || null, suggested: !!inp.suggested,
    status: "PENDING", stage: "HOD", raisedById: user.id, raisedAs: who.as,
  } });
  const credits = inp.type === "TRANSFER_INTERNAL" ? await carryOver(st.id, inp.targetBatchId!)
    : inp.type === "TRANSFER_IN" ? (inp.credits || []).filter((c) => c.code && c.title).map((c) => ({ fromCode: c.code.trim().slice(0, 30), fromTitle: c.title.trim().slice(0, 150), creditHours: Math.max(0, Math.min(6, Math.round(Number(c.creditHours) || 0))), grade: (c.grade || "").trim().toUpperCase().slice(0, 3), toCode: c.toCode?.trim() || null, status: "PENDING" })) : [];
  for (const c of credits) await sdb.studentTransferCredit.create({ data: { id: randomUUID(), requestId: id, studentId: st.id, ...c } });
  await writeAuditLog({ actorUserId: user.id, action: "STUDENT_STATUS_REQUESTED", entityType: "Student", entityId: st.id, metadata: { requestId: id, type: inp.type, effective: inp.effectiveDate.toISOString().slice(0, 10) } }).catch(() => null);
  await advance(id, user.id);
  return id;
}

/** Move a request to its next stage, skipping a stage whose approvers already decided (a position covering another). */
async function advance(id: string, actorId: string) {
  const r = (await sdb.studentStatusRequest.findUnique({ where: { id } })) as Req;
  const done = ((await sdb.studentStatusApproval.findMany({ where: { requestId: id, decision: "APPROVED" } })) as { byId: string; stage: string }[]);
  const doneStages = new Set(done.map((d) => d.stage)), decidedBy = new Set(done.map((d) => d.byId));
  for (const s of STAGES) {
    if (doneStages.has(s.stage)) continue;
    const a = await stageApprovers(r, s.stage);
    // The same person (or the raiser, when they are the covering position) already approved: the stage is done.
    if (a.ids.length && a.ids.every((x) => decidedBy.has(x))) { await sdb.studentStatusApproval.create({ data: { id: randomUUID(), requestId: id, stage: s.stage, byId: a.ids[0], decision: "APPROVED", remarks: "Covered by the same person's earlier approval.", covering: a.note || null } }); continue; }
    await sdb.studentStatusRequest.update({ where: { id }, data: { stage: s.stage } });
    const st = await studentCtx(r.studentId);
    const t = await titlesFor(r.chairmanId);
    await notifyUsers(a.ids, { kind: "REQUEST", title: `Student status change to approve: ${st?.name} (${st?.rollNumber}) — ${TYPES[r.type].label}`, body: `${r.reason.slice(0, 300)}${a.note ? ` · You are covering: ${a.note}` : ""} · Stage: ${s.stage === "HOD" ? t.HEAD_OF_DEPARTMENT.title : t.EXAM_CONTROLLER.title}.`, href: `/status-changes?id=${id}`, exceptId: actorId });
    return;
  }
  await sdb.studentStatusRequest.update({ where: { id }, data: { status: "APPROVED", stage: "DONE", decidedAt: new Date() } });
  const st = await studentCtx(r.studentId);
  await notifyUsers([r.raisedById, st?.batch.coordinatorId], { kind: "REQUEST", title: `Approved: ${TYPES[r.type].label} for ${st?.name}`, body: r.effectiveDate <= new Date() ? "It has been applied." : `It takes effect on ${r.effectiveDate.toISOString().slice(0, 10)}.`, href: `/status-changes?id=${id}` });
  if (r.effectiveDate <= new Date()) await apply(id, actorId);
}

/** Outstanding fees of a student (all invoices). */
export async function feesDue(studentId: string) {
  try { const inv = (await sdb.feeInvoice.findMany({ where: { studentId } })) as { amount: number; discount: number; fine: number; paid: number }[]; return inv.reduce((a, i) => a + Math.max(0, balanceOf(i)), 0); } catch { return 0; }
}

export async function decide(user: { id: string; name: string }, id: string, approve: boolean, remarks: string, opts: { feeCleared?: boolean } = {}) {
  const r = (await sdb.studentStatusRequest.findUnique({ where: { id } })) as Req | null;
  if (!r || r.status !== "PENDING") throw new Error("This request is not waiting for a decision.");
  const a = await stageApprovers(r, r.stage);
  if (!a.ids.includes(user.id)) throw new Error("This request is waiting for someone else.");
  if (!approve && remarks.trim().length < 3) throw new Error("Say why it is not approved.");
  // Leaving, transfer out, dismissal: books and library fines must be cleared before the last approval.
  if (approve && r.stage === "CONTROLLER" && ["LEFT", "TRANSFER_OUT", "DROPPED", "RUSTICATED"].includes(r.type)) {
    const block = await (await import("./library")).libraryBlock(r.studentId);
    if (block) throw new Error(block);
  }
  if (approve && r.type === "LEFT" && r.stage === "CONTROLLER") {
    const due = await feesDue(r.studentId);
    if (due > 0 && !opts.feeCleared && !r.feeOverride) throw new Error(`Fee clearance: Rs ${due.toLocaleString("en-PK")} is still outstanding. Ask the Finance Officer to clear it, or tick that finance has cleared it.`);
    if (due > 0 && opts.feeCleared) await sdb.studentStatusRequest.update({ where: { id }, data: { feeOverride: true } });
  }
  await sdb.studentStatusApproval.create({ data: { id: randomUUID(), requestId: id, stage: r.stage, byId: user.id, decision: approve ? "APPROVED" : "REJECTED", remarks: remarks.trim().slice(0, 1000) || null, covering: a.note || null } });
  await writeAuditLog({ actorUserId: user.id, action: approve ? "STUDENT_STATUS_STAGE_APPROVED" : "STUDENT_STATUS_REJECTED", entityType: "Student", entityId: r.studentId, metadata: { requestId: id, type: r.type, stage: r.stage, remarks: remarks.slice(0, 200) } }).catch(() => null);
  if (!approve) {
    await sdb.studentStatusRequest.update({ where: { id }, data: { status: "REJECTED", decidedAt: new Date() } });
    await notifyUsers([r.raisedById], { kind: "REQUEST", title: `Not approved: ${TYPES[r.type].label}`, body: `${user.name}: ${remarks}`, href: `/status-changes?id=${id}` });
    await (await import("./studentAlerts")).tellStudents([r.studentId], "STATUS", `Not approved: ${TYPES[r.type].label}`, remarks);
    return;
  }
  await advance(id, user.id);
  const after = (await sdb.studentStatusRequest.findUnique({ where: { id } })) as Req | null;
  if (after?.status === "APPROVED") await (await import("./studentAlerts")).tellStudents([r.studentId], "STATUS", `Approved: ${TYPES[r.type].label}`, r.effectiveDate <= new Date() ? "It has been applied." : `It takes effect on ${r.effectiveDate.toISOString().slice(0, 10)}.`);
}

/** Decide a carried-over / transferred-in course (the Program Lead of the program the credit counts in). */
export async function decideCredit(user: { id: string }, creditId: string, accept: boolean, toCode: string | null, note: string | null) {
  const c = (await sdb.studentTransferCredit.findUnique({ where: { id: creditId } })) as Credit | null;
  if (!c) throw new Error("Not found.");
  const r = (await sdb.studentStatusRequest.findUnique({ where: { id: c.requestId } })) as Req;
  const batchId = r.type === "TRANSFER_INTERNAL" ? r.targetBatchId : (await studentCtx(r.studentId))?.batchId;
  const b = batchId ? await prisma.batch.findUnique({ where: { id: batchId }, select: { coordinatorId: true, coordinator: { select: { managedById: true } } } }) : null;
  if (!b || !(b.coordinatorId === user.id || b.coordinator.managedById === user.id)) throw new Error("Only the Program Lead of the program the credit counts in decides it.");
  if (accept && r.type === "TRANSFER_IN") {
    const pol = await policyFor(r.chairmanId);
    if (!gradeOk(c.grade, pol.transferMinGrade)) throw new Error(`Credit transfer needs grade ${pol.transferMinGrade} or better (this course: ${c.grade || "no grade"}).`);
    const others = ((await sdb.studentTransferCredit.findMany({ where: { studentId: c.studentId, status: "ACCEPTED", id: { not: c.id } } })) as Credit[]).reduce((a, x) => a + x.creditHours, 0);
    const total = await programCredits(batchId!);
    if (total && others + c.creditHours > (pol.transferMaxPct / 100) * total) throw new Error(`Transferred credits may be at most ${pol.transferMaxPct}% of the program (${Math.floor((pol.transferMaxPct / 100) * total)} of ${total} credit hours); ${others} are already accepted.`);
  }
  const code = (toCode || c.toCode || "").trim() || null;
  if (accept && !code) throw new Error("Say which of the program's courses it counts as.");
  await sdb.studentTransferCredit.update({ where: { id: c.id }, data: { status: accept ? "ACCEPTED" : "REJECTED", toCode: code, note: note?.slice(0, 300) || null, decidedById: user.id, decidedAt: new Date() } });
  // Already applied: the transcript gets the credit now.
  if (accept && r.status === "APPLIED") await creditRecord(r, { ...c, toCode: code });
}

async function creditRecord(r: Req, c: Credit) {
  const st = await studentCtx(r.studentId);
  if (!st || !c.toCode) return;
  const course = await prisma.course.findFirst({ where: { batchId: st.batchId, code: c.toCode }, select: { title: true, courseType: true, creditHours: true } });
  const internal = r.type === "TRANSFER_INTERNAL";
  const orig = internal ? await prisma.studentTranscriptRecord.findFirst({ where: { studentId: st.id, courseCode: c.fromCode }, orderBy: { gpaPoints: "desc" } }) : null;
  if (await prisma.studentTranscriptRecord.findFirst({ where: { studentId: st.id, courseCode: c.toCode, grade: internal ? orig?.grade || "TR" : "TR" } })) return;
  const y = r.effectiveDate.getUTCFullYear();
  await prisma.studentTranscriptRecord.create({ data: {
    studentId: st.id, coordinatorId: st.batch.coordinatorId, courseCode: c.toCode, courseTitle: course?.title || c.fromTitle, creditHours: course?.creditHours ?? c.creditHours, courseType: course?.courseType || "Core",
    termName: internal ? orig?.termName || "Transfer" : "Transfer", termYear: internal ? orig?.termYear || y : y,
    // Transferred in: TR, no grade points. Carried over within the institute: the grade earned here.
    totalPct: internal ? orig?.totalPct || 0 : 0, grade: internal ? orig?.grade || "TR" : "TR", gpaPoints: internal ? orig?.gpaPoints ?? null : null,
    cloAttainmentJson: internal ? orig?.cloAttainmentJson || "[]" : "[]", ploAttainmentJson: internal ? orig?.ploAttainmentJson || "[]" : "[]",
  } });
}

/** The week of the semester a date falls in, from the course's semester start date (null when unknown). */
async function dropDeadlinePassed(course: { coordinatorId: string; offeredTermName: string | null; offeredTermYear: number | null; batch: { degreeProgram: string } | null }, when: Date, weeks: number) {
  if (!course.offeredTermName || !course.offeredTermYear) return true;
  const sd = await prisma.semesterDates.findFirst({ where: { coordinatorId: course.coordinatorId, termName: course.offeredTermName, termYear: course.offeredTermYear, ...(course.batch ? { degreeProgram: course.batch.degreeProgram } : {}) }, select: { semesterStartDate: true } }).catch(() => null);
  if (!sd?.semesterStartDate) return true;
  return when.getTime() > sd.semesterStartDate.getTime() + weeks * 7 * 864e5;
}

/** Apply an approved request (its effective date has come). */
export async function apply(id: string, actorId: string) {
  const r = (await sdb.studentStatusRequest.findUnique({ where: { id } })) as Req | null;
  if (!r || r.status !== "APPROVED") return;
  const st = await studentCtx(r.studentId);
  if (!st) return;
  const pol = await policyFor(r.chairmanId);
  const effects: string[] = [];
  const becomes = TYPES[r.type].becomes;
  const leaving = ["DROPPED", "LEFT", "FREEZE", "TRANSFER_OUT", "RUSTICATED", "TRANSFER_INTERNAL"].includes(r.type);

  if (leaving) {
    // Current courses: dropped before the drop deadline; W after it (the course close-out writes the W).
    const enr = await prisma.studentEnrollment.findMany({ where: { studentId: st.id, status: "ACTIVE", course: { isOffered: true } }, select: { id: true, course: { select: { id: true, code: true, coordinatorId: true, offeredTermName: true, offeredTermYear: true, instructorId: true, batch: { select: { degreeProgram: true } }, sectionAssignments: { select: { instructorId: true } } } } } });
    const teachers = new Set<string>();
    let w = 0, d = 0;
    for (const e of enr) {
      if (await dropDeadlinePassed(e.course, r.effectiveDate, pol.dropDeadlineWeek)) { await prisma.studentEnrollment.update({ where: { id: e.id }, data: { status: "WITHDRAWN", withdrawnAt: r.effectiveDate, withdrawnById: actorId, withdrawnReason: `${TYPES[r.type].label}: ${r.reason}`.slice(0, 300) } }); w++; }
      else { await prisma.studentEnrollment.delete({ where: { id: e.id } }); d++; }
      if (e.course.instructorId) teachers.add(e.course.instructorId);
      e.course.sectionAssignments.forEach((a) => teachers.add(a.instructorId));
    }
    if (enr.length) effects.push(`${enr.length} current course(s): ${d ? `${d} dropped (before the drop deadline)` : ""}${d && w ? ", " : ""}${w ? `${w} withdrawn — W on the transcript` : ""}.`);
    if (teachers.size) { await notifyUsers(Array.from(teachers), { kind: "ROSTER", title: `${st.name} (${st.rollNumber}) is no longer in your class`, body: `${TYPES[r.type].label} from ${r.effectiveDate.toISOString().slice(0, 10)}. Class averages and attainment count only students still enrolled.`, href: "/instructor/courses" }); effects.push(`${teachers.size} teacher(s) told.`); }
    const held = await sdb.registrationHold.updateMany({ where: { studentId: st.id, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date(), decidedById: actorId, note: TYPES[r.type].label } }).catch(() => ({ count: 0 }));
    if (held.count) effects.push(`${held.count} registration hold(s) cancelled.`);
  }
  if (leaving && r.type !== "TRANSFER_INTERNAL") {
    await prisma.degreePlanLock.upsert({ where: { studentId: st.id }, create: { studentId: st.id, lockedById: actorId, note: `Status: ${TYPES[r.type].label}` }, update: { lockedById: actorId, note: `Status: ${TYPES[r.type].label}`, lockedAt: new Date() } }).catch(() => null);
    effects.push("Degree plan locked.");
    // Fee refund by the institute's schedule (lib/feeRefunds.ts).
    const refund = await import("./feeRefunds").then((m) => m.openRefundCase({ id: r.id, chairmanId: r.chairmanId, studentId: st.id, type: r.type, effectiveDate: r.effectiveDate }, actorId)).catch(() => null);
    if (refund) effects.push(refund);
    if (r.type !== "FREEZE") {
      const until = new Date(Date.now() + pol.readOnlyDays * 864e5);
      await sdb.studentAccess.upsert({ where: { studentId: st.id }, create: { studentId: st.id, readOnlyUntil: until, reason: TYPES[r.type].label }, update: { readOnlyUntil: until, reason: TYPES[r.type].label, updatedAt: new Date() } }).catch(() => null);
      effects.push(`Read-only portal access (transcript, fees) until ${until.toISOString().slice(0, 10)}.`);
    } else effects.push("Read-only portal access while frozen.");
  }
  if (r.type === "FREEZE") {
    const lag = (await holdBacks([st.id])).get(st.id)?.lag || 0;
    await setHoldBack(st.id, lag + (r.freezeSemesters || 1), `Semester freeze (${r.freezeSemesters} semester${(r.freezeSemesters || 1) > 1 ? "s" : ""}): ${r.reason}`.slice(0, 300), actorId);
    effects.push(`Held back ${r.freezeSemesters} semester(s): returns with the next batch on the same curriculum.`);
  }
  if (r.type === "TRANSFER_INTERNAL" && r.targetBatchId) {
    await prisma.student.update({ where: { id: st.id }, data: { batchId: r.targetBatchId } });
    const tb = await prisma.batch.findUnique({ where: { id: r.targetBatchId }, select: { degreeProgram: true, batchName: true, coordinatorId: true } });
    effects.push(`Moved to ${tb?.degreeProgram} — ${tb?.batchName}.`);
    const credits = (await sdb.studentTransferCredit.findMany({ where: { requestId: r.id } })) as Credit[];
    const reload = { ...r };
    for (const c of credits.filter((x) => x.status === "MATCHED" || x.status === "ACCEPTED")) await creditRecord(reload, c);
    const pending = credits.filter((x) => x.status === "PENDING").length;
    effects.push(`${credits.filter((x) => x.status === "MATCHED").length} course(s) carried over automatically${pending ? `; ${pending} listed for the Program Lead to accept or reject` : ""}.`);
    if (pending && tb) await notifyUsers([tb.coordinatorId], { kind: "REQUEST", title: `${st.name} transferred to your program: ${pending} course(s) to accept or reject`, href: `/status-changes?id=${r.id}` });
  }
  if (r.type === "TRANSFER_IN") {
    const credits = ((await sdb.studentTransferCredit.findMany({ where: { requestId: r.id, status: "ACCEPTED" } })) as Credit[]);
    for (const c of credits) await creditRecord(r, c);
    effects.push(`${credits.length} transferred course(s) on the transcript as TR (no grade points).`);
  }
  if (r.type === "READMISSION") {
    if (r.targetBatchId && r.targetBatchId !== st.batchId) { await prisma.student.update({ where: { id: st.id }, data: { batchId: r.targetBatchId } }); effects.push("Rejoined a new batch."); }
    await prisma.degreePlanLock.deleteMany({ where: { studentId: st.id, note: { startsWith: "Status:" } } }).catch(() => null);
    await sdb.studentAccess.deleteMany({ where: { studentId: st.id } }).catch(() => null);
    effects.push("Portal and degree plan open again; earlier results kept.");
  }
  if (becomes) {
    await prisma.student.update({ where: { id: st.id }, data: { status: becomes, statusDate: becomes === "ACTIVE" ? null : r.effectiveDate, statusReason: becomes === "ACTIVE" ? null : `${TYPES[r.type].label}: ${r.reason}`.slice(0, 500) } });
    effects.push(`Status: ${STUDENT_STATUS_LABEL[becomes]}.`);
  }
  // Exit survey (left / dropped), parents and the student.
  if (r.type === "LEFT" || r.type === "DROPPED") { const { onStudentStatus } = await import("./exitSurveys"); await onStudentStatus(st.id, r.type, actorId); effects.push("Exit survey sent."); }
  try { const { alertStudents } = await import("./messaging"); await alertStudents(r.chairmanId, [st.id], "BROADCAST", `Your status: ${TYPES[r.type].label}`, `From ${r.effectiveDate.toISOString().slice(0, 10)}. ${r.reason}`.slice(0, 300), true); effects.push("Student and parents informed."); } catch { /* best effort */ }
  if (r.type === "LEFT" || r.type === "TRANSFER_OUT" || r.type === "DROPPED") {
    const fin = await prisma.user.findMany({ where: { role: "FINANCE_OFFICER", managedById: r.chairmanId, isActive: true }, select: { id: true } });
    if (fin.length) { await notifyUsers(fin.map((f) => f.id), { kind: "REQUEST", title: `Fee refund to work out: ${st.name} (${st.rollNumber})`, body: `${TYPES[r.type].label} from ${r.effectiveDate.toISOString().slice(0, 10)}.`, href: "/fees" }); effects.push("Finance Officer asked to work out any refund."); }
  }
  await sdb.studentStatusRequest.update({ where: { id }, data: { status: "APPLIED", appliedAt: new Date(), effectsJson: JSON.stringify(effects) } });
  await writeAuditLog({ actorUserId: actorId, action: "STUDENT_STATUS_APPLIED", entityType: "Student", entityId: st.id, metadata: { requestId: id, type: r.type, effects: effects.join(" ").slice(0, 900) } }).catch(() => null);
}

/** Approved requests whose effective date has come (the daily job). */
export async function applyDue() {
  try {
    const due = (await sdb.studentStatusRequest.findMany({ where: { status: "APPROVED", effectiveDate: { lte: new Date() } }, take: 200 })) as Req[];
    for (const r of due) await apply(r.id, r.raisedById).catch(() => null);
    return due.length;
  } catch { return 0; }
}

/** Students the Controller's rules say should be dropped: CGPA below the dismissal limit after the set number of
 * probation semesters (term-by-term CGPA from the transcript). */
export async function dismissalSuggestions(chairmanId: string, batchIds?: string[]) {
  const rules = await academicRules(chairmanId);
  const students = await prisma.student.findMany({ where: { status: "ACTIVE", batch: { coordinator: { managedById: chairmanId }, ...(batchIds ? { id: { in: batchIds } } : {}) } }, select: { id: true, name: true, rollNumber: true, batchId: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  const recs = await prisma.studentTranscriptRecord.findMany({ where: { studentId: { in: students.map((s) => s.id).concat("none") } }, select: { studentId: true, courseCode: true, creditHours: true, gpaPoints: true, termName: true, termYear: true } });
  const out: { studentId: string; name: string; roll: string; batch: string; cgpa: number; probations: number }[] = [];
  const tk = (n: string, y: number) => y * 3 + (/spring/i.test(n) ? 0 : /summer/i.test(n) ? 1 : 2);
  for (const s of students) {
    const rs = recs.filter((r) => r.studentId === s.id && r.gpaPoints !== null);
    const terms = Array.from(new Set(rs.map((r) => tk(r.termName, r.termYear)))).sort((a, b) => a - b);
    let probations = 0, cg = 0;
    for (const t of terms) {
      const upto = rs.filter((r) => tk(r.termName, r.termYear) <= t);
      const best = new Map<string, { p: number; c: number }>();
      for (const r of upto) { const k = r.courseCode.toUpperCase(); if (!best.has(k) || best.get(k)!.p < (r.gpaPoints || 0)) best.set(k, { p: r.gpaPoints || 0, c: r.creditHours }); }
      const c = Array.from(best.values()).reduce((a, x) => a + x.c, 0);
      cg = c ? Array.from(best.values()).reduce((a, x) => a + x.p * x.c, 0) / c : 0;
      if (cg < rules.probationCgpa) probations++;
    }
    if (terms.length && cg < rules.dismissCgpa && probations >= rules.dismissAfterProbations) out.push({ studentId: s.id, name: s.name, roll: s.rollNumber, batch: `${s.batch.degreeProgram} — ${s.batch.batchName}`, cgpa: Math.round(cg * 100) / 100, probations });
  }
  return out;
}

/** Student movement of a batch: admitted, current, frozen, transferred in / out, dropped, left, graduated — with reasons. */
export async function movement(batchIds: string[]) {
  const [students, reqs] = await Promise.all([
    prisma.student.findMany({ where: { batchId: { in: batchIds.concat("none") } }, select: { id: true, name: true, rollNumber: true, status: true, statusDate: true, statusReason: true, batchId: true, createdAt: true } }),
    sdb.studentStatusRequest.findMany({ where: { status: "APPLIED", OR: [{ targetBatchId: { in: batchIds.concat("none") } }, { studentId: { in: [] as string[] } }] } }).catch(() => []) as Promise<Req[]>,
  ]);
  const applied = ((await sdb.studentStatusRequest.findMany({ where: { status: "APPLIED", studentId: { in: students.map((s) => s.id).concat("none") } } }).catch(() => [])) as Req[]);
  const inT = applied.filter((r) => r.type === "TRANSFER_IN").map((r) => r.studentId).concat(reqs.filter((r) => r.type === "TRANSFER_INTERNAL" && batchIds.includes(r.targetBatchId || "")).map((r) => r.studentId));
  const count = (st: string) => students.filter((s) => s.status === st).length;
  const reasons = (st: string) => { const m = new Map<string, number>(); for (const s of students.filter((x) => x.status === st)) { const k = (s.statusReason || "not given").replace(/^[^:]+: /, "").slice(0, 80); m.set(k, (m.get(k) || 0) + 1); } return Array.from(m.entries()).sort((a, b) => b[1] - a[1]); };
  const byYear = new Map<number, Record<string, number>>();
  for (const s of students.filter((x) => x.status !== "ACTIVE" && x.statusDate)) { const y = s.statusDate!.getUTCFullYear(); const row = byYear.get(y) || {}; row[s.status] = (row[s.status] || 0) + 1; byYear.set(y, row); }
  return {
    admitted: students.length, current: count("ACTIVE"), frozen: count("FROZEN"), transferredIn: new Set(inT).size, transferredOut: count("TRANSFERRED"),
    dropped: count("DROPPED"), left: count("LEFT"), graduated: count("GRADUATED"), rusticated: count("RUSTICATED"),
    reasons: { DROPPED: reasons("DROPPED"), LEFT: reasons("LEFT"), TRANSFERRED: reasons("TRANSFERRED"), FROZEN: reasons("FROZEN") },
    trend: Array.from(byYear.entries()).sort((a, b) => a[0] - b[0]).map(([year, r]) => ({ year, ...r })),
  };
}

/** Intake / graduation / dropout figures computed from the student records (NCEAC 4.h, NBEAC Form 3), per intake year. */
export async function computedOutcomeFigures(leadId: string) {
  const batches = await prisma.batch.findMany({ where: { coordinatorId: leadId }, select: { id: true, startYear: true } });
  const out: { intakeYear: number; admitted: number; graduated: number; graduatedOnTime: number; droppedOut: number; employedOrStudying: number | null }[] = [];
  for (const y of Array.from(new Set(batches.map((b) => b.startYear))).sort()) {
    const ids = batches.filter((b) => b.startYear === y).map((b) => b.id);
    const st = await prisma.student.findMany({ where: { batchId: { in: ids } }, select: { status: true, statusDate: true } });
    if (!st.length) continue;
    const grad = st.filter((s) => s.status === "GRADUATED");
    out.push({ intakeYear: y, admitted: st.length, graduated: grad.length, graduatedOnTime: grad.filter((s) => s.statusDate && s.statusDate.getUTCFullYear() <= y + 4).length, droppedOut: st.filter((s) => ["DROPPED", "LEFT", "RUSTICATED"].includes(s.status)).length, employedOrStudying: null });
  }
  return out;
}

/** Intake figures for the councils: computed from the student records for every intake year OBEHUB has students of;
 * figures typed under Graduation & Surveys fill only the years before that. */
export async function outcomeFiguresFor(leadId: string) {
  const [computed, typed] = await Promise.all([
    computedOutcomeFigures(leadId).catch(() => []),
    prisma.outcomeFigure.findMany({ where: { leadId } as never, orderBy: { intakeYear: "desc" } }).catch(() => []) as Promise<{ intakeYear: number; admitted: number; graduated: number; graduatedOnTime: number; droppedOut: number; employedOrStudying: number | null }[]>,
  ]);
  const years = new Set(computed.map((c) => c.intakeYear));
  return [...computed.map((c) => ({ ...c, employedOrStudying: typed.find((t) => t.intakeYear === c.intakeYear)?.employedOrStudying ?? null, computed: true })), ...typed.filter((t) => !years.has(t.intakeYear)).map((t) => ({ ...t, computed: false }))].sort((a, b) => b.intakeYear - a.intakeYear);
}
