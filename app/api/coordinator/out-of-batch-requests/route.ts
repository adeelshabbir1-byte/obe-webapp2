import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const requests = await prisma.outOfBatchRequest.findMany({
    where: { course: { coordinatorId: user.id } },
    include: { student: { include: { batch: true } }, course: { include: { batch: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id, status: r.status, reason: r.reason, reviewNote: r.reviewNote, createdAt: r.createdAt.toISOString(),
      studentName: r.student.name, studentRollNumber: r.student.rollNumber, studentBatchLabel: `${r.student.batch.degreeProgram} — ${r.student.batch.batchName}`,
      courseCode: r.course.code, courseTitle: r.course.title, courseBatchLabel: r.course.batch ? `${r.course.batch.degreeProgram} — ${r.course.batch.batchName}` : "—",
    })),
  });
}
