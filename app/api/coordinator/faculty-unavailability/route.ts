import { NextRequest, NextResponse } from "next/server";
import { timetableActor, READ_ONLY, scopeFaculty } from "../../../../lib/timetableAccess";
import { prisma } from "../../../../lib/db";
import { withErrors } from "../../../../lib/apiHandler";

async function GET_handler(req: NextRequest) {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = actor.user;

  const facultyId = req.nextUrl.searchParams.get("facultyId");
  const faculty = await scopeFaculty(actor.scope);
  const facultyIds = faculty.map((f) => f.id);

  const records = await prisma.facultyUnavailability.findMany({
    where: facultyId ? { facultyId: facultyIds.includes(facultyId) ? facultyId : "none" } : { facultyId: { in: facultyIds } },
    orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }],
  });
  return NextResponse.json({ records, faculty: faculty.map((f) => ({ id: f.id, name: f.name })) });
}

async function POST_handler(req: NextRequest) {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!actor.canEdit) return NextResponse.json({ error: READ_ONLY(actor) }, { status: 403 });
  const user = actor.user;

  const body = await req.json();
  if (!body.facultyId || !body.dayOfWeek || body.startHour === undefined || body.endHour === undefined) {
    return NextResponse.json({ error: "facultyId, dayOfWeek, startHour, and endHour are required" }, { status: 400 });
  }
  const faculty = (await scopeFaculty(actor.scope)).find((f) => f.id === body.facultyId);
  if (!faculty) return NextResponse.json({ error: "faculty not found" }, { status: 404 });

  const record = await prisma.facultyUnavailability.create({
    data: { facultyId: body.facultyId, dayOfWeek: body.dayOfWeek, startHour: parseFloat(body.startHour), endHour: parseFloat(body.endHour), setById: user.id, note: body.note || null },
  });
  return NextResponse.json({ record }, { status: 201 });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
