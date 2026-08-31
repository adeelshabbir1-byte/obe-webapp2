import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { getAuditReport } from "../../../../../lib/reports";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const programs = await getAuditReport(user.managedById);
  const rows: Record<string, any>[] = [];
  for (const prog of programs) {
    for (const r of prog.rows) {
      rows.push({
        program: prog.coordinatorName, code: r.code, title: r.title, courseType: r.courseType,
        semester: r.semesterNumber ?? "", plosMapped: r.ploCount, totalPlos: r.totalPlos, flag: r.flag,
      });
    }
  }

  return buildExcelResponse("course-accreditation-audit.xlsx", [{
    name: "Course Audit",
    columns: [
      { header: "Program", key: "program", width: 22 },
      { header: "Code", key: "code", width: 14 },
      { header: "Title", key: "title", width: 34 },
      { header: "Type", key: "courseType", width: 18 },
      { header: "Semester", key: "semester", width: 10 },
      { header: "PLOs Mapped", key: "plosMapped", width: 14 },
      { header: "Total PLOs", key: "totalPlos", width: 12 },
      { header: "Flag", key: "flag", width: 12 },
    ],
    rows,
  }]);
}
