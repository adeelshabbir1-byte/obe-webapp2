import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const groups = await prisma.courseEquivalenceGroup.findMany({
    where: { chairmanId: user.managedById || "" },
    include: { members: { include: { course: { include: { batch: true } } } } },
  });

  const rows: Record<string, any>[] = [];
  for (const g of groups) {
    const total = g.members.reduce((sum, m) => sum + (m.course.batch?.studentCount || 0), 0);
    const sections = Math.max(1, Math.ceil(total / 50));
    for (const m of g.members) {
      rows.push({
        group: g.name, course: `${m.course.code} — ${m.course.title}`,
        batch: m.course.batch ? `${m.course.batch.degreeProgram} — ${m.course.batch.batchName}` : "",
        students: m.course.batch?.studentCount || 0, combinedTotal: total, sectionsNeeded: sections,
      });
    }
  }

  return buildExcelResponse("course-equivalence.xlsx", [{
    name: "Course Equivalence",
    columns: [
      { header: "Group", key: "group", width: 30 },
      { header: "Course", key: "course", width: 30 },
      { header: "Batch", key: "batch", width: 26 },
      { header: "Students", key: "students", width: 12 },
      { header: "Combined Total", key: "combinedTotal", width: 14 },
      { header: "Sections Needed", key: "sectionsNeeded", width: 16 },
    ],
    rows,
  }]);
}
