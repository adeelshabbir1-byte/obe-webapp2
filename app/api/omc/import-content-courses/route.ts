import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || (user.role !== "OMC" && user.role !== "CHAIRMAN")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || user.id } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
    include: { batch: true, _count: { select: { studentMarks: true } } },
    orderBy: [{ code: "asc" }],
  });

  return NextResponse.json({
    courses: courses.map((c) => ({
      id: c.id, code: c.code, title: c.title, degreeProgram: c.batch?.degreeProgram || "", batchName: c.batch?.batchName || "",
      hasGradedMarks: c._count.studentMarks > 0,
    })),
  });
}
