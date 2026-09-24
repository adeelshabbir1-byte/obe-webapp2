import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { getElectiveInstructorReport } from "../../../../../lib/electiveInstructorReport";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const selectedTerms = Array.isArray(body.terms) ? body.terms : [];
  if (selectedTerms.length === 0) return NextResponse.json({ error: "select at least one term" }, { status: 400 });

  const rows = await getElectiveInstructorReport(user.id, selectedTerms);
  const exportRows = rows.map((r) => ({
    degreeProgram: r.degreeProgram, batchName: r.batchName, code: r.code, title: r.title, term: r.term,
    instructors: r.instructorNames.length > 0 ? r.instructorNames.join(", ") : "— unassigned —",
  }));

  return buildExcelResponse("elective-instructor-report.xlsx", [
    {
      name: "Elective Instructors",
      columns: [
        { header: "Degree Program", key: "degreeProgram", width: 24 },
        { header: "Batch", key: "batchName", width: 20 },
        { header: "Code", key: "code", width: 12 },
        { header: "Course", key: "title", width: 34 },
        { header: "Term", key: "term", width: 16 },
        { header: "Instructor(s)", key: "instructors", width: 30 },
      ],
      rows: exportRows,
    },
  ]);
}
