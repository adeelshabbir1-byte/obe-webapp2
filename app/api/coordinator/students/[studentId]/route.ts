import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

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
