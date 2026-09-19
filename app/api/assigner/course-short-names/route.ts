import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const [courses, shortNames] = await Promise.all([
    prisma.course.findMany({
      where: { coordinatorId: { in: coordinatorIds } },
      select: { code: true, title: true },
      distinct: ["code"],
      orderBy: { code: "asc" },
    }),
    prisma.courseShortName.findMany({ where: { chairmanId: user.managedById } }),
  ]);
  const shortByCode = new Map(shortNames.map((s) => [s.courseCode, s.shortName]));

  return NextResponse.json({
    courses: courses.map((c) => ({ code: c.code, title: c.title, shortName: shortByCode.get(c.code) || null })),
  });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const body = await req.json();
  const courseCode: string = body.courseCode;
  const shortName: string | null = body.shortName ? String(body.shortName).trim() : null;
  if (!courseCode) return NextResponse.json({ error: "courseCode is required" }, { status: 400 });
  if (shortName && shortName.length > 8) return NextResponse.json({ error: "short name must be 8 characters or fewer" }, { status: 400 });

  if (!shortName) {
    await prisma.courseShortName.deleteMany({ where: { chairmanId: user.managedById, courseCode } });
  } else {
    await prisma.courseShortName.upsert({
      where: { chairmanId_courseCode: { chairmanId: user.managedById, courseCode } },
      create: { chairmanId: user.managedById, courseCode, shortName },
      update: { shortName },
    });
  }

  return NextResponse.json({ ok: true });
}
