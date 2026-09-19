import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { termIndex } from "../../../../../../lib/termLogic";

// Changes a course's code and propagates it forward to every course
// content-sync-linked to it, but ONLY those from batches at the same
// point in time or later — never rewriting an earlier batch's already-
// established code. "Later" defaults to any program in the group;
// applyToAllPrograms=false scopes it to only the same program as the
// edited course instead, for cases like electives where the code
// shouldn't necessarily follow across different programs.
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { courseId, newCode, applyToAllPrograms = true } = body;
  if (!courseId || !newCode || !String(newCode).trim()) {
    return NextResponse.json({ error: "courseId and newCode are required" }, { status: 400 });
  }
  const trimmedCode = String(newCode).trim();

  const editedCourse = await prisma.course.findUnique({ where: { id: courseId }, include: { batch: true } });
  if (!editedCourse || !editedCourse.batch) return NextResponse.json({ error: "course not found" }, { status: 404 });

  const editedTermIndex = termIndex(editedCourse.batch.startTerm, editedCourse.batch.startYear);

  const membership = await prisma.courseContentSyncMember.findUnique({ where: { courseId } });

  // Every course this change should touch — starts with just the edited
  // course itself; linked courses are added below if there's a group.
  const targets: { id: string; coordinatorId: string; batchId: string; code: string }[] = [
    { id: editedCourse.id, coordinatorId: editedCourse.coordinatorId, batchId: editedCourse.batchId!, code: editedCourse.code },
  ];

  if (membership) {
    const otherMembers = await prisma.courseContentSyncMember.findMany({
      where: { groupId: membership.groupId, courseId: { not: courseId } },
      include: { course: { include: { batch: true } } },
    });
    for (const m of otherMembers) {
      if (!m.course.batch) continue;
      const memberTermIndex = termIndex(m.course.batch.startTerm, m.course.batch.startYear);
      if (memberTermIndex < editedTermIndex) continue; // strictly earlier batches are never touched
      if (!applyToAllPrograms && m.course.batch.degreeProgram !== editedCourse.batch.degreeProgram) continue;
      targets.push({ id: m.course.id, coordinatorId: m.course.coordinatorId, batchId: m.course.batchId!, code: m.course.code });
    }
  }

  // Safety check: the new code can't collide with a DIFFERENT, unrelated
  // course already sitting in the same batch — the unique constraint is
  // scoped per (coordinator, batch), so the same code IS allowed across
  // different batches/programs, but not against something else already
  // there in one of the target batches specifically.
  for (const t of targets) {
    const clash = await prisma.course.findFirst({
      where: { coordinatorId: t.coordinatorId, batchId: t.batchId, code: trimmedCode, id: { not: t.id } },
      select: { id: true, title: true },
    });
    if (clash) {
      return NextResponse.json({ error: `"${trimmedCode}" is already used by another course ("${clash.title}") in one of the affected batches — pick a different code.` }, { status: 409 });
    }
  }

  await prisma.$transaction(targets.map((t) => prisma.course.update({ where: { id: t.id }, data: { code: trimmedCode } })));

  await writeAuditLog({
    actorUserId: user.id, action: "COURSE_CODE_CHANGED_WITH_PROPAGATION", entityType: "Course", entityId: courseId,
    metadata: { newCode: trimmedCode, affectedCount: targets.length, applyToAllPrograms },
  });

  return NextResponse.json({ ok: true, updatedCount: targets.length, updatedCourseIds: targets.map((t) => t.id) });
}
