import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

const ALLOWED_ROLES = ["INSTRUCTOR", "SUBJECT_EXPERT"];

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Every distinct course code this faculty member's coordinator has ever
  // offered — the actual set they could plausibly be asked to teach.
  const courses = await prisma.course.findMany({
    where: { coordinatorId: user.managedById || "" },
    select: { code: true, title: true, courseType: true },
    distinct: ["code"],
    orderBy: { code: "asc" },
  });

  const preferences = await prisma.facultyCoursePreference.findMany({ where: { facultyId: user.id } });
  const priorityByCode = new Map(preferences.map((p) => [p.courseCode, p.priority]));

  return NextResponse.json({
    courses: courses.map((c) => ({ code: c.code, title: c.title, courseType: c.courseType, priority: priorityByCode.get(c.code) || null })),
  });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { courseCode, priority } = body;
  if (!courseCode) return NextResponse.json({ error: "courseCode is required" }, { status: 400 });

  if (priority === null || priority === undefined) {
    // "Not interested" — no explicit record needed, that's the default.
    await prisma.facultyCoursePreference.deleteMany({ where: { facultyId: user.id, courseCode } });
    return NextResponse.json({ ok: true });
  }

  const p = parseInt(priority, 10);
  if (![1, 2, 3].includes(p)) return NextResponse.json({ error: "priority must be 1, 2, 3, or null" }, { status: 400 });

  await prisma.facultyCoursePreference.upsert({
    where: { facultyId_courseCode: { facultyId: user.id, courseCode } },
    create: { facultyId: user.id, courseCode, priority: p },
    update: { priority: p },
  });
  return NextResponse.json({ ok: true });
}
