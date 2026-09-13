import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function DELETE(req: Request, { params }: { params: { userId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const faculty = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!faculty || faculty.managedById !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Never silently unassign — surface exactly what needs reassigning first,
  // since deleting the person out from under active courses would be a
  // surprising, hard-to-reverse side effect.
  const [asInstructor, asSubjectExpert, sectionAssignments] = await Promise.all([
    prisma.course.findMany({ where: { instructorId: params.userId }, select: { code: true } }),
    prisma.course.findMany({ where: { subjectExpertId: params.userId }, select: { code: true } }),
    prisma.courseSectionAssignment.findMany({ where: { instructorId: params.userId }, include: { course: true } }),
  ]);

  const blockers = [
    ...asInstructor.map((c) => `${c.code} (as Instructor)`),
    ...asSubjectExpert.map((c) => `${c.code} (as Subject Expert)`),
    ...sectionAssignments.map((s) => `${s.course.code} (additional section)`),
  ];
  if (blockers.length > 0) {
    return NextResponse.json({ error: `Reassign these courses to someone else first: ${blockers.join(", ")}` }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.facultyUnavailability.deleteMany({ where: { facultyId: params.userId } }),
    prisma.scheduleSection.deleteMany({ where: { instructorId: params.userId } }),
    prisma.user.delete({ where: { id: params.userId } }),
  ]);

  await writeAuditLog({ actorUserId: user.id, action: "FACULTY_DELETED", entityType: "User", entityId: params.userId });
  return NextResponse.json({ ok: true });
}
