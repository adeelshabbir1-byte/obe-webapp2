import { NextRequest, NextResponse } from "next/server";
import { timetableActor, READ_ONLY, scopeFaculty } from "../../../../lib/timetableAccess";
import { prisma } from "../../../../lib/db";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Preferred teaching days are a PREFERENCE, not a rule: the timetable generator tries to keep this
// instructor's classes on these days but will move one if that's the only way to avoid a clash.
export async function GET(req: NextRequest) {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = actor.user;
  const facultyId = req.nextUrl.searchParams.get("facultyId");
  if (!facultyId) return NextResponse.json({ error: "facultyId is required" }, { status: 400 });
  const f = (await scopeFaculty(actor.scope)).some((x) => x.id === facultyId) ? await prisma.user.findUnique({ where: { id: facultyId }, select: { preferredDays: true } }) : null;
  if (!f) return NextResponse.json({ error: "faculty not found" }, { status: 404 });
  return NextResponse.json({ days: (f.preferredDays || "").split(",").filter(Boolean) });
}

export async function PUT(req: NextRequest) {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!actor.canEdit) return NextResponse.json({ error: READ_ONLY(actor) }, { status: 403 });
  const user = actor.user;
  const body = await req.json();
  if (!body.facultyId || !Array.isArray(body.days)) return NextResponse.json({ error: "facultyId and days are required" }, { status: 400 });
  const f = (await scopeFaculty(actor.scope)).some((x) => x.id === body.facultyId) ? await prisma.user.findUnique({ where: { id: body.facultyId } }) : null;
  if (!f) return NextResponse.json({ error: "faculty not found" }, { status: 404 });
  const days = DAYS.filter((d) => body.days.includes(d));
  await prisma.user.update({ where: { id: f.id }, data: { preferredDays: days.length > 0 ? days.join(",") : null } });
  return NextResponse.json({ days });
}
