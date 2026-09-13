import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

const ALLOWED_ROLES = ["SUBJECT_EXPERT", "INSTRUCTOR", "PROGRAM_COORDINATOR"];

// Full-replace: the grid UI sends the complete set of unchecked (=
// unavailable) slots every time, so we just delete everything for this
// faculty member and recreate from scratch — simpler and safer than diffing.
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const facultyId: string = body.facultyId || user.id;
  const slots: { dayOfWeek: string; startHour: number; endHour: number }[] = body.slots || [];

  if (facultyId !== user.id) {
    // A Coordinator setting it on someone else's behalf — verify ownership.
    if (user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const faculty = await prisma.user.findUnique({ where: { id: facultyId } });
    if (!faculty || faculty.managedById !== user.id) return NextResponse.json({ error: "faculty not found" }, { status: 404 });
  }

  await prisma.facultyUnavailability.deleteMany({ where: { facultyId } });
  if (slots.length > 0) {
    await prisma.facultyUnavailability.createMany({
      data: slots.map((s) => ({ facultyId, dayOfWeek: s.dayOfWeek, startHour: s.startHour, endHour: s.endHour, setById: user.id })),
    });
  }

  return NextResponse.json({ ok: true, count: slots.length });
}
