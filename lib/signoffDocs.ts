import { prisma } from "./db";
import { bestAttemptTotals } from "./cgpaMath";
import { issueDocument, signersFrom } from "./signoff";
import { TYPES, STAGES } from "./studentStatus";
import { titlesFor, applyTitles } from "./titles";

// The official documents that are printed as pages, each with its content and sign-off worked out in one place, so
// the page and the demo issue exactly the same document (and the same number).

const sdb = prisma as unknown as Record<string, any>;
const ORDER: Record<string, number> = { Transfer: 0, Spring: 1, Summer: 2, Fall: 3 };
const longDay = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Transcript: every graded course by term; signed by the latest result approvers and the issuing officer. */
export async function transcriptDoc(chairmanId: string, studentId: string, issuer: { userId: string; exam: boolean } | null) {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, name: true, rollNumber: true, status: true, batchId: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  if (!student) return null;
  const recs = await prisma.studentTranscriptRecord.findMany({ where: { studentId }, select: { courseCode: true, courseTitle: true, creditHours: true, termName: true, termYear: true, grade: true, gpaPoints: true } });
  const terms = Array.from(new Set(recs.map((r) => `${r.termName}|${r.termYear}`))).sort((a, b) => { const [an, ay] = a.split("|"), [bn, by] = b.split("|"); return Number(ay) - Number(by) || (ORDER[an] ?? 9) - (ORDER[bn] ?? 9); });
  const cg = bestAttemptTotals(recs);
  const cgpa = cg.credits ? (cg.points / cg.credits).toFixed(2) : "—";
  const courses = await prisma.course.findMany({ where: { batchId: student.batchId }, select: { id: true } });
  const approvals = (await sdb.courseResult.findMany({ where: { courseId: { in: courses.map((c) => c.id).concat(["none"]) }, status: "APPROVED", decidedById: { not: null } }, orderBy: { decidedAt: "desc" }, select: { decidedById: true, decidedAt: true }, take: 40 }).catch(() => [])) as { decidedById: string; decidedAt: Date }[];
  const approvers = Array.from(new Map(approvals.map((a) => [a.decidedById, a])).values()).slice(0, 2);
  const issued = await issueDocument({
    chairmanId, kind: "TRANSCRIPT", title: student.batch.degreeProgram, holderName: student.name, holderRef: student.rollNumber, sourceRef: `transcript:${student.id}`,
    content: { student: student.id, records: recs.map((r) => [r.courseCode, r.termName, r.termYear, r.grade, r.gpaPoints, r.creditHours]).sort() },
    summary: { "Program": `${student.batch.degreeProgram} (${student.batch.batchName})`, "Courses": recs.length, "Credit hours counted": cg.credits, "CGPA": cgpa },
    signers: await signersFrom(chairmanId, approvers.map((a) => ({ userId: a.decidedById, role: "Results approved", at: a.decidedAt }))),
    issuer: issuer ? { userId: issuer.userId, role: "Transcript issued", position: issuer.exam ? "Controller of Examinations" : undefined } : undefined, issuedById: issuer?.userId || null,
  });
  return { student, recs, terms, cg, cgpa, issued };
}

/** FDP certificate: signed by whoever organised the session and recorded the attendance. */
export async function fdpCertificateDoc(attendanceId: string, issuedById: string | null) {
  const a = await sdb.fdpAttendance.findUnique({ where: { id: attendanceId } }).catch(() => null);
  if (!a) return null;
  const s = await sdb.fdpSession.findUnique({ where: { id: a.sessionId } });
  if (!s) return null;
  const who = await prisma.user.findUnique({ where: { id: a.userId }, select: { name: true, department_: { select: { name: true } } } });
  const issued = await issueDocument({
    chairmanId: s.chairmanId, kind: "FDP_CERTIFICATE", title: s.title, holderName: who?.name || null, holderRef: a.certificateNo || null, sourceRef: `fdp:${a.id}`,
    content: { session: s.id, title: s.title, date: s.date, hours: s.hours, person: a.userId, certificateNo: a.certificateNo, attended: a.attended },
    summary: { "Session": s.title, "Held on": longDay(s.date), "Hours": s.hours, "Certificate No.": a.certificateNo || "—" },
    signers: await signersFrom(s.chairmanId, [{ userId: s.createdById, role: "FDP session organised and attendance recorded", at: s.date }]),
    issuedById,
  });
  return { a, s, who, issued };
}

/** Status-change letter: signed by the people who approved each stage. */
export async function statusLetterDoc(requestId: string, issuedById: string | null) {
  const r = await sdb.studentStatusRequest.findUnique({ where: { id: requestId } }).catch(() => null);
  if (!r || !["APPROVED", "APPLIED"].includes(r.status)) return null;
  const approvals = (await sdb.studentStatusApproval.findMany({ where: { requestId: r.id, decision: "APPROVED" }, orderBy: { at: "asc" } })) as { stage: string; byId: string; at: Date }[];
  const student = await prisma.student.findUnique({ where: { id: r.studentId }, select: { name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true, coordinatorId: true } } } });
  if (!student) return null;
  const titles = await titlesFor(r.chairmanId);
  const t = TYPES[r.type] || { label: r.type, becomes: null, what: "" };
  const issued = await issueDocument({
    chairmanId: r.chairmanId, kind: "STATUS_LETTER", title: t.label, holderName: student.name, holderRef: student.rollNumber, sourceRef: `status:${r.id}`,
    content: { id: r.id, type: r.type, effectiveDate: r.effectiveDate, status: r.status, approvals: approvals.map((a) => [a.stage, a.byId, a.at]) },
    summary: { "Change": t.label, "Program": `${student.batch.degreeProgram} (${student.batch.batchName})`, "Effective from": longDay(r.effectiveDate), ...(r.freezeSemesters ? { "Semesters frozen": r.freezeSemesters } : {}), ...(r.otherInstitute ? { "Other institute": r.otherInstitute } : {}) },
    signers: await signersFrom(r.chairmanId, approvals.map((a) => { const st = STAGES.find((x) => x.stage === a.stage); return { userId: a.byId, role: `Approved (${applyTitles(st?.label || a.stage, titles)} stage)`, position: st?.stage === "CONTROLLER" ? "Controller of Examinations" : undefined, at: a.at }; })),
    issuedById,
  });
  return { r, approvals, student, titles, t, issued };
}
