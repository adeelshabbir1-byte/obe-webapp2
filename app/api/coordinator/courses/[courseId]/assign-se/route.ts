import { NextRequest, NextResponse } from "next/server";
import { hasSubjectExpertHat } from "../../../../../../lib/dualRoles";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { handlingAccess } from "../../../../../../lib/courseOwners";
import { blockedAsNonBaseCourse, syncSubjectExpertToLinkedCourses } from "../../../../../../lib/contentSync";

export async function PUT(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Own program's course, unless the Chairman gave it to another lead; another program's course only if he handles it.
  const access = await handlingAccess(user.id, course);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json();
  const subjectExpertId = body.subjectExpertId || null;

  // Only actually ASSIGNING someone is blocked on a non-base course —
  // clearing an assignment (subjectExpertId: null) is always fine.
  if (subjectExpertId) {
    const blocked = await blockedAsNonBaseCourse(course.id);
    if (blocked) return NextResponse.json({ error: blocked.replace("edited directly", "assigned a Subject Expert directly") }, { status: 409 });
  }

  let borrowedSe = false;
  if (subjectExpertId) {
    const se = await prisma.user.findUnique({ where: { id: subjectExpertId } });
    let ok = !!se && hasSubjectExpertHat(se) && (se.managedById === user.id || (se.role !== "SUBJECT_EXPERT" && se.managedById === user.managedById));
    if (!ok && se && hasSubjectExpertHat(se) && course.subjectHomeDepartmentId && se.departmentId === course.subjectHomeDepartmentId && se.managedById) {
      // An expert from the course's subject-home department (another coordinator's, same institute).
      const theirCoordinator = await prisma.user.findUnique({ where: { id: se.managedById }, select: { managedById: true } });
      ok = !!theirCoordinator && theirCoordinator.managedById === user.managedById;
    }
    if (!ok && se && hasSubjectExpertHat(se)) {
      const allowed = await prisma.teacherLoanAllowed.findFirst({ where: { instructorId: se.id, loan: { courseId: course.id, status: "APPROVED", kind: "SUBJECT_EXPERT" } } });
      if (allowed) { ok = true; borrowedSe = true; }
    }
    if (!ok) {
      return NextResponse.json({ error: "invalid subject expert" }, { status: 400 });
    }
  }

  const updated = await prisma.course.update({ where: { id: course.id }, data: { subjectExpertId, ...(subjectExpertId !== course.subjectExpertId ? { seResponse: borrowedSe ? "PENDING" : "NONE", seResponseNote: null } : {}) } });

  // A course linked in a content-sync group only shows the BASE on the
  // Assign Subject Experts page (followers are hidden — "inherits
  // automatically"), so that claim has to actually be true: push this
  // assignment onto every same-term-or-later follower too, not just the
  // one row on screen.
  await syncSubjectExpertToLinkedCourses(course.id, subjectExpertId);

  await writeAuditLog({
    actorUserId: user.id, action: "SUBJECT_EXPERT_ASSIGNED", entityType: "Course", entityId: course.id,
    metadata: { subjectExpertId: subjectExpertId || "none" },
  });

  // A theory course's Lab (code "<CODE>-L", same batch) follows its theory
  // course's Subject Expert automatically, so the Coordinator doesn't have to
  // assign PF and PF-L separately. It only FOLLOWS — a lab that already has a
  // DIFFERENT expert (set on purpose) is left alone and reported back, never
  // silently overwritten; and assigning a Lab directly never touches theory.
  let labSibling: { id: string; code: string; status: "assigned" | "cleared" | "already" | "kept" | "blocked"; subjectExpertId: string | null; keptName?: string } | null = null;
  if (course.courseType !== "Lab") {
    const lab = await prisma.course.findFirst({
      where: { coordinatorId: course.coordinatorId, batchId: course.batchId, code: `${course.code}-L`, courseType: "Lab" },
      include: { subjectExpert: { select: { name: true } } },
    });
    if (lab) {
      const previousTheoryExpert = course.subjectExpertId; // before this change
      const labFollowing = !lab.subjectExpertId || lab.subjectExpertId === previousTheoryExpert;
      if (lab.subjectExpertId === subjectExpertId) {
        labSibling = { id: lab.id, code: lab.code, status: "already", subjectExpertId };
      } else if (!labFollowing) {
        labSibling = { id: lab.id, code: lab.code, status: "kept", subjectExpertId: lab.subjectExpertId, keptName: lab.subjectExpert?.name };
      } else if (subjectExpertId && (await blockedAsNonBaseCourse(lab.id))) {
        labSibling = { id: lab.id, code: lab.code, status: "blocked", subjectExpertId: lab.subjectExpertId };
      } else {
        await prisma.course.update({ where: { id: lab.id }, data: { subjectExpertId } });
        await syncSubjectExpertToLinkedCourses(lab.id, subjectExpertId);
        await writeAuditLog({
          actorUserId: user.id, action: "SUBJECT_EXPERT_ASSIGNED", entityType: "Course", entityId: lab.id,
          metadata: { subjectExpertId: subjectExpertId || "none", via: "follows_theory_course", theoryCourseId: course.id },
        });
        labSibling = { id: lab.id, code: lab.code, status: subjectExpertId ? "assigned" : "cleared", subjectExpertId };
      }
    }
  }

  return NextResponse.json({ course: updated, labSibling });
}
