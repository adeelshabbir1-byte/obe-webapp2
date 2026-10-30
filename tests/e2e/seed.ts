/**
 * Seeds the E2E demo institute into a TEST database (never production): the demo institute (lib/demoInstitute.ts)
 * built from the built-in computing curriculum (PU BSCS 2021 scheme, HEC/NCEAC computing PLOs), plus what the journeys
 * need: two programs (BSCS, BSAI), a combined course, a batch over 50, a content-synced course, approved plans and one
 * plan still under review, an OMC with 3 members and a Convener, a Department Coordinator and a Super User.
 *
 *   E2E_DATABASE_URL=postgres://…/obe_e2e npx tsx tests/e2e/seed.ts
 *
 * Refuses unless the database name contains "e2e", "test" or "scratch", or the host is localhost / 127.0.0.1.
 * Running it again does nothing when the institute is already there.
 */
import { randomUUID } from "crypto";

const url = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL || "";
function safeTarget(u: string) {
  try { const x = new URL(u); return ["localhost", "127.0.0.1"].includes(x.hostname) || /e2e|test|scratch/i.test(x.pathname); } catch { return false; }
}

async function main() {
  if (!url || !safeTarget(url)) throw new Error("Refusing to seed: set E2E_DATABASE_URL to a local or *_e2e / *_test database.");
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../../lib/db");
  const { hashPassword } = await import("../../lib/auth");
  const demo = await import("../../lib/demoInstitute");
  const { PU_BSCS_2021 } = await import("../../lib/puBscs2021");
  const { CD2023_PLOS } = await import("../../lib/computing2023Content");
  const db = prisma as unknown as Record<string, any>;
  const t0 = Date.now();
  const log = (s: string) => console.log(`[seed ${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
  const hash = await hashPassword(demo.DEMO_PASSWORD);
  const user = async (username: string, name: string, role: string, extra: Record<string, unknown> = {}) => {
    const u = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (u) return u.id;
    const id = randomUUID();
    await prisma.user.create({ data: { id, username, email: `${username}@e2e.test`, passwordHash: hash, name, role, mustChangePassword: false, ...extra } as never });
    return id;
  };

  const superId = await user("e2e.super", "E2E Super User", "SUPER_USER");
  if (!(await demo.demoHead())) {
    // A reference program built from the curriculum data in the code (the demo copies its courses and PLOs).
    const refHead = await user("e2e.ref.head", "Reference Curriculum", "CHAIRMAN", { managedById: superId, instituteName: "Reference curricula (E2E)" });
    const refLead = await user("e2e.ref.lead", "Reference Program Lead", "PROGRAM_COORDINATOR", { managedById: refHead });
    const ref = await prisma.batch.create({ data: { coordinatorId: refLead, degreeProgram: "BS Computer Science (reference)", batchName: "Reference 2021", startTerm: "Fall", startYear: 2021, studentCount: 0 } as never });
    await prisma.pLO.createMany({ data: (CD2023_PLOS as { number: number; title: string; description?: string }[]).map((p) => ({ coordinatorId: refLead, batchId: ref.id, number: p.number, title: p.title, description: p.description || p.title, status: "approved" })) as never });
    const seen = new Set<string>();
    for (const c of PU_BSCS_2021.filter((x) => x.semester >= 1 && x.semester <= 8)) {
      if (seen.has(c.code)) continue; seen.add(c.code);
      await prisma.course.create({ data: { code: c.code, title: c.title, creditHours: c.ch, courseType: /General/i.test(c.type) ? "General Education" : /Elective/i.test(c.type) ? "Elective" : "Core", coordinatorId: refLead, batchId: ref.id, semesterNumber: c.semester, templateStatus: "approved" } as never });
    }
    log("reference curriculum ready");
    const out = await demo.setupDemo(superId, [{ sourceBatchId: ref.id, short: "CS" }, { sourceBatchId: ref.id, short: "AI" }]);
    for (const o of out) {
      const teachers = await prisma.user.findMany({ where: { managedById: o.leadId, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] as never } }, orderBy: { username: "asc" }, select: { id: true } });
      for (let sem = 1; sem <= 8; sem++) await demo.coursesStep(o.demoBatchId, o.sourceBatchId, sem, teachers.map((t) => t.id));
      log(`courses of ${o.demoBatchId.slice(0, 6)} ready`);
      for (let sem = 1; sem <= 5; sem++) await demo.activityStep(o.demoBatchId, sem);
      log(`activity of ${o.demoBatchId.slice(0, 6)} ready`);
    }
    await demo.finishDemo();
  }
  const head = (await demo.demoHead())!;
  const lead = await prisma.user.findUniqueOrThrow({ where: { username: "dream.lead.cs" } });
  const leadAi = await prisma.user.findUniqueOrThrow({ where: { username: "dream.lead.ai" } });
  const dept = lead.departmentId;
  const cs = await prisma.batch.findFirstOrThrow({ where: { coordinatorId: lead.id } });
  const ai = await prisma.batch.findFirstOrThrow({ where: { coordinatorId: leadAi.id } });

  // A batch over 50: BSCS gets 60 students.
  const n = await prisma.student.count({ where: { batchId: cs.id } });
  if (n < 60) {
    await prisma.student.createMany({ data: Array.from({ length: 60 - n }, (_, i) => ({ id: randomUUID(), batchId: cs.id, name: `E2E Student ${i + 1}`, rollNumber: `DRM-CS-24-${String(100 + i)}`, passwordHash: hash, mustChangePassword: false, currentSemesterNumber: 5 })) as never });
    await prisma.batch.update({ where: { id: cs.id }, data: { studentCount: 60 } });
    log("BSCS has 60 students");
  }
  // OMC: three members, one of them the Convener; a Department Coordinator.
  await prisma.user.updateMany({ where: { username: "dream.omc" }, data: { departmentId: dept, extraRoles: { set: ["OMC_CONVENER"] } } as never });
  await user("dream.omc2", "Dr. Sana Javed", "OMC", { managedById: head.id, departmentId: dept });
  await user("dream.omc3", "Dr. Bilal Hassan", "OMC", { managedById: head.id, departmentId: dept });
  await user("dream.dc", "Dr. Rehan Aslam", "DEPARTMENT_COORDINATOR", { managedById: head.id, departmentId: dept });
  // A combined course: the same course of both programs taught together this semester.
  const csNow = await prisma.course.findMany({ where: { batchId: cs.id, semesterNumber: 5, isOffered: true }, orderBy: { code: "asc" } });
  const aiNow = await prisma.course.findMany({ where: { batchId: ai.id, semesterNumber: 5, isOffered: true }, orderBy: { code: "asc" } });
  const pair = csNow.map((c) => [c, aiNow.find((a) => a.code === c.code)] as const).find(([, a]) => a);
  if (pair && !(await prisma.courseEquivalenceMember.findUnique({ where: { courseId: pair[0].id } }))) {
    const g = await prisma.courseEquivalenceGroup.create({ data: { chairmanId: head.id, name: `${pair[0].title} (combined)` } });
    await prisma.courseEquivalenceMember.createMany({ data: [{ groupId: g.id, courseId: pair[0].id }, { groupId: g.id, courseId: pair[1]!.id }] });
    log(`combined course: ${pair[0].code}`);
  }
  // A synced course: the AI copy of a later-semester course follows the CS copy (the base).
  const later = await prisma.course.findMany({ where: { batchId: cs.id, semesterNumber: 6 }, orderBy: { code: "asc" } });
  const twin = later.map((c) => [c, null] as const).find(() => true);
  if (twin) {
    const aiTwin = await prisma.course.findFirst({ where: { batchId: ai.id, code: twin[0].code } });
    if (aiTwin && !(await prisma.courseContentSyncMember.findUnique({ where: { courseId: twin[0].id } }))) {
      const g = await prisma.courseContentSyncGroup.create({ data: { chairmanId: head.id, name: `${twin[0].title} (synced)` } as never });
      await prisma.courseContentSyncMember.createMany({ data: [{ groupId: g.id, courseId: twin[0].id, isBase: true }, { groupId: g.id, courseId: aiTwin.id, isBase: false }] as never });
      log(`synced course: ${twin[0].code}`);
    }
  }
  // One plan still under review (registration of BSCS waits for it): an offered course of the Subject Expert dream.se.
  const se = await prisma.user.findUniqueOrThrow({ where: { username: "dream.se" } });
  const review = await prisma.course.findFirst({ where: { batchId: cs.id, isOffered: true, semesterNumber: 5, subjectExpertId: se.id }, orderBy: { code: "asc" } });
  if (review && review.templateStatus === "approved" && !(await prisma.courseResult.findUnique({ where: { courseId: review.id } }).catch(() => null))) await prisma.course.update({ where: { id: review.id }, data: { templateStatus: "draft" } });
  await prisma.batch.update({ where: { id: cs.id }, data: { registrationOpen: false } });
  // Head of Department (approves results) and rooms (timetable).
  await user("dream.hod.cs", "Dr. Farhan Ali", "HEAD_OF_DEPARTMENT", { managedById: head.id, departmentId: dept });
  if (!(await prisma.room.count({ where: { chairmanId: head.id } }))) await prisma.room.createMany({ data: [["CR-101", "LECTURE", 50], ["CR-102", "LECTURE", 50], ["CR-201", "LECTURE", 60], ["CR-202", "LECTURE", 45], ["Lab-1", "LAB", 40], ["Lab-2", "LAB", 40]].map(([name, type, capacity]) => ({ chairmanId: head.id, name, type, capacity })) as never });
  // The programs are NCEAC-accredited (accreditation exports, HEMIS).
  for (const program of ["BS Computer Science", "BS Artificial Intelligence"]) await prisma.departmentProgram.upsert({ where: { chairmanId_degreeProgram: { chairmanId: head.id, degreeProgram: program } }, create: { chairmanId: head.id, degreeProgram: program, departmentId: dept!, accreditationBody: "NCEAC" } as never, update: {} });
  // CNICs on record (for the privacy checks): a few students' details and one teacher's profile.
  const someStudents = await prisma.student.findMany({ where: { batchId: cs.id }, orderBy: { rollNumber: "asc" }, take: 5, select: { id: true } });
  for (const [i, st] of someStudents.entries()) {
    const cnic = `35202-${String(1234560 + i)}-${(i % 9) + 1}`;
    await db.studentDetail.upsert({ where: { studentId: st.id }, create: { studentId: st.id, dataJson: JSON.stringify({ cnic, father: "Test Father", gender: "Male", dob: "2004-01-01" }), updatedById: st.id }, update: {} }).catch(() => null);
  }
  const ins = await prisma.user.findUniqueOrThrow({ where: { username: "dream.instructor" } });
  await db.facultyProfile.upsert({ where: { userId: ins.id }, create: { userId: ins.id, cnic: "35202-7654321-9" }, update: { cnic: "35202-7654321-9" } }).catch(() => null);
  console.log(JSON.stringify({ head: head.id, csBatch: cs.id, aiBatch: ai.id, reviewCourse: review?.id, reviewCode: review?.code, combined: pair?.[0].code, synced: twin?.[0].code, seconds: Math.round((Date.now() - t0) / 1000) }));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
