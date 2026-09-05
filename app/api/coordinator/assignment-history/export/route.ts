import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const termName = req.nextUrl.searchParams.get("termName");
  const termYear = parseInt(req.nextUrl.searchParams.get("termYear") || "", 10);
  if (!termName || isNaN(termYear)) return NextResponse.json({ error: "termName and termYear are required" }, { status: 400 });

  const isCurrent = req.nextUrl.searchParams.get("current") === "1";

  let rows: { courseLabel: string; courseType: string; batchLabel: string; instructorName: string; sectionCount: number }[] = [];

  if (isCurrent) {
    const courses = await prisma.course.findMany({
      where: { coordinatorId: user.id, isOffered: true, offeredTermName: termName, offeredTermYear: termYear },
      include: { batch: true, instructor: true, sectionAssignments: { include: { instructor: true } } },
    });
    for (const c of courses) {
      const label = `${c.code} — ${c.title}`;
      const batchLabel = c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—";
      if (c.sectionAssignments.length > 0) {
        for (const a of c.sectionAssignments) rows.push({ courseLabel: label, courseType: c.courseType, batchLabel, instructorName: a.instructor.name, sectionCount: a.sectionCount });
      } else if (c.instructor) {
        rows.push({ courseLabel: label, courseType: c.courseType, batchLabel, instructorName: c.instructor.name, sectionCount: 1 });
      }
    }
  } else {
    const snapshots = await prisma.assignmentSnapshot.findMany({ where: { coordinatorId: user.id, termName, termYear } });
    rows = snapshots.map((s) => ({ courseLabel: s.courseLabel, courseType: s.courseType, batchLabel: s.batchLabel, instructorName: s.instructorName, sectionCount: s.sectionCount }));
  }

  return buildExcelResponse(`assignments-${termName}-${termYear}.xlsx`, [
    {
      name: "Assignments",
      columns: [
        { header: "Course", key: "courseLabel", width: 34 },
        { header: "Type", key: "courseType", width: 16 },
        { header: "Batch", key: "batchLabel", width: 28 },
        { header: "Instructor", key: "instructorName", width: 24 },
        { header: "Sections", key: "sectionCount", width: 10 },
      ],
      rows,
    },
  ]);
}
