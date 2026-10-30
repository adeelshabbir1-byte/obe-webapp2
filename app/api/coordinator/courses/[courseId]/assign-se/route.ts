import { NextRequest, NextResponse } from "next/server";
import { notifyUsers } from "../../../../../../lib/notifications";
import { hasSubjectExpertHat } from "../../../../../../lib/dualRoles";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { handlingAccess } from "../../../../../../lib/courseOwners";
import { blockedAsNonBaseCourse, syncSubjectExpertToLinkedCourses } from "../../../../../../lib/contentSync";
import { pastTermError } from "../../../../../../lib/courseTerm";
import { leaveBlock } from "../../../../../../lib/facultyLeave";
import { collegeRoleBlock } from "../../../../../../lib/affiliates";
import { withErrors } from "../../../../../../lib/apiHandler";

async function PUT_handler(req: NextRequest, { params }: { params: { courseId: string } }) {
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
  if (subjectExpertId) { const no = await collegeRoleBlock(user.managedById, "SUBJECT_EXPERT"); if (no) return NextResponse.json({ error: no }, { status: 409 }); }

  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 400) : "";

  // A course whose term is already over (e.g. Fall 2022 when it is now Fall 2026) can't be given to anyone.
  if (subjectExpertId && subjectExpertId !== course.subjectExpertId) {
    const past = await pastTermError(course.id, "Subject Expert");
    if (past) return NextResponse.json({ error: past }, { status: 409 });
    const away = await leaveBlock(subjectExpertId, course.id, "SUBJECT_EXPERT");
    if (away) return NextResponse.json({ error: away }, { status: 409 });
  }

  // Taking the course away from a Subject Expert who already submitted (or got approved) their plan needs a reason.
  const removing = !!course.subjectExpertId && subjectExpertId !== course.subjectExpertId;
  const settled = course.templateStatus === "submitted" || course.templateStatus === "approved";
  if (removing && settled && reason.length < 5) {
    const prev = await prisma.user.findUnique({ where: { id: course.subjectExpertId! }, select: { name: true } });
    return NextResponse.json({
      code: "REASON_REQUIRED",
      error: `${prev?.name || "The Subject Expert"} has already ${course.templateStatus === "approved" ? "had the plan for" : "submitted the plan for"} ${course.code}. Taking the course away from them needs a reason.`,
    }, { status: 409 });
  }

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

  const updated = await prisma.course.update({ where: { id: course.id }, data: { subjectExpertId, ...(subjectExpertId !== course.subjectExpertId ? { seResponse: subjectExpertId ? "PENDING" : "NONE", seResponseNote: null } : {}) } });

  // A course linked in a content-sync group only shows the BASE on the
  // Assign Subject Experts page (followers are hidden — "inherits
  // automatically"), so that claim has to actually be true: push this
  // assignment onto every same-term-or-later follower too, not just the
  // one row on screen.
  await syncSubjectExpertToLinkedCourses(course.id, subjectExpertId);

  await writeAuditLog({
    actorUserId: user.id, action: "SUBJECT_EXPERT_ASSIGNED", entityType: "Course", entityId: course.id,
    metadata: { subjectExpertId: subjectExpertId || "none", borrowed: borrowedSe },
  });
  if (subjectExpertId && subjectExpertId !== course.subjectExpertId) {
    await notifyUsers([subjectExpertId], { kind: "ASSIGNMENT", title: `New course to build: ${course.code} ${course.title}`, body: `${user.name} assigned you as Subject Expert of ${course.code} ${course.title}. Accept or decline it on your dashboard.`, href: "/dashboard" });
  }
  if (removing) {
    await notifyUsers([course.subjectExpertId], { kind: "ASSIGNMENT", title: `${course.code} was taken off you`, body: `${user.name} removed you as Subject Expert of ${course.code} ${course.title}${reason ? `. Reason: ${reason}` : "."}`, href: "/dashboard" });
    await writeAuditLog({
      actorUserId: user.id, action: "SUBJECT_EXPERT_REMOVED", entityType: "Course", entityId: course.id,
      metadata: { previousSubjectExpertId: course.subjectExpertId, newSubjectExpertId: subjectExpertId || "none", courseCode: course.code, courseTitle: course.title, templateStatus: course.templateStatus, reason: reason || null },
    });
  }

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
        await prisma.course.update({ where: { id: lab.id }, data: { subjectExpertId, seResponse: subjectExpertId ? "PENDING" : "NONE", seResponseNote: null } });
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
export const PUT = withErrors(PUT_handler);
