import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { getTeacherLoadReport } from "../../../../../lib/loadReport";
import { buildExcelResponse } from "../../../../../lib/excelExport";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const selectedTerms = Array.isArray(body.terms) ? body.terms : [];
  if (selectedTerms.length === 0) return NextResponse.json({ error: "select at least one term" }, { status: 400 });

  const { rows, termLabels } = await getTeacherLoadReport(user.id, selectedTerms);

  const summaryRows = rows.map((r) => ({
    name: r.name, role: r.role === "SUBJECT_EXPERT" ? "SE" : "Instructor",
    ...Object.fromEntries(termLabels.map((label) => [`term_${label}`, r.byTerm[label] ?? 0])),
    assigned: r.assigned, external: r.externalLoadCount, externalNote: r.externalLoadNote || "",
    total: r.total, normalLoad: r.normalLoad, status: r.over ? "OVER" : "OK",
  }));

  const detailRows: Record<string, any>[] = [];
  for (const r of rows) {
    for (const d of r.details) {
      detailRows.push({ faculty: r.name, course: d.label, term: d.term, sections: d.sections });
    }
  }

  return buildExcelResponse("teacher-load-report.xlsx", [
    {
      name: "Load Summary",
      columns: [
        { header: "Faculty", key: "name", width: 24 },
        { header: "Role", key: "role", width: 12 },
        ...termLabels.map((label) => ({ header: label, key: `term_${label}`, width: 14 })),
        { header: "Assigned Sections", key: "assigned", width: 16 },
        { header: "External Load", key: "external", width: 14 },
        { header: "External Note", key: "externalNote", width: 26 },
        { header: "Total", key: "total", width: 10 },
        { header: "Normal Load", key: "normalLoad", width: 12 },
        { header: "Status", key: "status", width: 10 },
      ],
      rows: summaryRows,
    },
    {
      name: "Assignment Detail",
      columns: [
        { header: "Faculty", key: "faculty", width: 24 },
        { header: "Course", key: "course", width: 34 },
        { header: "Term", key: "term", width: 16 },
        { header: "Sections", key: "sections", width: 10 },
      ],
      rows: detailRows,
    },
  ]);
}
