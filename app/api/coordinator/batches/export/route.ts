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

  const crRows = await prisma.course.groupBy({ by: ["batchId", "semesterNumber"], where: { batchId: { in: batches.map((b) => b.id) }, isNonCredit: false }, _sum: { creditHours: true } });
  const cr = (batchId: string, sem?: number) => crRows.filter((r) => r.batchId === batchId && (sem === undefined || r.semesterNumber === sem)).reduce((n, r) => n + (r._sum.creditHours || 0), 0);
  const maxSem = Math.max(8, ...crRows.map((r) => r.semesterNumber || 0));
  const sems = Array.from({ length: maxSem }, (_, i) => i + 1);

  return buildExcelResponse("batches.xlsx", [{
    name: "Batches",
    columns: [
      { header: "Degree Program", key: "degreeProgram", width: 24 },
      { header: "Batch", key: "batchName", width: 18 },
      { header: "Semester 1 Starts", key: "start", width: 16 },
      { header: "Students", key: "studentCount", width: 12 },
      { header: "Courses Imported", key: "courseCount", width: 16 },
      { header: "Credit Hours", key: "credits", width: 12 },
      ...sems.map((n) => ({ header: `Sem ${n} CH`, key: `s${n}`, width: 9 })),
    ],
    rows: batches.map((b) => ({
      degreeProgram: b.degreeProgram, batchName: b.batchName, start: `${b.startTerm} ${b.startYear}`,
      studentCount: b.studentCount, courseCount: b._count.courses, credits: cr(b.id),
      ...Object.fromEntries(sems.map((n) => [`s${n}`, cr(b.id, n) || ""])),
    })),
  }]);
}
