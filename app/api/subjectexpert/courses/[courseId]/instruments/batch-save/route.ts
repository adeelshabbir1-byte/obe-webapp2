import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../../lib/contentSync";
import { writeAuditLog } from "../../../../../../../lib/audit";
import { recomputeAffectedRows } from "../../../../../../../lib/lectureWeights";

type Edit = { instrumentId: string; marksPct?: number; maxScore?: number; label?: string };

// Batches every edited label/marksPct/maxScore field on the Assessments
// tab into one save (triggered by the "Save Instrument Changes" button or
// Ctrl+S), instead of the old per-field onBlur PATCH — each of those used
// to trigger its own full syncCourseContentToLinkedCourses call, so typing
// through several quizzes' marks one after another fired that heavy sync
// once per field. Same fix as the lecture-mapping save: apply every
// change first, recompute weights once, sync once.
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const body = await req.json();
  const edits: Edit[] = Array.isArray(body.edits) ? body.edits : [];
  if (edits.length === 0) return NextResponse.json({ instruments: [] });

  const instrumentIds = edits.map((e) => e.instrumentId);
  const validInstruments = await prisma.assessmentInstrument.findMany({ where: { id: { in: instrumentIds }, courseId: course.id, source: "SE" } });
  const validIds = new Set(validInstruments.map((i) => i.id));

  const badMarks: string[] = [];
  for (const e of edits) {
    if (!validIds.has(e.instrumentId)) continue;
    const data: any = {};
    if (e.marksPct !== undefined) {
      const marksPct = Math.round(e.marksPct);
      if (isNaN(marksPct) || marksPct < 0 || marksPct > 100) { badMarks.push(e.instrumentId); continue; }
      data.marksPct = marksPct;
    }
    if (e.maxScore !== undefined) {
      const maxScore = Math.round(e.maxScore);
      if (isNaN(maxScore) || maxScore < 1) { badMarks.push(e.instrumentId); continue; }
      data.maxScore = maxScore;
    }
    if (e.label !== undefined && e.label.trim()) data.label = e.label.trim();
    if (Object.keys(data).length === 0) continue;
    await prisma.assessmentInstrument.update({ where: { id: e.instrumentId }, data });
  }
  if (badMarks.length > 0) {
    return NextResponse.json({ error: "Marks % must be 0-100 and Out Of must be at least 1 — check the highlighted fields." }, { status: 400 });
  }

  await recomputeAffectedRows(Array.from(validIds));
  await writeAuditLog({ actorUserId: user.id, action: "INSTRUMENTS_BATCH_UPDATED", entityType: "Course", entityId: course.id, metadata: { count: edits.length } });
  await syncCourseContentToLinkedCourses(course.id);

  const instruments = await prisma.assessmentInstrument.findMany({
    where: { courseId: course.id, source: "SE" },
    orderBy: [{ type: "asc" }, { label: "asc" }],
    include: { evidence: { orderBy: { createdAt: "desc" } } },
  });
  return NextResponse.json({
    instruments: instruments.map((i) => ({
      id: i.id, type: i.type, label: i.label, marksPct: i.marksPct, maxScore: i.maxScore,
      evidence: i.evidence.map((e) => ({ id: e.id, fileName: e.fileName, fileUrl: e.fileUrl, status: e.status, method: e.method, reasoning: e.reasoning })),
    })),
  });
}
