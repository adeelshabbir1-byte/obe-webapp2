import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

const ALLOWED_ROLES = ["SUBJECT_EXPERT", "INSTRUCTOR"];

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const [courses, priorities] = await Promise.all([
    prisma.course.findMany({ where: { coordinatorId: { in: coordinatorIds }, isOffered: true } }),
    prisma.facultyCoursePriority.findMany({ where: { facultyId: user.id } }),
  ]);

  const codeSeen = new Map<string, { code: string; title: string }>();
  for (const c of courses) if (!codeSeen.has(c.code)) codeSeen.set(c.code, { code: c.code, title: c.title });
  const priorityByCode = new Map(priorities.map((p) => [p.courseCode, p.priority]));

  return NextResponse.json({
    courses: Array.from(codeSeen.values())
      .map((c) => ({ ...c, priority: priorityByCode.get(c.code) ?? null }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.courseCode || ![1, 2, 3, 4].includes(parseInt(body.priority, 10))) {
    return NextResponse.json({ error: "courseCode and a priority of 1-4 are required" }, { status: 400 });
  }

  await prisma.facultyCoursePriority.upsert({
    where: { facultyId_courseCode: { facultyId: user.id, courseCode: body.courseCode } },
    create: { facultyId: user.id, courseCode: body.courseCode, priority: parseInt(body.priority, 10) },
    update: { priority: parseInt(body.priority, 10) },
  });

  return NextResponse.json({ ok: true });
}
