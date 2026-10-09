import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { CAL_KINDS, SETTER_ROLES, academicScope } from "../../../lib/academic";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !SETTER_ROLES.includes(user.role)) return NextResponse.json({ error: "Only the Institute Head or a Dean can set the academic calendar" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!CAL_KINDS[b.kind] || !String(b.title || "").trim() || !b.startDate) return NextResponse.json({ error: "Choose a type, give it a title and a start date" }, { status: 400 });
  const start = new Date(b.startDate), end = b.endDate ? new Date(b.endDate) : null;
  if (isNaN(start.getTime()) || (end && (isNaN(end.getTime()) || end < start))) return NextResponse.json({ error: "The end date cannot be before the start date" }, { status: 400 });
  const { chairmanId, facultyId: myFaculty } = await academicScope(user);
  let facultyId: string | null = null;
  if (user.role === "DEAN") {
    if (!myFaculty) return NextResponse.json({ error: "You are not linked to a faculty" }, { status: 400 });
    facultyId = myFaculty;
  } else if (b.facultyId) {
    const f = await prisma.faculty.findFirst({ where: { id: String(b.facultyId), chairmanId } });
    if (!f) return NextResponse.json({ error: "Unknown faculty" }, { status: 400 });
    facultyId = f.id;
  }
  const entry = await prisma.academicCalendarEntry.create({ data: {
    chairmanId, facultyId, kind: b.kind, title: String(b.title).trim(), startDate: start, endDate: end,
    termName: b.termName || null, termYear: b.termYear ? Number(b.termYear) : null, createdById: user.id,
  } });
  await writeAuditLog({ actorUserId: user.id, action: "ACADEMIC_CALENDAR_ADDED", entityType: "AcademicCalendarEntry", entityId: entry.id });
  return NextResponse.json({ entry }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !SETTER_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const { chairmanId, facultyId } = await academicScope(user);
  const e = await prisma.academicCalendarEntry.findFirst({ where: { id, chairmanId } });
  if (!e) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (user.role === "DEAN" && e.facultyId !== facultyId) return NextResponse.json({ error: "A Dean can only change their own faculty's dates" }, { status: 403 });
  await prisma.academicCalendarEntry.delete({ where: { id } });
  await writeAuditLog({ actorUserId: user.id, action: "ACADEMIC_CALENDAR_REMOVED", entityType: "AcademicCalendarEntry", entityId: id });
  return NextResponse.json({ ok: true });
}
