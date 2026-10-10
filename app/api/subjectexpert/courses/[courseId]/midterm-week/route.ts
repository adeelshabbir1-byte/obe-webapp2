import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../lib/subjectExpertGuard";

// The SE says which week the midterm falls after (null = back to the automatic guess).
export async function PUT(req: Request, { params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const raw = body.week;
  const week = raw === null || raw === "" || raw === undefined ? null : parseInt(raw, 10);
  if (week !== null && (isNaN(week) || week < 1 || week > 30)) return NextResponse.json({ error: "week must be between 1 and 30" }, { status: 400 });
  await prisma.course.update({ where: { id: course.id }, data: { midtermWeek: week } as never });
  return NextResponse.json({ ok: true });
}
