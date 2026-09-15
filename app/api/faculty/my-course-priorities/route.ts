import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

const ALLOWED_ROLES = ["SUBJECT_EXPERT", "INSTRUCTOR"];

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Every distinct course code currently offered under this faculty
  // member's institution — what they can actually express a preference on.
  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);
  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
    select: { code: true, title: true },
    distinct: ["code"],
    orderBy: { code: "asc" },
  });

  const existing = await prisma.facultyCoursePriority.findMany({ where: { facultyId: user.id } });
  const priorityByCode = new Map(existing.map((p) => [p.courseCode, p.priority]));

  return NextResponse.json({
    courses: courses.map((c) => ({ code: c.code, title: c.title, priority: priorityByCode.get(c.code) ?? null })),
  });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const courseCode: string = body.courseCode;
  const priority: number | null = body.priority === null || body.priority === undefined ? null : parseInt(body.priority, 10);
  if (!courseCode) return NextResponse.json({ error: "courseCode is required" }, { status: 400 });
  if (priority !== null && ![1, 2, 3].includes(priority)) return NextResponse.json({ error: "priority must be 1, 2, 3, or null" }, { status: 400 });

  if (priority === null) {
    await prisma.facultyCoursePriority.deleteMany({ where: { facultyId: user.id, courseCode } });
  } else {
    await prisma.facultyCoursePriority.upsert({
      where: { facultyId_courseCode: { facultyId: user.id, courseCode } },
      create: { facultyId: user.id, courseCode, priority },
      update: { priority },
    });
  }

  return NextResponse.json({ ok: true });
}
