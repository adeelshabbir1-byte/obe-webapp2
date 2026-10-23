import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { evdb } from "../../../../lib/evaluations";
import { instituteOfBatch } from "../../../../lib/moduleLocks";
import { settingsFor, windowOf } from "../../../../lib/questionnaires";

export const dynamic = "force-dynamic";

// GET — the student's courses whose feedback window is open and that they have not answered yet (the portal reminder).
export async function GET() {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ due: [] });
  const chairmanId = await instituteOfBatch(st.batchId).catch(() => null);
  const s = await settingsFor(chairmanId);
  const enr = await prisma.studentEnrollment.findMany({ where: { studentId: st.id, status: "ACTIVE", course: { isOffered: true } }, select: { course: { select: { id: true, code: true, title: true } } } });
  const done = new Set(((await evdb.courseEvaluation.findMany({ where: { studentId: st.id, courseId: { in: enr.map((e) => e.course.id).concat("none") } }, select: { courseId: true, kind: true } }).catch(() => [])) as { courseId: string; kind: string }[]).filter((x) => x.kind === "TEACHER").map((x) => x.courseId));
  const due: { courseId: string; code: string; title: string; closesOn: string | null }[] = [];
  for (const e of enr) {
    if (done.has(e.course.id)) continue;
    const w = await windowOf(e.course.id, s);
    if (w.open && w.week !== null) due.push({ courseId: e.course.id, code: e.course.code, title: e.course.title, closesOn: w.closesOn });
  }
  return NextResponse.json({ due });
}
