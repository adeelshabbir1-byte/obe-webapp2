import { NextRequest, NextResponse } from "next/server";
import { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle } from "docx";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor } from "../../../../lib/reportScope";
import { prisma } from "../../../../lib/db";
import { buildDocxResponse } from "../../../../lib/docxExport";

const PAGE_WIDTH_DXA = 12240; // US Letter
const MARGIN_DXA = 1440; // 1 inch
const CONTENT_WIDTH = PAGE_WIDTH_DXA - MARGIN_DXA * 2;
const LABEL_COL = Math.round(CONTENT_WIDTH * 0.28);
const VALUE_COL = CONTENT_WIDTH - LABEL_COL;

function labelValueRow(label: string, value: string) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: LABEL_COL, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: "F4EFE1" },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 })] })],
      }),
      new TableCell({
        width: { size: VALUE_COL, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: value || "—", size: 20 })] })],
      }),
    ],
  });
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !canViewReports(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const coordinatorIds = await coordinatorIdsFor(user);
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { batch: true, subjectExpert: true, clos: { where: { source: "SE" }, orderBy: { code: "asc" } }, lectureRows: { where: { source: "SE" }, orderBy: { lectureNumber: "asc" } } },
  });
  if (!course || !coordinatorIds.includes(course.coordinatorId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const byWeek = new Map<number, string[]>();
  for (const r of course.lectureRows) byWeek.set(r.week, [...(byWeek.get(r.week) || []), r.topic]);

  const w = {
    assignmentPct: course.instructorAssignmentPct ?? course.assignmentPct,
    quizPct: course.instructorQuizPct ?? course.quizPct,
    projectPct: course.instructorProjectPct ?? course.projectPct,
    labPct: course.instructorLabPct ?? course.labPct,
    midtermPct: course.instructorMidtermPct ?? course.midtermPct,
    finalPct: course.instructorFinalPct ?? course.finalPct,
  };

  const weeklyRows = [
    new TableRow({ children: ["Week", "Topics", "Lectures"].map((h) =>
      new TableCell({ shading: { type: ShadingType.CLEAR, fill: "F4EFE1" }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })] })
    ) }),
    ...Array.from(byWeek.entries()).map(([week, topics]) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(week), size: 18 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: topics.join("; "), size: 18 })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(topics.length), size: 18 })] })] }),
      ],
    })),
  ];

  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: PAGE_WIDTH_DXA, height: 15840 }, margin: { top: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA, right: MARGIN_DXA } } },
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Course Description Form", bold: true })] }),
        new Paragraph({ children: [new TextRun({ text: "National Computing Education Accreditation Council", italics: true, size: 18 })] }),
        new Paragraph({ text: "" }),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [LABEL_COL, VALUE_COL],
          rows: [
            labelValueRow("Degree Program", course.batch?.degreeProgram || "—"),
            labelValueRow("Course Code", course.code),
            labelValueRow("Course Title", course.title),
            labelValueRow("Credit Hours", String(course.creditHours)),
            labelValueRow("Assessment Weights", `Assignment ${w.assignmentPct}%, Quiz ${w.quizPct}%, Project ${w.projectPct}%, Lab ${w.labPct}%, Midterm ${w.midtermPct}%, Final ${w.finalPct}%`),
            labelValueRow("Course Instructor", course.subjectExpert?.name || "—"),
            labelValueRow("Lab Instructor", course.labInstructorName || "N/A"),
            labelValueRow("Catalog Description", course.catalogDescription || "Not filled in yet."),
            labelValueRow("Textbook", course.textbook || "Not filled in yet."),
            labelValueRow("Reference Material", course.referenceMaterial || "Not filled in yet."),
            labelValueRow("Programming Assignments", course.programmingAssignmentsNote || "Not filled in yet."),
          ],
        }),
        new Paragraph({ text: "" }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Course Learning Outcomes", bold: true })] }),
        ...course.clos.map((c, i) => new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${c.statement}`, size: 20 })] })),
        new Paragraph({ text: "" }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Topics Covered, by Week", bold: true })] }),
        new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: [Math.round(CONTENT_WIDTH * 0.1), Math.round(CONTENT_WIDTH * 0.75), Math.round(CONTENT_WIDTH * 0.15)], rows: weeklyRows }),
      ],
    }],
  });

  const filename = `Course_Description_${course.code}.docx`;
  return buildDocxResponse(filename, doc);
}
