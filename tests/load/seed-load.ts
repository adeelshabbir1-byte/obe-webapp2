/**
 * Load-test data on top of the E2E demo institute (tests/e2e/seed.ts), in a TEST database only: one more program with
 * 20 batches × 250 = 5,000 students, 300 teachers, 6 offered courses per batch (120 courses, 5 assessments each,
 * every student enrolled), 20 transcript rows per student, and registration open. Students sign in as LD-Bnn-nnnn,
 * teachers as load.tNNN (the demo password).
 *
 *   E2E_DATABASE_URL=postgres://…/obe_e2e npx tsx tests/load/seed-load.ts
 */
import { randomUUID } from "crypto";

const url = process.env.E2E_DATABASE_URL || "";
const safe = (() => { try { const x = new URL(url); return ["localhost", "127.0.0.1"].includes(x.hostname) || /e2e|test|scratch|load/i.test(x.pathname); } catch { return false; } })();

async function main() {
  if (!safe) throw new Error("Refusing: set E2E_DATABASE_URL to a local or *_e2e / *_test database.");
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../../lib/db");
  const { hashPassword } = await import("../../lib/auth");
  const { DEMO_PASSWORD } = await import("../../lib/demoInstitute");
  const head = await prisma.user.findUnique({ where: { username: "dream.head" } });
  if (!head) throw new Error("Seed the E2E institute first (tests/e2e/seed.ts).");
  const writeIds = async () => {
    // For the marks test: 100 teachers, each with an offered course, 30 of its students and its assessments.
    const courses = await prisma.course.findMany({ where: { coordinator: { username: "load.lead" }, isOffered: true, code: { not: "LD-305" } }, select: { id: true, instructor: { select: { username: true } }, studentEnrollments: { select: { studentId: true }, take: 30 }, assessmentInstruments: { select: { id: true, maxScore: true } } }, take: 100 });
    const { writeFileSync } = await import("fs");
    writeFileSync(new URL("./ids.json", import.meta.url), JSON.stringify({ teachers: courses.map((c) => ({ username: c.instructor?.username, courseId: c.id, students: c.studentEnrollments.map((e) => e.studentId), instruments: c.assessmentInstruments })) }));
    console.log(`ids.json: ${courses.length} teachers`);
  };
  if (await prisma.user.findUnique({ where: { username: "load.lead" } })) { console.log("load data already there"); await writeIds(); await prisma.$disconnect(); return; }
  const t0 = Date.now();
  const hash = await hashPassword(DEMO_PASSWORD);
  const leadId = randomUUID();
  await prisma.user.create({ data: { id: leadId, username: "load.lead", email: "load.lead@e2e.test", passwordHash: hash, name: "Load Test Lead", role: "PROGRAM_COORDINATOR", managedById: head.id, mustChangePassword: false } as never });
  const teachers = Array.from({ length: 300 }, (_, i) => ({ id: randomUUID(), username: `load.t${String(i + 1).padStart(3, "0")}`, email: `load.t${i + 1}@e2e.test`, passwordHash: hash, name: `Load Teacher ${i + 1}`, role: "INSTRUCTOR", managedById: leadId, mustChangePassword: false }));
  await prisma.user.createMany({ data: teachers as never });
  await prisma.currentTerm.create({ data: { coordinatorId: leadId, termName: "Fall", year: 2026 } as never }).catch(() => null);
  for (let b = 0; b < 20; b++) {
    const batch = await prisma.batch.create({ data: { coordinatorId: leadId, degreeProgram: "BS Load Testing", batchName: `LD Batch ${b + 1}`, startTerm: "Fall", startYear: 2023 + (b % 3), studentCount: 250, registrationOpen: true } as never });
    const students = Array.from({ length: 250 }, (_, i) => ({ id: randomUUID(), batchId: batch.id, name: `Load Student ${b + 1}-${i + 1}`, rollNumber: `LD-B${String(b + 1).padStart(2, "0")}-${String(i + 1).padStart(4, "0")}`, passwordHash: hash, mustChangePassword: false, currentSemesterNumber: 3 }));
    await prisma.student.createMany({ data: students as never });
    for (let k = 0; k < 6; k++) {
      const teacher = teachers[(b * 6 + k) % teachers.length];
      const course = await prisma.course.create({ data: { code: `LD-${300 + k}`, title: `Load Course ${k + 1}`, creditHours: 3, courseType: "Core", coordinatorId: leadId, batchId: batch.id, semesterNumber: 3, isOffered: true, offeredTermName: "Fall", offeredTermYear: 2026, instructorId: teacher.id, subjectExpertId: teacher.id, templateStatus: "approved" } as never });
      const inst = ["Quiz 1", "Quiz 2", "Assignment 1", "Midterm", "Final"].map((label, i) => ({ id: randomUUID(), courseId: course.id, source: "INSTRUCTOR", type: label.split(" ")[0], label, marksPct: [10, 10, 15, 25, 40][i], maxScore: [10, 10, 20, 50, 100][i] }));
      await prisma.assessmentInstrument.createMany({ data: inst as never });
      // Five of six courses are already registered; the sixth is left for registration day.
      if (k < 5) await prisma.studentEnrollment.createMany({ data: students.map((s) => ({ studentId: s.id, courseId: course.id })) as never });
    }
    const recs = students.flatMap((s) => Array.from({ length: 20 }, (_, k) => ({ id: randomUUID(), studentId: s.id, coordinatorId: leadId, courseCode: `LDH-${100 + k}`, courseTitle: `Earlier Course ${k + 1}`, creditHours: 3, courseType: "Core", termName: k % 2 ? "Spring" : "Fall", termYear: 2023 + Math.floor(k / 6), totalPct: 55 + ((k * 7) % 40), grade: "B", gpaPoints: 3, cloAttainmentJson: "[]", ploAttainmentJson: "[]" })));
    for (let i = 0; i < recs.length; i += 2500) await prisma.studentTranscriptRecord.createMany({ data: recs.slice(i, i + 2500) as never });
    console.log(`batch ${b + 1}/20 (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  console.log(`load data ready in ${Math.round((Date.now() - t0) / 1000)}s`);
  await writeIds();
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
