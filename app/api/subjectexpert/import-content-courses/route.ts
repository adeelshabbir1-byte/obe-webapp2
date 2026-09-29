import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { findOwningChairmanId } from "../../../../lib/institutionCurriculum";

// Lists candidate SOURCE courses for a Subject Expert's "Import from
// another course" action — every course within this SE's own
// institution (same chairman, walked up generically so it works
// regardless of exactly who manages this SE), not just the ones this
// particular SE happens to own. A course someone else already built out
// — a past offering, a twin section, a closely related elective — is
// exactly the kind of starting point this exists for.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUBJECT_EXPERT") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const chairmanId = await findOwningChairmanId(user.id);
  if (!chairmanId) return NextResponse.json({ courses: [] });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds } },
    include: { batch: true, _count: { select: { clos: true } } },
    orderBy: [{ code: "asc" }],
  });

  return NextResponse.json({
    courses: courses
      .filter((c) => c._count.clos > 0) // no point listing an empty course as a source
      .map((c) => ({ id: c.id, code: c.code, title: c.title, degreeProgram: c.batch?.degreeProgram || "", batchName: c.batch?.batchName || "" })),
  });
}
