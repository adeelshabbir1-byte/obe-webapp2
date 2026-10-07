import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Preferred teaching days are a PREFERENCE, not a rule: the timetable generator tries to keep this
// instructor's classes on these days but will move one if that's the only way to avoid a clash.
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const facultyId = req.nextUrl.searchParams.get("facultyId");
  if (!facultyId) return NextResponse.json({ error: "facultyId is required" }, { status: 400 });
  const f = await prisma.user.findFirst({ where: { id: facultyId, managedById: user.id }, select: { preferredDays: true } });
  if (!f) return NextResponse.json({ error: "faculty not found" }, { status: 404 });
  return NextResponse.json({ days: (f.preferredDays || "").split(",").filter(Boolean) });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.facultyId || !Array.isArray(body.days)) return NextResponse.json({ error: "facultyId and days are required" }, { status: 400 });
  const f = await prisma.user.findFirst({ where: { id: body.facultyId, managedById: user.id } });
  if (!f) return NextResponse.json({ error: "faculty not found" }, { status: 404 });
  const days = DAYS.filter((d) => body.days.includes(d));
  await prisma.user.update({ where: { id: f.id }, data: { preferredDays: days.length > 0 ? days.join(",") : null } });
  return NextResponse.json({ days });
}
