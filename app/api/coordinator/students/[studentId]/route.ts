import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { TRACKS } from "../../../../../lib/tracks";

export async function DELETE(req: Request, { params }: { params: { studentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const student = await prisma.student.findUnique({ where: { id: params.studentId }, include: { batch: true } });
  if (!student || student.batch.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.studentMark.deleteMany({ where: { studentId: params.studentId } });
  await prisma.studentEnrollment.deleteMany({ where: { studentId: params.studentId } });
  await prisma.student.delete({ where: { id: params.studentId } });

  return NextResponse.json({ ok: true });
}

// Change which track (e.g. Non-Medical / Pre-Medical) a student follows.
export async function PATCH(req: Request, { params }: { params: { studentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const student = await prisma.student.findUnique({ where: { id: params.studentId }, include: { batch: true } });
  if (!student || student.batch.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json();
  if (!(TRACKS as readonly string[]).includes(body?.track)) return NextResponse.json({ error: "unknown track" }, { status: 400 });
  await prisma.student.update({ where: { id: params.studentId }, data: { track: body.track } });
  return NextResponse.json({ ok: true });
}
