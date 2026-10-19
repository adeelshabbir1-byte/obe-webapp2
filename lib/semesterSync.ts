import { randomUUID } from "crypto";
import { prisma } from "./db";
import { computeCurrentSemesterNumber } from "./termLogic";

// A student's semester follows the calendar on its own: with the Program Lead's current term set, every student of a
// batch is in the batch's calendar semester (Fall 2025 batch, Fall 2026 term → semester 3). Only a student the Program
// Lead held back stays behind, by the number of semesters they were held back (kept in StudentHoldBack), and keeps that
// gap as terms go by. Runs when the term changes and whenever a student list or record is opened, so a student added
// later, or uploaded with semester 1, is never left behind.

const hdb = prisma as unknown as Record<string, any>;

export async function holdBacks(studentIds: string[]): Promise<Map<string, { lag: number; reason: string | null }>> {
  try { const rows = await hdb.studentHoldBack.findMany({ where: { studentId: { in: studentIds.concat(["none"]) } } }); return new Map(rows.map((r: any) => [r.studentId, { lag: r.lag, reason: r.reason }])); } catch { return new Map(); }
}

export async function setHoldBack(studentId: string, lag: number, reason: string | null, by: string) {
  if (lag <= 0) { await hdb.studentHoldBack.deleteMany({ where: { studentId } }); return; }
  await hdb.studentHoldBack.upsert({ where: { studentId }, create: { id: randomUUID(), studentId, lag, reason, setById: by, updatedAt: new Date() }, update: { lag, reason, setById: by, updatedAt: new Date() } });
}

/** Bring every student of these Program Leads' batches to the calendar semester (less any hold-back). Returns how many moved. */
export async function syncSemesters(coordinatorIds: string[]) {
  let moved = 0;
  for (const coordinatorId of Array.from(new Set(coordinatorIds))) {
    const ct = await prisma.currentTerm.findUnique({ where: { coordinatorId }, select: { termName: true, year: true } });
    if (!ct) continue;
    const batches = await prisma.batch.findMany({ where: { coordinatorId }, select: { id: true, startTerm: true, startYear: true } });
    for (const b of batches) {
      if (!/fall|spring/i.test(b.startTerm)) continue;
      const expected = computeCurrentSemesterNumber(b, ct);
      if (expected < 1) continue;
      const students = await prisma.student.findMany({ where: { batchId: b.id, status: "ACTIVE", currentSemesterNumber: { lt: expected } }, select: { id: true, currentSemesterNumber: true } });
      if (!students.length) continue;
      const held = await holdBacks(students.map((s) => s.id));
      for (const s of students) {
        const target = Math.max(1, expected - (held.get(s.id)?.lag || 0));
        if (target > s.currentSemesterNumber) { await prisma.student.update({ where: { id: s.id }, data: { currentSemesterNumber: target } }); moved++; }
      }
    }
  }
  return moved;
}
