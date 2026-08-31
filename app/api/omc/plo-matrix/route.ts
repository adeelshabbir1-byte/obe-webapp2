import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const coordinators = await prisma.user.findMany({
    where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" },
    orderBy: { name: "asc" },
  });

  const programs = [];
  for (const coord of coordinators) {
    const courses = await prisma.course.findMany({
      where: { coordinatorId: coord.id },
      orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      include: { ploMappings: true },
    });
    const plos = await prisma.pLO.findMany({ where: { coordinatorId: coord.id }, orderBy: { number: "asc" } });

    programs.push({
      coordinatorId: coord.id,
      coordinatorName: coord.name,
      plos: plos.map((p) => ({ id: p.id, number: p.number, title: p.title, status: p.status })),
      courses: courses.map((c) => ({
        id: c.id, code: c.code, title: c.title, courseType: c.courseType, semesterNumber: c.semesterNumber,
        mappedPloIds: c.ploMappings.map((m) => m.ploId),
      })),
    });
  }

  return NextResponse.json({ programs });
}
