import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { buildExcelResponse } from "../../../../../lib/excelExport";

const COURSE_TYPES = ["Core", "Elective", "Lab", "IDS", "General Education", "Capstone Project", "Field Experience"];

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existing = await prisma.weightPolicy.findMany({ where: { chairmanId: user.managedById || "" } });
  const byType = new Map(existing.map((p) => [p.courseType, p]));

  const rows = COURSE_TYPES.map((t) => {
    const p = byType.get(t);
    return {
      courseType: t,
      assignment: p ? `${p.assignmentMin}-${p.assignmentMax}% (${p.assignmentMinCount}+)` : "0-100%",
      quiz: p ? `${p.quizMin}-${p.quizMax}% (${p.quizMinCount}+)` : "0-100%",
      project: p ? `${p.projectMin}-${p.projectMax}%` : "0-100%",
      lab: p ? `${p.labMin}-${p.labMax}%` : "0-100%",
      midterm: p ? `${p.midtermMin}-${p.midtermMax}%` : "0-100%",
      final: p ? `${p.finalMin}-${p.finalMax}%` : "0-100%",
    };
  });

  return buildExcelResponse("weight-policy.xlsx", [{
    name: "Weight Policy",
    columns: [
      { header: "Course Type", key: "courseType", width: 20 },
      { header: "Assignment", key: "assignment", width: 20 },
      { header: "Quiz", key: "quiz", width: 20 },
      { header: "Project", key: "project", width: 14 },
      { header: "Lab", key: "lab", width: 14 },
      { header: "Midterm", key: "midterm", width: 14 },
      { header: "Final", key: "final", width: 14 },
    ],
    rows,
  }]);
}
