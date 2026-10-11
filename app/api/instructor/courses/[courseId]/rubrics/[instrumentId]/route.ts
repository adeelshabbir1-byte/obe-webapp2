import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireInstructorCourse } from "../../../../../../../lib/instructorGuard";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { rdb, validateCriteria, parseCriteria, scoreFor, type RubricRow, type RubricScoreRow } from "../../../../../../../lib/rubrics";
import { resultLockMessage } from "../../../../../../../lib/resultApproval";

// PUT { title, criteria } — save the rubric of one assessment item. If students were already marked with it, their
// marks are worked out again from their chosen levels (a criterion that was removed or added makes them unmarked).
export async function PUT(req: NextRequest, { params }: { params: { courseId: string; instrumentId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const inst = await prisma.assessmentInstrument.findUnique({ where: { id: params.instrumentId } });
  if (!inst || inst.courseId !== course.id || inst.source !== "INSTRUCTOR") return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const clos = await prisma.cLO.findMany({ where: { courseId: course.id, source: "INSTRUCTOR" }, select: { id: true } });
  const v = validateCriteria(b.criteria, new Set(clos.map((c) => c.id)));
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const title = String(b.title || `${inst.label} rubric`).trim().slice(0, 200);
  const existing = (await rdb.rubric.findUnique({ where: { instrumentId: inst.id } })) as RubricRow | null;
  if (existing) {
    const scored = (await rdb.rubricScore.count({ where: { rubricId: existing.id } })) as number;
    const changedShape = JSON.stringify(parseCriteria(existing.criteriaJson).map((c) => [c.id, c.weight, c.levels.map((l) => l.points)])) !== JSON.stringify(v.criteria.map((c) => [c.id, c.weight, c.levels.map((l) => l.points)]));
    if (scored && changedShape) { const locked = await resultLockMessage(course.id); if (locked) return NextResponse.json({ error: locked }, { status: 409 }); }
  }
  const row = (await rdb.rubric.upsert({
    where: { instrumentId: inst.id },
    update: { title, criteriaJson: JSON.stringify(v.criteria) },
    create: { instrumentId: inst.id, courseId: course.id, title, criteriaJson: JSON.stringify(v.criteria), createdById: user.id },
  })) as RubricRow;
  // Re-work marks already given with this rubric.
  const scores = (await rdb.rubricScore.findMany({ where: { rubricId: row.id } })) as RubricScoreRow[];
  let updated = 0;
  for (const s of scores) {
    const r = scoreFor(v.criteria, JSON.parse(s.levelsJson || "{}"), inst.maxScore);
    if (!r) continue;
    await prisma.studentMark.upsert({ where: { studentId_instrumentId: { studentId: s.studentId, instrumentId: inst.id } }, update: { score: r.score, enteredById: user.id }, create: { studentId: s.studentId, courseId: course.id, instrumentId: inst.id, score: r.score, enteredById: user.id } });
    updated++;
  }
  await writeAuditLog({ actorUserId: user.id, action: "RUBRIC_SAVED", entityType: "AssessmentInstrument", entityId: inst.id, metadata: { criteria: v.criteria.length, remarked: updated } });
  return NextResponse.json({ ok: true, id: row.id, remarked: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { courseId: string; instrumentId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireInstructorCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const row = (await rdb.rubric.findUnique({ where: { instrumentId: params.instrumentId } })) as RubricRow | null;
  if (!row || row.courseId !== course.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if ((await rdb.rubricScore.count({ where: { rubricId: row.id } })) > 0) return NextResponse.json({ error: "Students are already marked with this rubric — it can be edited but not deleted." }, { status: 409 });
  await rdb.rubric.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}
