import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const facultyId = req.nextUrl.searchParams.get("facultyId");
  const faculty = await prisma.user.findMany({ where: { managedById: user.id, role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR"] } } });
  const facultyIds = faculty.map((f) => f.id);

  const records = await prisma.facultyUnavailability.findMany({
    where: facultyId ? { facultyId, faculty: { managedById: user.id } } : { facultyId: { in: facultyIds } },
    orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }],
  });
  return NextResponse.json({ records, faculty: faculty.map((f) => ({ id: f.id, name: f.name })) });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.facultyId || !body.dayOfWeek || body.startHour === undefined || body.endHour === undefined) {
    return NextResponse.json({ error: "facultyId, dayOfWeek, startHour, and endHour are required" }, { status: 400 });
  }
  const faculty = await prisma.user.findUnique({ where: { id: body.facultyId } });
  if (!faculty || faculty.managedById !== user.id) return NextResponse.json({ error: "faculty not found" }, { status: 404 });

  const record = await prisma.facultyUnavailability.create({
    data: { facultyId: body.facultyId, dayOfWeek: body.dayOfWeek, startHour: parseFloat(body.startHour), endHour: parseFloat(body.endHour), setById: user.id, note: body.note || null },
  });
  return NextResponse.json({ record }, { status: 201 });
}
