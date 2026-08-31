import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const courses = await prisma.course.findMany({
    where: { coordinatorId: user.id },
    orderBy: { createdAt: "desc" },
    include: { subjectExpert: true },
  });
  return NextResponse.json({
    courses: courses.map((c) => ({
      id: c.id, code: c.code, title: c.title, creditHours: c.creditHours,
      subjectExpertName: c.subjectExpert?.name ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.code || !body.title || !body.creditHours) {
    return NextResponse.json({ error: "code, title, creditHours are required" }, { status: 400 });
  }

  const course = await prisma.course.create({
    data: {
      code: body.code,
      title: body.title,
      creditHours: parseInt(body.creditHours, 10),
      coordinatorId: user.id,
      masterCourseId: body.masterCourseId || null,
    },
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: body.masterCourseId ? "COURSE_ADOPTED_FROM_MASTER" : "COURSE_CREATED",
    entityType: "Course",
    entityId: course.id,
    metadata: body.masterCourseId ? { masterCourseId: body.masterCourseId } : undefined,
  });

  return NextResponse.json({ course }, { status: 201 });
}
