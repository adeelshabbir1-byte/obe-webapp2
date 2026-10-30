import { NextRequest, NextResponse } from "next/server";
import { resultLockMessage } from "../../../../../../lib/resultApproval";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../lib/instructorGuard";
import { writeAuditLog } from "../../../../../../lib/audit";
import { normKey } from "../../../../../../lib/lmsImport";
import { collegeMarksBlock } from "../../../../../../lib/affiliates";
import { withErrors } from "../../../../../../lib/apiHandler";

type Body = { source?: string; rows: { key: string; name?: string; scores: Record<string, string> }[]; map: { col: string; instrumentId: string; outOf: number }[]; overwrite?: boolean };

// Imports an LMS gradebook (Moodle, Google Classroom, Canvas) into this course's assessments.
// Each LMS column is mapped to one assessment; scores are rescaled from the LMS "out of" to the assessment's own max,
// so the marks then flow to CLOs and PLOs exactly like typed marks.
async function POST_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  { const locked = await resultLockMessage(course.id); if (locked) return NextResponse.json({ error: locked }, { status: 409 }); }
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b || !Array.isArray(b.rows) || !Array.isArray(b.map) || !b.map.length) return NextResponse.json({ error: "Map at least one column to an assessment." }, { status: 400 });
  const insts = await prisma.assessmentInstrument.findMany({ where: { courseId: course.id, source: "INSTRUCTOR", id: { in: b.map.map((m) => m.instrumentId) } } });
  { const uniOnly = await collegeMarksBlock(course.id, insts.map((i) => i.id)); if (uniOnly) return NextResponse.json({ error: uniOnly }, { status: 409 }); }
  const iOf = new Map(insts.map((i) => [i.id, i]));
  const enr = await prisma.studentEnrollment.findMany({ where: { courseId: course.id }, select: { student: { select: { id: true, rollNumber: true, name: true } } } });
  const byRoll = new Map(enr.map((e) => [normKey(e.student.rollNumber), e.student.id]));
  const byName = new Map(enr.map((e) => [e.student.name.toLowerCase().replace(/\s+/g, " ").trim(), e.student.id]));
  const existing = new Set((await prisma.studentMark.findMany({ where: { courseId: course.id }, select: { studentId: true, instrumentId: true } })).map((m) => `${m.studentId}|${m.instrumentId}`));
  const unmatched: string[] = []; let written = 0, skipped = 0;
  const ops: ReturnType<typeof prisma.studentMark.upsert>[] = [];
  for (const r of b.rows.slice(0, 2000)) {
    const sid = byRoll.get(normKey(String(r.key || ""))) || (r.name ? byName.get(r.name.toLowerCase().replace(/\s+/g, " ").trim()) : undefined);
    if (!sid) { unmatched.push(r.name ? `${r.key} (${r.name})` : String(r.key)); continue; }
    for (const m of b.map) {
      const inst = iOf.get(m.instrumentId); if (!inst) continue;
      const raw = String(r.scores?.[m.col] ?? "").trim().replace(/%$/, "");
      if (raw === "" || raw === "-") continue;
      const v = Number(raw), outOf = Number(m.outOf) > 0 ? Number(m.outOf) : inst.maxScore;
      if (!Number.isFinite(v)) continue;
      if (!b.overwrite && existing.has(`${sid}|${inst.id}`)) { skipped++; continue; }
      const score = Math.round(Math.max(0, Math.min(inst.maxScore, (v / outOf) * inst.maxScore)) * 100) / 100;
      ops.push(prisma.studentMark.upsert({ where: { studentId_instrumentId: { studentId: sid, instrumentId: inst.id } }, create: { studentId: sid, courseId: course.id, instrumentId: inst.id, score, enteredById: user.id }, update: { score, enteredById: user.id } }));
      written++;
    }
  }
  for (let i = 0; i < ops.length; i += 200) await prisma.$transaction(ops.slice(i, i + 200));
  await writeAuditLog({ actorUserId: user.id, action: "MARKS_IMPORTED_LMS", entityType: "Course", entityId: course.id, metadata: { source: b.source || "CSV", columns: b.map.map((m) => iOf.get(m.instrumentId)?.label).join(", "), written, skipped, unmatched: unmatched.length } });
  return NextResponse.json({ ok: true, written, skipped, unmatched: unmatched.slice(0, 50), unmatchedCount: unmatched.length });
}
export const POST = withErrors(POST_handler);
