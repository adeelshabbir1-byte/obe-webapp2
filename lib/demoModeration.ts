import { randomBytes, createHash, randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { systemCheck } from "./paperVetting";
import { checklistOf, mdb } from "./moderation";

// Dream University moderation: the final papers of CS-504 (vetted and approved after one revision, with the Program
// Lead's checklist) and CS-505 (waiting for vetting); an external examiner from another university with remarks on the
// CS-504 paper and the CS-401 result; and one approved grade change. Safe to run again.

const Q = [
  ["Define the stages of the entrepreneurial process and give one local example for each.", "C2", 10],
  ["A Lahore bakery wants to open three branches. Prepare a short feasibility outline covering market, cost and risk.", "C3", 15],
  ["Compare bootstrapping with angel investment for a student start-up in Pakistan; which would you advise and why?", "C4", 15],
  ["Analyse the business model canvas of a ride-hailing company and identify its weakest block.", "C4", 10],
  ["Design a minimum viable product test for a campus food-delivery idea and say how you would judge success.", "C5", 10],
] as const;
const Q2 = [
  ["State four duties a computing professional owes to the public under a professional code of conduct.", "C1", 10],
  ["A software house is asked to hide a known security flaw from a client. Discuss the ethical issues involved.", "C3", 15],
  ["Explain how Pakistan's cybercrime law (PECA 2016) affects the handling of personal data by software firms.", "C2", 10],
  ["Evaluate two ways a team can resolve a conflict between deadline pressure and software quality.", "C5", 15],
  ["Draft a short acceptable-use policy for a university computer lab.", "C3", 10],
] as const;

async function paper(courseId: string, qs: readonly (readonly [string, string, number])[]) {
  if (await prisma.paperDistributionItem.count({ where: { courseId, source: "INSTRUCTOR", examType: "Final" } })) return false;
  const clos = await prisma.cLO.findMany({ where: { courseId, source: "INSTRUCTOR" }, select: { id: true }, orderBy: { orderIndex: "asc" } });
  const text: Record<string, string> = {};
  for (const [i, [t, lvl, marks]] of qs.entries()) {
    const it = await prisma.paperDistributionItem.create({ data: { courseId, source: "INSTRUCTOR", examType: "Final", questionNo: i + 1, topicText: t.slice(0, 60), cloId: clos.length ? clos[i % clos.length].id : null, cognitiveLevel: lvl, marks, orderIndex: i } });
    text[it.id] = t;
  }
  return text;
}

export async function campusModeration() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  try { await mdb.moderationRemark.count(); } catch { return ["run prisma/migration_moderation.sql first"]; }
  const lead = await prisma.user.findUnique({ where: { username: "dream.lead.cs" }, select: { id: true } });
  const find = (code: string) => prisma.course.findFirst({ where: { coordinatorId: lead?.id || "none", code }, orderBy: { createdAt: "asc" }, select: { id: true, instructorId: true } });
  const [c504, c505, c401] = await Promise.all([find("CS-504"), find("CS-505"), find("CS-401")]);
  const done: string[] = [];
  if (c504) {
    const t = await paper(c504.id, Q);
    if (t) {
      const sys = await systemCheck(c504.id, "Final");
      const v = await mdb.paperVetting.upsert({ where: { courseId_examType: { courseId: c504.id, examType: "Final" } }, create: { courseId: c504.id, examType: "Final", status: "APPROVED", questionsJson: JSON.stringify(t), systemJson: JSON.stringify(sys), submittedAt: new Date(Date.now() - 9 * 864e5), reviewerId: lead!.id, reviewNote: "Q2 now asks for a feasibility outline instead of a definition — good. Approved.", decidedAt: new Date(Date.now() - 7 * 864e5), round: 2 }, update: {} });
      await mdb.moderationRemark.create({ data: { id: randomUUID(), chairmanId: head.id, kind: "PAPER", courseId: c504.id, examType: "Final", round: 2, byKind: "INTERNAL", byUserId: lead!.id, decision: "APPROVED", comments: v.reviewNote, checklistJson: JSON.stringify(checklistOf(JSON.stringify(sys), [], true)), createdAt: new Date(Date.now() - 7 * 864e5) } });
      done.push("CS-504 final paper vetted (round 2) with checklist");
    }
  }
  if (c505) {
    const t = await paper(c505.id, Q2);
    if (t) {
      const sys = await systemCheck(c505.id, "Final");
      await mdb.paperVetting.upsert({ where: { courseId_examType: { courseId: c505.id, examType: "Final" } }, create: { courseId: c505.id, examType: "Final", status: "SUBMITTED", questionsJson: JSON.stringify(t), systemJson: JSON.stringify(sys), submittedAt: new Date(Date.now() - 864e5), teacherNote: "Please check Q3 wording." }, update: {} });
      done.push("CS-505 final paper waiting for vetting");
    }
  }
  if (!(await mdb.externalExaminer.count({ where: { chairmanId: head.id } }))) {
    const ex = await mdb.externalExaminer.create({ data: { id: randomUUID(), chairmanId: head.id, name: "Dr. Sana Malik", email: "sana.malik@example.edu.pk", organisation: "NUST, Islamabad", designation: "Associate Professor", courseIdsJson: JSON.stringify([c504?.id, c401?.id].filter(Boolean)), tokenHash: createHash("sha256").update(randomBytes(24)).digest("hex"), expiresAt: new Date(Date.now() + 14 * 864e5), createdById: lead?.id || head.id } });
    if (c504) await mdb.moderationRemark.create({ data: { id: randomUUID(), chairmanId: head.id, kind: "PAPER", courseId: c504.id, examType: "Final", byKind: "EXTERNAL", examinerId: ex.id, decision: "OK", comments: "A well balanced paper with good use of local cases. Q4 could state the expected length.", checklistJson: JSON.stringify([{ key: "clarity", label: "Questions are clear", auto: false, ok: true }]), createdAt: new Date(Date.now() - 5 * 864e5) } });
    if (c401) await mdb.moderationRemark.create({ data: { id: randomUUID(), chairmanId: head.id, kind: "RESULT", courseId: c401.id, byKind: "EXTERNAL", examinerId: ex.id, decision: "CHANGES", comments: "The share of A grades is high compared with the class average; please review the cut-offs before the next offering.", createdAt: new Date(Date.now() - 4 * 864e5) } });
    done.push("external examiner with two remarks");
  }
  if (c401 && !(await mdb.gradeChangeRequest.count({ where: { courseId: c401.id } }))) {
    const e = await prisma.studentEnrollment.findFirst({ where: { courseId: c401.id }, select: { studentId: true } });
    if (e) {
      await mdb.gradeChangeRequest.create({ data: { courseId: c401.id, studentId: e.studentId, oldGrade: "B", newGrade: "B+", reason: "Re-marking of the final: Q3 was marked out of 10 instead of 15.", requestedById: c401.instructorId || lead!.id, status: "APPROVED", decidedById: head.id, decidedAt: new Date(Date.now() - 3 * 864e5), decisionNote: "Checked the script; approved." } });
      done.push("one approved grade change");
    }
  }
  return done.length ? done : ["already there"];
}
