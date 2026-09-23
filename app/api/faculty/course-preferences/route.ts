import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

const ALLOWED_ROLES = ["INSTRUCTOR", "SUBJECT_EXPERT"];
const DEFAULT_SPECIALIZATION = "Computer Science";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Every course this faculty member's coordinator has ever offered,
  // across every batch — deduplicated to one entry per code in JS
  // rather than relying on Prisma's distinct(), which only collapses
  // rows where EVERY selected column matches; two batches' copies of
  // the "same" course often differ slightly in title (a stray space, a
  // punctuation difference), which would otherwise still show up as
  // separate rows despite sharing a code.
  const allCourses = await prisma.course.findMany({
    where: { coordinatorId: user.managedById || "" },
    select: { code: true, title: true, courseType: true, domain: true },
    orderBy: { createdAt: "desc" }, // so the first one kept per code is the most recently offered
  });
  const byCode = new Map<string, { code: string; title: string; courseType: string; domain: string | null }>();
  for (const c of allCourses) if (!byCode.has(c.code)) byCode.set(c.code, c);
  const courses = Array.from(byCode.values());

  const preferences = await prisma.facultyCoursePreference.findMany({ where: { facultyId: user.id } });
  const priorityByCode = new Map(preferences.map((p) => [p.courseCode, p.priority]));

  // Courses in the faculty member's own specialization surface first —
  // defaulting to Computer Science when none is set on their account,
  // since that's this platform's own base/default program.
  const mySpecialization = user.specialization || DEFAULT_SPECIALIZATION;
  courses.sort((a, b) => {
    const aMatch = a.domain === mySpecialization ? 0 : 1;
    const bMatch = b.domain === mySpecialization ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return a.code.localeCompare(b.code);
  });

  return NextResponse.json({
    mySpecialization,
    courses: courses.map((c) => ({ code: c.code, title: c.title, courseType: c.courseType, domain: c.domain, priority: priorityByCode.get(c.code) || null })),
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
