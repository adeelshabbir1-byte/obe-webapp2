import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD, DEMO_PASSWORD } from "./demoInstitute";
import { hashPassword } from "./auth";
import { saveLabSetting, ltdb } from "./labTheory";

// Dream University: a Lab Engineer (dream.labeng) and "MIS501-L Management Information Systems Lab" under the theory course
// MIS501 (BBA, this semester), led by MIS501's teacher. Six lab sessions, each linked to the theory topic it practises and to a theory CLO; five
// manuals approved, one waiting; lab 3 placed a week before its topic is taught (a sync problem to fix); every
// student's lab marks entered. "Lab marks go into the theory result" is on at 20%, waiting for the theory teacher to
// approve. Safe to run again.

function rng(seed: string) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const TITLES = ["Spreadsheet modelling in Excel", "Pivot tables and dashboards", "Designing a database in Access", "SQL queries for business reports", "ERP walkthrough: order to cash", "Process modelling with BPMN"];

export async function campusLabTheory() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  try { await ltdb.labTheorySetting.count(); } catch { return ["run prisma/migration_lab_theory.sql first"]; }
  const lead = await prisma.user.findUnique({ where: { username: "dream.lead.bba" }, select: { id: true } });
  if (!lead) return ["no BBA Program Lead"];
  const theory = await prisma.course.findFirst({ where: { coordinatorId: lead.id, code: "MIS501" }, orderBy: { createdAt: "asc" }, select: { id: true, code: true, title: true, batchId: true, semesterNumber: true, offeredTermName: true, offeredTermYear: true, instructorId: true, coordinatorId: true } });
  if (!theory) return ["no MIS501 course"];
  const done: string[] = [];
  let eng = await prisma.user.findUnique({ where: { username: "dream.labeng" }, select: { id: true } });
  if (!eng) {
    eng = await prisma.user.create({ data: { id: randomUUID(), username: "dream.labeng", email: "dream.labeng@dreaminstitute.demo", passwordHash: await hashPassword(DEMO_PASSWORD), name: "Engr. Bilal Ahmed", role: "LAB_ENGINEER", mustChangePassword: false, managedById: lead.id } as never, select: { id: true } });
    done.push("Lab Engineer dream.labeng");
  }
  let lab = await prisma.course.findFirst({ where: { coordinatorId: lead.id, batchId: theory.batchId, code: `${theory.code}-L` }, select: { id: true } });
  if (!lab) {
    lab = await prisma.course.create({ data: { code: `${theory.code}-L`, title: `${theory.title} Lab`, creditHours: 1, courseType: "Lab", hasLab: false, coordinatorId: lead.id, batchId: theory.batchId, semesterNumber: theory.semesterNumber, offeredTermName: theory.offeredTermName, offeredTermYear: theory.offeredTermYear, isOffered: true, labEngineerId: eng.id } as never, select: { id: true } });
    done.push(`lab course ${theory.code}-L`);
  }
  const students = (await prisma.studentEnrollment.findMany({ where: { courseId: theory.id, status: "ACTIVE" }, select: { studentId: true } })).map((e) => e.studentId);
  if (!(await prisma.studentEnrollment.count({ where: { courseId: lab.id } }))) await prisma.studentEnrollment.createMany({ data: students.map((s) => ({ studentId: s, courseId: lab!.id })) });
  // Sessions: linked to the theory lecture topic and a theory CLO.
  const lectures = await prisma.lectureRow.findMany({ where: { courseId: theory.id, source: "INSTRUCTOR" }, select: { lectureNumber: true, week: true, topic: true }, orderBy: [{ week: "asc" }, { lectureNumber: "asc" }] });
  const clos = await prisma.cLO.findMany({ where: { courseId: theory.id, source: "INSTRUCTOR" }, select: { id: true }, orderBy: { orderIndex: "asc" } });
  if (!(await prisma.labManual.count({ where: { courseId: lab.id } })) && lectures.length >= 12) {
    for (let i = 0; i < 6; i++) {
      const lec = lectures[Math.min(i * 4 + 1, lectures.length - 1)];
      const week = i === 2 ? Math.max(lec.week - 1, 1) : lec.week + 1; // lab 3 comes before its topic is taught
      const m = await prisma.labManual.create({ data: { courseId: lab.id, labNumber: i + 1, title: TITLES[i], cloId: clos.length ? clos[i % clos.length].id : null } as never });
      await ltdb.labTaskPlan.create({ data: { id: randomUUID(), labCourseId: lab.id, labNumber: i + 1, week, topicsJson: JSON.stringify([{ lectureNumber: lec.lectureNumber, topic: lec.topic }]), openEnded: i === 4, oelBrief: i === 4 ? "Map a real local business's order-to-cash process and propose an ERP set-up for it." : null, updatedById: eng.id } });
      for (const kind of ["MANUAL", "SOLUTION"]) {
        const v = await prisma.labManualVersion.create({ data: { manualId: m.id, version: kind === "MANUAL" ? 1 : 2, fileName: `${theory.code}-L Lab ${i + 1} ${kind === "MANUAL" ? "manual" : "solution"}.docx`, fileUrl: "https://example.invalid/demo-lab-file.docx", uploadedById: eng.id, note: kind === "MANUAL" ? null : "Solution for the lab lead" } });
        const approved = !(i === 5 && kind === "MANUAL");
        await ltdb.labFileReview.create({ data: { id: randomUUID(), versionId: v.id, labCourseId: lab.id, labNumber: i + 1, kind, status: approved ? "APPROVED" : "PENDING", reviewedById: approved ? theory.instructorId : null, reviewedAt: approved ? new Date() : null } }).catch(() => null);
      }
    }
    done.push("6 lab sessions with manuals (5 approved, 1 waiting)");
  }
  if (!(await prisma.labMark.count({ where: { courseId: lab.id } }))) {
    const data = students.flatMap((s) => { const r = rng(`lab-${s}`); const base = 5 + r() * 4; return Array.from({ length: 6 }, (_, i) => ({ courseId: lab!.id, studentId: s, labNumber: i + 1, score: Math.min(10, Math.max(2, Math.round((base + (r() - 0.5) * 3) * 2) / 2)), maxScore: 10, enteredById: eng!.id })); });
    await prisma.labMark.createMany({ data });
    done.push(`${data.length} lab marks`);
  }
  const cur = await ltdb.labTheorySetting.findUnique({ where: { labCourseId: lab.id } });
  if (!cur) { await saveLabSetting(lab.id, { theoryCourseId: theory.id, intoTheory: true, weightPct: 20, updatedById: theory.instructorId || lead.id }); done.push(`lab marks set to go into ${theory.code} (20%), waiting for approval`); }
  return done.length ? done : ["already there"];
}
