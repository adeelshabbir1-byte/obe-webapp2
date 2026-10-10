import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { TRACKS } from "../../../../../lib/tracks";

export async function DELETE(req: Request, { params }: { params: { studentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const student = await prisma.student.findUnique({ where: { id: params.studentId }, include: { batch: true } });
  if (!student || student.batch.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Everything that points at the student goes in one step, so a failure cannot leave a half-deleted student.
  const sid = params.studentId;
  await prisma.$transaction([
    prisma.studentMark.deleteMany({ where: { studentId: sid } }),
    prisma.studentEnrollment.deleteMany({ where: { studentId: sid } }),
    prisma.attendanceRecord.deleteMany({ where: { studentId: sid } }),
    prisma.studentSession.deleteMany({ where: { studentId: sid } }),
    prisma.studentTranscriptRecord.deleteMany({ where: { studentId: sid } }),
    prisma.degreePlanEntry.deleteMany({ where: { studentId: sid } }),
    prisma.electiveChoice.deleteMany({ where: { studentId: sid } }),
    prisma.outOfBatchRequest.deleteMany({ where: { studentId: sid } }),
    prisma.registrationApprovalRequest.deleteMany({ where: { studentId: sid } }),
    prisma.student.delete({ where: { id: sid } }),
  ]);

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
