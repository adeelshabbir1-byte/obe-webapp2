import { NextRequest, NextResponse } from "next/server";
import { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, ImageRun } from "docx";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor } from "../../../../lib/reportScope";
import { prisma } from "../../../../lib/db";
import { computeTopicVariance } from "../../../../lib/varianceReport";
import { buildDocxResponse, logoImageOptions } from "../../../../lib/docxExport";

const PAGE_WIDTH_DXA = 12240;
const MARGIN_DXA = 1440;
const CONTENT_WIDTH = PAGE_WIDTH_DXA - MARGIN_DXA * 2;
const LABEL_COL = Math.round(CONTENT_WIDTH * 0.32);
const VALUE_COL = CONTENT_WIDTH - LABEL_COL;

function labelValueRow(label: string, value: string) {
  return new TableRow({
    children: [
      new TableCell({ width: { size: LABEL_COL, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: "F4EFE1" }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 })] })] }),
      new TableCell({ width: { size: VALUE_COL, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: value || "—", size: 20 })] })] }),
    ],
  });
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !canViewReports(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const coordinatorIds = await coordinatorIdsFor(user);
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { batch: true, instructor: true, subjectExpert: true, coordinator: true } });
  if (!course || !coordinatorIds.includes(course.coordinatorId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const variance = await computeTopicVariance(courseId);
  const totalPlos = await prisma.pLO.count({ where: { batchId: course.batchId || "" } });
  const mappedPlos = await prisma.coursePloMapping.count({ where: { courseId: course.id } });
  const w = {
    assignmentPct: course.instructorAssignmentPct ?? course.assignmentPct,
    quizPct: course.instructorQuizPct ?? course.quizPct,
    projectPct: course.instructorProjectPct ?? course.projectPct,
    labPct: course.instructorLabPct ?? course.labPct,
    midtermPct: course.instructorMidtermPct ?? course.midtermPct,
    finalPct: course.instructorFinalPct ?? course.finalPct,
  };

  const platform = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
  const chairman = course.coordinator.managedById ? await prisma.user.findUnique({ where: { id: course.coordinator.managedById } }) : null;
  const nceacImg = logoImageOptions(platform?.nceacLogo, 60);
  const instituteImg = logoImageOptions(chairman?.instituteLogo, 60);
  const logoRuns = [nceacImg, instituteImg].filter((x): x is NonNullable<typeof x> => !!x).map((opts) => new ImageRun(opts as any));

  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: PAGE_WIDTH_DXA, height: 15840 }, margin: { top: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA, right: MARGIN_DXA } } },
      children: [
        ...(logoRuns.length > 0 ? [new Paragraph({ children: logoRuns })] : []),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Course Monitoring Process Form", bold: true })] }),
        new Paragraph({ children: [new TextRun({ text: chairman?.instituteName || "National Computing Education Accreditation Council", italics: true, size: 18 })] }),
        new Paragraph({ text: "" }),
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [LABEL_COL, VALUE_COL],
          rows: [
            labelValueRow("Course", `${course.code} — ${course.title}`),
            labelValueRow("Batch", course.batch ? `${course.batch.degreeProgram} — ${course.batch.batchName}` : "—"),
            labelValueRow("Subject Expert", course.subjectExpert?.name || "—"),
            labelValueRow("Instructor", course.instructor?.name || "—"),
            labelValueRow("PLOs Assigned to this Course", `${mappedPlos} of ${totalPlos} program PLOs`),
            labelValueRow("Assessment Weightage", `Assignment ${w.assignmentPct}%, Quiz ${w.quizPct}%, Project ${w.projectPct}%, Lab ${w.labPct}%, Midterm ${w.midtermPct}%, Final ${w.finalPct}%`),
            labelValueRow("Plan Adherence", `${variance.adherencePct}% of planned weight delivered${variance.missed.length > 0 ? ` — ${variance.missed.length} topic(s) not covered: ${variance.missed.map((m) => m.topic).join(", ")}` : " — all planned topics covered"}`),
          ],
        }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: "Instructor Signature: _______________________________          Date: _______________", size: 20 })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: "Program Coordinator Signature: _______________________________          Date: _______________", size: 20 })] }),
      ],
    }],
  });

  const filename = `Course_Monitoring_${course.code}.docx`;
  return buildDocxResponse(filename, doc);
}
