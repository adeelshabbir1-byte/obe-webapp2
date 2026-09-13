import { Document, Paragraph, TextRun, Table, TableRow, AlignmentType, WidthType } from "docx";
import { prisma } from "./db";
import { computeCloPloPassRates } from "./resultMate";
import { getPassingCriteria } from "./passingCriteria";
import { chairmanIdFor } from "./reportScope";
import { cell, headerRow, CONTENT_WIDTH } from "./docxTableHelpers";

export async function generateCourseEvaluationForm(courseId: string, viewer: { id: string; role: string; managedById: string | null }) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { batch: true, instructor: true } });
  if (!course) throw new Error("course not found");

  const criteria = await getPassingCriteria(await chairmanIdFor(viewer));
  const result = await computeCloPloPassRates(courseId, criteria);

  const [clos, enrollmentCount] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId, source: "INSTRUCTOR" }, include: { mappedPlo: true, lectureRows: true }, orderBy: { orderIndex: "asc" } }),
    prisma.studentEnrollment.count({ where: { courseId } }),
  ]);

  // ---- Header info table ----
  const headerWidths = [2600, 3400, 2800, 2800];
  const headerTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: headerWidths,
    rows: [
      new TableRow({ children: [cell("Degree(s) Title", { bold: true, width: headerWidths[0] }), cell(course.batch?.degreeProgram || "—", { width: headerWidths[1] }), cell("Semester", { bold: true, width: headerWidths[2] }), cell(`${course.offeredTermName || "—"} ${course.offeredTermYear || ""}`, { width: headerWidths[3] })] }),
      new TableRow({ children: [cell("Course Name", { bold: true, width: headerWidths[0] }), cell(course.title, { width: headerWidths[1] }), cell("No. of Students Registered", { bold: true, width: headerWidths[2] }), cell(String(enrollmentCount), { width: headerWidths[3] })] }),
      new TableRow({ children: [cell("Course Code", { bold: true, width: headerWidths[0] }), cell(course.code, { width: headerWidths[1] }), cell("No. of Students Achieved CLOs", { bold: true, width: headerWidths[2] }), cell(clos.map((c) => { const s = result.cloStats.find((x) => x.code === c.code); return s ? `${c.code}: ${s.passCount}` : ""; }).filter(Boolean).join(", "), { width: headerWidths[3], size: 16 })] }),
      new TableRow({ children: [cell("Instructor's Name", { bold: true, width: headerWidths[0] }), cell(course.instructor?.name || "—", { width: headerWidths[1] }), cell("No. of Students Achieved PLOs", { bold: true, width: headerWidths[2] }), cell(result.ploStats.map((s) => `${s.label}: ${s.passCount}`).join(", "), { width: headerWidths[3], size: 16 })] }),
      new TableRow({ children: [cell("Credit Hours", { bold: true, width: headerWidths[0] }), cell(String(course.creditHours), { width: headerWidths[1] }), cell("", { width: headerWidths[2] }), cell("", { width: headerWidths[3] })] }),
    ],
  });

  // ---- CLO table ----
  const cloWidths = [900, 3600, 1300, 1300, 900, 1100, 1200, 1100];
  const cloTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cloWidths,
    rows: [
      headerRow(["CLO #", "Course Learning Outcome", "Learning Level", "Mapped PLO", "Lec", "Marks", "Pass Rate", "Below"], cloWidths),
      ...clos.map((c) => {
        const stats = result.cloStats.find((s) => s.code === c.code);
        const passCount = stats?.passCount ?? 0, failCount = stats?.failCount ?? 0;
        const total = passCount + failCount;
        const passRate = total > 0 ? `${Math.round((passCount / total) * 100)}%` : "—";
        const belowRate = total > 0 ? `${Math.round((failCount / total) * 100)}%` : "—";
        return new TableRow({
          children: [
            cell(c.code, { width: cloWidths[0] }),
            cell(c.statement, { width: cloWidths[1], size: 16 }),
            cell(c.bloomLevel, { width: cloWidths[2] }),
            cell(c.mappedPlo ? `PLO-${c.mappedPlo.number}` : "—", { width: cloWidths[3] }),
            cell(String(c.lectureRows.length), { width: cloWidths[4] }),
            cell(String(stats?.maxWeight ?? 0), { width: cloWidths[5] }),
            cell(passRate, { width: cloWidths[6] }),
            cell(belowRate, { width: cloWidths[7] }),
          ],
        });
      }),
    ],
  });

  // ---- PLO table ----
  const ploWidths = [1300, 5800, 1300, 1300, 1300, 1300];
  const ploTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: ploWidths,
    rows: [
      headerRow(["PLO #", "Program Learning Outcome", "Marks", "Pass Rate", "Below", ""], ploWidths),
      ...result.ploStats.map((s) => {
        const total = s.passCount + s.failCount;
        const passRate = total > 0 ? `${Math.round((s.passCount / total) * 100)}%` : "—";
        const belowRate = total > 0 ? `${Math.round((s.failCount / total) * 100)}%` : "—";
        return new TableRow({
          children: [
            cell(s.label, { width: ploWidths[0] }),
            cell("", { width: ploWidths[1] }),
            cell(String(s.maxWeight), { width: ploWidths[2] }),
            cell(passRate, { width: ploWidths[3] }),
            cell(belowRate, { width: ploWidths[4] }),
            cell("", { width: ploWidths[5] }),
          ],
        });
      }),
    ],
  });

  const observationLines = (course.instructorObservations || "No observations recorded.")
    .split("\n").filter((l) => l.trim().length > 0);

  return new Document({
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: [
        new Paragraph({ children: [new TextRun({ text: "Course Evaluation Form", bold: true, size: 32 })], alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "" }),
        headerTable,
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: "Course Learning Outcomes", bold: true, size: 24 })] }),
        new Paragraph({ text: "" }),
        cloTable,
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: "Program Learning Outcomes", bold: true, size: 24 })] }),
        new Paragraph({ text: "" }),
        ploTable,
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: "Instructor's Observations (Be Specific and Brief)", bold: true, size: 24 })] }),
        new Paragraph({ text: "" }),
        ...observationLines.map((line, i) => new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${line}`, size: 20 })] })),
      ],
    }],
  });
}
