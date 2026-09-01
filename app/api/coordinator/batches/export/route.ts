import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batches = await prisma.batch.findMany({
    where: { coordinatorId: user.id },
    include: { _count: { select: { courses: true } } },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
  });

  return buildExcelResponse("batches.xlsx", [{
    name: "Batches",
    columns: [
      { header: "Degree Program", key: "degreeProgram", width: 24 },
      { header: "Batch", key: "batchName", width: 18 },
      { header: "Semester 1 Starts", key: "start", width: 16 },
      { header: "Students", key: "studentCount", width: 12 },
      { header: "Courses Imported", key: "courseCount", width: 16 },
    ],
    rows: batches.map((b) => ({
      degreeProgram: b.degreeProgram, batchName: b.batchName, start: `${b.startTerm} ${b.startYear}`,
      studentCount: b.studentCount, courseCount: b._count.courses,
    })),
  }]);
}
