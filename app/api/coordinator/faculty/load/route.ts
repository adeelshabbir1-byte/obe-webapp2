import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const faculty = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!faculty || faculty.managedById !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Only allow switching between the two roles this page manages — never
  // an arbitrary role change to something like OMC or Coordinator.
  let newRole = faculty.role;
  if (body.role !== undefined && ["SUBJECT_EXPERT", "INSTRUCTOR"].includes(body.role) && body.role !== faculty.role) {
    newRole = body.role;
  }

  // Outside expert: designs courses but never teaches. Refuse while the person still teaches a course.
  const makeOutside = body.outsideExpert === true && newRole === "SUBJECT_EXPERT";
  if (makeOutside && faculty.canTeach !== false) {
    const teaching = await prisma.course.count({ where: { instructorId: faculty.id } });
    if (teaching > 0) return NextResponse.json({ error: `${faculty.name} is the Instructor of ${teaching} course${teaching === 1 ? "" : "s"}. Give those to another teacher first.` }, { status: 409 });
  }
  const outsideData = body.outsideExpert === undefined ? {} : makeOutside
    ? { canTeach: false, organization: typeof body.organization === "string" && body.organization.trim() ? body.organization.trim() : null }
    : { canTeach: true, organization: null };

  const updated = await prisma.user.update({
    where: { id: body.userId },
    data: {
      role: newRole,
      ...outsideData,
      normalLoad: body.normalLoad !== undefined ? parseInt(body.normalLoad, 10) : faculty.normalLoad,
      externalLoadCount: body.externalLoadCount !== undefined ? parseInt(body.externalLoadCount, 10) : faculty.externalLoadCount,
      externalLoadNote: body.externalLoadNote !== undefined ? body.externalLoadNote || null : faculty.externalLoadNote,
      specialization: body.specialization !== undefined ? body.specialization || null : faculty.specialization,
      // secondaryRole only makes sense once the (possibly just-changed) primary role is Subject Expert.
      secondaryRole: makeOutside ? null : body.secondaryRole !== undefined ? (newRole === "SUBJECT_EXPERT" && body.secondaryRole === "INSTRUCTOR" ? "INSTRUCTOR" : null) : faculty.secondaryRole,
    },
  });

  await writeAuditLog({ actorUserId: user.id, action: body.outsideExpert !== undefined && makeOutside !== (faculty.canTeach === false) ? (makeOutside ? "FACULTY_MADE_OUTSIDE_EXPERT" : "FACULTY_MADE_INTERNAL") : newRole !== faculty.role ? "FACULTY_ROLE_CHANGED" : "FACULTY_LOAD_UPDATED", entityType: "User", entityId: body.userId });

  const { passwordHash, ...safe } = updated;
  return NextResponse.json({ user: safe });
}
