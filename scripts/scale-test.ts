/**
 * Scale test: makes a throw-away institute with many students, times the heavy queries, then removes it.
 *   DATABASE_URL=... npx tsx scripts/scale-test.ts 10000
 * Run against a COPY / branch of the database, never the live one during teaching hours.
 */
import { randomUUID } from "crypto";
import { prisma } from "../lib/db";
import { computeCgpa } from "../lib/academicStanding";

const N = Number(process.argv[2] || 10000);
const t = async <T>(label: string, f: () => Promise<T>) => { const s = Date.now(); const r = await f(); console.log(`${label.padEnd(48)} ${String(Date.now() - s).padStart(6)} ms`); return r; };

async function main() {
  const tag = `scale-${Date.now()}`;
  const head = await prisma.user.create({ data: { id: randomUUID(), email: `${tag}@test.local`, username: tag, passwordHash: "x", name: "Scale Test Head", role: "CHAIRMAN" } as never });
  const lead = await prisma.user.create({ data: { id: randomUUID(), email: `${tag}-pl@test.local`, username: `${tag}-pl`, passwordHash: "x", name: "Scale PL", role: "PROGRAM_COORDINATOR", managedById: head.id } as never });
  try {
    const batches = await t("create 20 batches", () => Promise.all(Array.from({ length: 20 }, (_, i) => prisma.batch.create({ data: { id: randomUUID(), coordinatorId: lead.id, degreeProgram: "BS Scale", batchName: `B${i}`, startTerm: "Fall", startYear: 2020 + (i % 6) } as never }))));
    const studs = Array.from({ length: N }, (_, i) => ({ id: randomUUID(), batchId: batches[i % 20].id, name: `Student ${i}`, rollNumber: `25${String(i).padStart(6, "0")}` }));
    await t(`create ${N} students`, async () => { for (let i = 0; i < studs.length; i += 1000) await prisma.student.createMany({ data: studs.slice(i, i + 1000) }); });
    const recs = studs.flatMap((s) => Array.from({ length: 20 }, (_, k) => ({ id: randomUUID(), studentId: s.id, coordinatorId: lead.id, courseCode: `CS${100 + k}`, courseTitle: `Course ${k}`, creditHours: 3, courseType: "Core", termName: "Fall", termYear: 2022 + (k % 4), totalPct: 70, grade: "B", gpaPoints: 3, cloAttainmentJson: "[]", ploAttainmentJson: "[]" })));
    await t(`create ${recs.length} transcript rows`, async () => { for (let i = 0; i < recs.length; i += 5000) await prisma.studentTranscriptRecord.createMany({ data: recs.slice(i, i + 5000) }); });
    await t("type-ahead: roll number contains '2510'", () => prisma.student.findMany({ where: { batch: { coordinator: { managedById: head.id } }, OR: [{ rollNumber: { contains: "2510", mode: "insensitive" } }, { name: { contains: "2510", mode: "insensitive" } }] }, take: 12 }));
    await t("batch list (500 students)", () => prisma.student.findMany({ where: { batchId: batches[0].id }, orderBy: { rollNumber: "asc" } }));
    await t("one student's CGPA", () => computeCgpa(studs[0].id));
    await t("standing list of one batch (CGPA each)", () => Promise.all(studs.filter((s) => s.batchId === batches[0].id).map((s) => computeCgpa(s.id))));
    await t("institute-wide transcript count", () => prisma.studentTranscriptRecord.count({ where: { coordinatorId: lead.id } }));
  } finally {
    await t("clean up", async () => {
      const bs = (await prisma.batch.findMany({ where: { coordinatorId: lead.id }, select: { id: true } })).map((b) => b.id);
      await prisma.studentTranscriptRecord.deleteMany({ where: { coordinatorId: lead.id } });
      await prisma.student.deleteMany({ where: { batchId: { in: bs } } });
      await prisma.batch.deleteMany({ where: { id: { in: bs } } });
      await prisma.user.deleteMany({ where: { id: { in: [lead.id, head.id] } } });
    });
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
