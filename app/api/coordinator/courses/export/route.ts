import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const courses = await prisma.course.findMany({
    where: { coordinatorId: user.id },
    include: { batch: true, subjectExpert: true, instructor: true },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
  });

  return buildExcelResponse("courses.xlsx", [{
    name: "Courses",
    columns: [
      { header: "Batch", key: "batch", width: 26 },
      { header: "Code", key: "code", width: 14 },
      { header: "Title", key: "title", width: 32 },
      { header: "Credits", key: "creditHours", width: 10 },
      { header: "Type", key: "courseType", width: 18 },
      { header: "Semester", key: "semesterNumber", width: 10 },
      { header: "Offered", key: "isOffered", width: 10 },
      { header: "Offered Term", key: "offeredTerm", width: 14 },
      { header: "Source", key: "source", width: 12 },
      { header: "Subject Expert", key: "subjectExpert", width: 22 },
      { header: "Instructor", key: "instructor", width: 22 },
    ],
    rows: courses.map((c) => ({
      batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "",
      code: c.code, title: c.title, creditHours: c.creditHours, courseType: c.courseType,
      semesterNumber: c.semesterNumber ?? "", isOffered: c.isOffered ? "Yes" : "No",
      offeredTerm: c.offeredTermName ? `${c.offeredTermName} ${c.offeredTermYear}` : "",
      source: c.masterCourseId ? "Imported" : "Manual",
      subjectExpert: c.subjectExpert?.name || "", instructor: c.instructor?.name || "",
    })),
  }]);
}
