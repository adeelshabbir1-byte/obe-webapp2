import { withLabSync } from "../../../../../../../lib/labSyncRoute";
import { NextRequest, NextResponse } from "next/server";
import { templateLockResponse } from "../../../../../../../lib/templateLock";
import { getAuthenticatedUser } from "../../../../../../../lib/session";
import { prisma } from "../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../lib/subjectExpertGuard";
import { blockedAsNonBaseCourse, syncCourseContentToLinkedCourses } from "../../../../../../../lib/contentSync";
import { cascadeTopicRename, reconcileLinks } from "../../../../../../../lib/prereqCascade";
import { writeAuditLog } from "../../../../../../../lib/audit";

async function PATCH_handler(req: NextRequest, { params }: { params: { courseId: string; lectureId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const tplLocked = templateLockResponse(course); if (tplLocked) return tplLocked;

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const row = await prisma.lectureRow.findUnique({ where: { id: params.lectureId } });
  if (!row || row.courseId !== course.id || row.source !== "SE") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  if (!body.topic) return NextResponse.json({ error: "topic is required" }, { status: 400 });

  // Week and Lecture # are intentionally NOT editable here — they're fixed
  // by the 32-row template (2 lectures per week). Weight is also not set
  // here — it's auto-computed from linked assessment instruments.
  const updated = await prisma.lectureRow.update({
    where: { id: params.lectureId },
    data: {
      topic: body.topic, subtopic: body.subtopic || null,
      cloId: body.cloId || null, bloomLevel: body.bloomLevel || null,
      ...("teachingMethod" in body ? { teachingMethod: String(body.teachingMethod || "").trim().slice(0, 80) || null } : {}),
      ...("teachingMaterials" in body ? { teachingMaterials: String(body.teachingMaterials || "").trim().slice(0, 300) || null } : {}),
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: "LECTURE_ROW_UPDATED", entityType: "LectureRow", entityId: params.lectureId });
  await syncCourseContentToLinkedCourses(course.id);
  // Topic links follow a renamed topic; links to a topic that is gone stop having effect (and teachers are told).
  await cascadeTopicRename(course.id, row.topic, String(body.topic), { id: user.id, name: user.name }).catch(() => 0);
  await reconcileLinks(course.id, { id: user.id, name: user.name }).catch(() => null);

  return NextResponse.json({ row: updated });
}

async function DELETE_handler(req: Request, { params }: { params: { courseId: string; lectureId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const tplLocked = templateLockResponse(course); if (tplLocked) return tplLocked;

  const blocked = await blockedAsNonBaseCourse(course.id);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const row = await prisma.lectureRow.findUnique({ where: { id: params.lectureId } });
  if (!row || row.courseId !== course.id || row.source !== "SE") return NextResponse.json({ error: "not found" }, { status: 404 });

  const attendance = await prisma.attendanceRecord.count({ where: { lectureRowId: params.lectureId } });
  if (attendance > 0) return NextResponse.json({ error: "Attendance has already been taken for this lecture, so it cannot be deleted." }, { status: 409 });
  await prisma.$transaction([
    prisma.lectureRowInstrument.deleteMany({ where: { lectureRowId: params.lectureId } }),
    prisma.paperDistributionItem.updateMany({ where: { lectureRowId: params.lectureId }, data: { lectureRowId: null } }),
    prisma.lectureRow.delete({ where: { id: params.lectureId } }),
  ]);
  await writeAuditLog({ actorUserId: user.id, action: "LECTURE_ROW_DELETED", entityType: "LectureRow", entityId: params.lectureId });
  await syncCourseContentToLinkedCourses(course.id);
  await reconcileLinks(course.id, { id: user.id, name: user.name }).catch(() => null);

  return NextResponse.json({ ok: true });
}

// A saved change to the lecture plan is checked against the course's lab plan; the instructor and Lab Engineer are told.
export const PATCH = withLabSync(PATCH_handler);
export const DELETE = withLabSync(DELETE_handler);
