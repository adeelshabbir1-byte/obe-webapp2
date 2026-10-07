import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { getOrCreateVisitingFaculty } from "../../../../lib/departments";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const [courses, faculty] = await Promise.all([
    prisma.course.findMany({
      where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
      include: { batch: true, instructor: true },
      orderBy: [{ code: "asc" }],
    }),
    prisma.user.findMany({ where: { managedById: { in: coordinatorIds }, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } }, orderBy: { name: "asc" } }),
  ]);

  const visiting = await getOrCreateVisitingFaculty(user.managedById || "");

  return NextResponse.json({
    courses: courses.map((c) => ({
      id: c.id, code: c.code, title: c.title, instructorId: c.instructorId, instructorName: c.instructor?.name || null,
      batchLabel: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—",
      degreeProgram: c.batch?.degreeProgram || "",
      semesterNumber: c.semesterNumber ?? null,
    })),
    faculty: [{ id: visiting.id, name: visiting.name }, ...faculty.map((f) => ({ id: f.id, name: f.name }))],
  });
}
