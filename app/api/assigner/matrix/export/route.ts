import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true },
    include: { batch: true, sectionAssignments: { include: { instructor: true } } },
  });
  const groups = await prisma.courseEquivalenceGroup.findMany({
    where: { chairmanId: user.managedById || "" },
    include: { members: { include: { course: { include: { batch: true } } } }, sectionAssignments: { include: { instructor: true } } },
  });

  const rows: Record<string, any>[] = [];
  for (const c of courses) {
    if (c.sectionAssignments.length === 0) rows.push({ course: `${c.code} — ${c.title}`, type: c.courseType, batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "", instructor: "", sections: "" });
    for (const a of c.sectionAssignments) {
      rows.push({ course: `${c.code} — ${c.title}`, type: c.courseType, batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "", instructor: a.instructor.name, sections: a.sectionCount });
    }
  }
  for (const g of groups) {
    const batchLabel = g.members.map((m) => m.course.batch ? `${m.course.batch.degreeProgram} — ${m.course.batch.batchName}` : "").join("; ");
    if (g.sectionAssignments.length === 0) rows.push({ course: `${g.name} (combined)`, type: "Combined", batch: batchLabel, instructor: "", sections: "" });
    for (const a of g.sectionAssignments) {
      rows.push({ course: `${g.name} (combined)`, type: "Combined", batch: batchLabel, instructor: a.instructor.name, sections: a.sectionCount });
    }
  }

  return buildExcelResponse("section-assignment-matrix.xlsx", [{
    name: "Section Assignments",
    columns: [
      { header: "Course", key: "course", width: 34 },
      { header: "Type", key: "type", width: 16 },
      { header: "Batch", key: "batch", width: 28 },
      { header: "Instructor", key: "instructor", width: 22 },
      { header: "Sections", key: "sections", width: 10 },
    ],
    rows,
  }]);
}
