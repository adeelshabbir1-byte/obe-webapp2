import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../../lib/session";
import { prisma } from "../../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../../lib/instructorGuard";
import { rdb, parseCriteria, scoreFor, type RubricRow } from "../../../../../../../../lib/rubrics";
import { writePartMarks } from "../../../../../../../../lib/instrumentParts";
import { resultLockMessage } from "../../../../../../../../lib/resultApproval";

// PUT { studentId, levels: { criterionId: levelIndex }, comment } — mark one student with the rubric. When every criterion
// has a level, the item's mark is written to Marks Entry too.
export async function PUT(req: NextRequest, { params }: { params: { courseId: string; instrumentId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  { const locked = await resultLockMessage(course.id); if (locked) return NextResponse.json({ error: locked }, { status: 409 }); }
  const inst = await prisma.assessmentInstrument.findUnique({ where: { id: params.instrumentId } });
  const rubric = (await rdb.rubric.findUnique({ where: { instrumentId: params.instrumentId } })) as RubricRow | null;
  if (!inst || !rubric || inst.courseId !== course.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const studentId = String(b.studentId || "");
  const enrolled = await prisma.studentEnrollment.findFirst({ where: { courseId: course.id, studentId, status: { not: "WITHDRAWN" } } });
  if (!enrolled) return NextResponse.json({ error: "That student is not enrolled in this course." }, { status: 400 });
  const criteria = parseCriteria(rubric.criteriaJson);
  const levels: Record<string, number> = {};
  for (const c of criteria) {
    const i = b.levels?.[c.id];
    if (i === undefined || i === null || i === "") continue;
    const n = Number(i);
    if (!Number.isInteger(n) || !c.levels[n]) return NextResponse.json({ error: `Invalid level for "${c.title}".` }, { status: 400 });
    levels[c.id] = n;
  }
  const comment = b.comment ? String(b.comment).slice(0, 1000) : null;
  await rdb.rubricScore.upsert({ where: { rubricId_studentId: { rubricId: rubric.id, studentId } }, update: { levelsJson: JSON.stringify(levels), comment }, create: { rubricId: rubric.id, studentId, levelsJson: JSON.stringify(levels), comment } });
  const r = scoreFor(criteria, levels, inst.maxScore);
  if (r) await prisma.studentMark.upsert({ where: { studentId_instrumentId: { studentId, instrumentId: inst.id } }, update: { score: r.score, enteredById: user.id }, create: { studentId, courseId: course.id, instrumentId: inst.id, score: r.score, enteredById: user.id } });
  // A project split into parts by CLO: each part gets its own mark from its criteria.
  await writePartMarks(inst.id, course.id, studentId, rubric.criteriaJson, levels, user.id).catch(() => null);
  return NextResponse.json({ ok: true, complete: !!r, score: r?.score ?? null, pct: r?.pct ?? null });
}
