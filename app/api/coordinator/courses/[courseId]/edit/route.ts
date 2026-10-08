import { NextRequest, NextResponse } from "next/server";
import { blockedAsNonBaseCourse, syncSubjectHomeToLinkedCourses } from "../../../../../../lib/contentSync";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { TRACKS } from "../../../../../../lib/tracks";

export async function PATCH(req: NextRequest, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  // Owning Coordinator edits their own course directly; OMC can edit any
  // course in a batch belonging to a Coordinator under their own
  // Institute Head — same institution-wide scope OMC already has for
  // repositioning and filling elective slots on this same page.
  if (!user || (user.role !== "PROGRAM_COORDINATOR" && user.role !== "OMC")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const course = await prisma.course.findUnique({ where: { id: params.courseId }, include: { coordinator: true } });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (user.role === "PROGRAM_COORDINATOR" && course.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (user.role === "OMC" && (course.coordinator.managedById !== user.managedById || (user.departmentId && course.coordinator.departmentId !== user.departmentId))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const isNonCredit = body.isNonCredit !== undefined ? !!body.isNonCredit : course.isNonCredit;
  const creditMissing = body.creditHours === undefined || body.creditHours === null || body.creditHours === "";
  if (!body.code || !body.title || creditMissing) {
    return NextResponse.json({ error: "code, title, creditHours are required" }, { status: 400 });
  }
  const creditHours = isNonCredit ? 0 : parseInt(body.creditHours, 10);
  if (!isNonCredit && (isNaN(creditHours) || creditHours < 1)) {
    return NextResponse.json({ error: "credit hours must be at least 1 (tick \"Non-credit\" for a deficiency course)" }, { status: 400 });
  }
  let contactHours: number | null | undefined = undefined; // undefined = leave as is
  if (body.contactHours !== undefined) {
    contactHours = body.contactHours === null || body.contactHours === "" ? null : parseInt(body.contactHours, 10);
    if (contactHours !== null && (isNaN(contactHours) || contactHours < 1 || contactHours > 20)) {
      return NextResponse.json({ error: "contact hours per week must be a number from 1 to 20" }, { status: 400 });
    }
  }
  if (isNonCredit && (contactHours === null || (contactHours === undefined && !course.contactHours))) {
    return NextResponse.json({ error: "a non-credit course needs its weekly contact hours (e.g. 3) so it can be timetabled" }, { status: 400 });
  }
  let trackName: string | null | undefined = undefined;
  if (body.trackName !== undefined) {
    trackName = body.trackName ? String(body.trackName).trim() : null;
    if (trackName && !(TRACKS as readonly string[]).includes(trackName)) {
      return NextResponse.json({ error: "unknown track" }, { status: 400 });
    }
  }

  let subjectHomeDepartmentId: string | null | undefined = undefined;
  if (body.subjectHomeDepartmentId !== undefined) {
    subjectHomeDepartmentId = body.subjectHomeDepartmentId || null;
    if (subjectHomeDepartmentId) {
      const dept = await prisma.department.findFirst({ where: { id: subjectHomeDepartmentId, chairmanId: course.coordinator.managedById || "" } });
      if (!dept) return NextResponse.json({ error: "unknown department" }, { status: 400 });
    }
    // Equivalent (linked) courses: only the BASE course sets the subject home; followers take it from the base.
    if (subjectHomeDepartmentId !== course.subjectHomeDepartmentId && (await blockedAsNonBaseCourse(course.id))) {
      return NextResponse.json({ error: "This course follows a linked base course. Change the subject home on the base course instead - this one will follow it automatically." }, { status: 409 });
    }
  }

  if (body.code !== course.code) {
    const clash = await prisma.course.findFirst({ where: { coordinatorId: course.coordinatorId, batchId: course.batchId, code: body.code, NOT: { id: course.id } } });
    if (clash) return NextResponse.json({ error: "another course in this batch already uses this code" }, { status: 409 });
  }

  const hasLab = body.hasLab !== undefined ? !!body.hasLab : course.hasLab;
  const zeroingLab = course.hasLab && !hasLab; // was true, now being turned off

  const updated = await prisma.course.update({
    where: { id: course.id },
    data: {
      code: body.code, title: body.title, creditHours,
      isNonCredit,
      ...(contactHours !== undefined ? { contactHours } : {}),
      ...(trackName !== undefined ? { trackName } : {}),
      ...(subjectHomeDepartmentId !== undefined ? { subjectHomeDepartmentId } : {}),
      courseType: body.courseType || course.courseType,
      semesterNumber: body.semesterNumber ? parseInt(body.semesterNumber, 10) : null,
      hasLab,
      ...(zeroingLab ? { labPct: 0, instructorLabPct: 0 } : {}),
    },
  });

  let followersUpdated = 0;
  if (subjectHomeDepartmentId !== undefined && subjectHomeDepartmentId !== course.subjectHomeDepartmentId) followersUpdated = await syncSubjectHomeToLinkedCourses(course.id);

  await writeAuditLog({ actorUserId: user.id, action: "COURSE_EDITED", entityType: "Course", entityId: course.id, metadata: followersUpdated ? { subjectHomeFollowersUpdated: followersUpdated } : undefined });

  return NextResponse.json({ course: updated, followersUpdated });
}
