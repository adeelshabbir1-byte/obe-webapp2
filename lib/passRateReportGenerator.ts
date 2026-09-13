import { Document, Paragraph, TextRun, Table, TableRow, AlignmentType, WidthType } from "docx";
import { prisma } from "./db";
import { computeCloPloPassRates } from "./resultMate";
import { getPassingCriteria } from "./passingCriteria";
import { chairmanIdFor } from "./reportScope";
import { cell, headerRow, CONTENT_WIDTH } from "./docxTableHelpers";

export async function generatePassRateReport(courseId: string, viewer: { id: string; role: string; managedById: string | null }) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new Error("course not found");

  const criteria = await getPassingCriteria(await chairmanIdFor(viewer));
  const result = await computeCloPloPassRates(courseId, criteria);

  const cloWidths = [1400, 2200, 2200, 2200, CONTENT_WIDTH - 1400 - 2200 * 3];
  const cloTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cloWidths,
    rows: [
      headerRow(["CLO", "Max Weight", "Passed", "Failed", "Pass Rate"], cloWidths),
      ...result.cloStats.map((s) => new TableRow({
        children: [
          cell(s.code, { width: cloWidths[0] }),
          cell(String(s.maxWeight), { width: cloWidths[1] }),
          cell(String(s.passCount), { width: cloWidths[2] }),
          cell(String(s.failCount), { width: cloWidths[3] }),
          cell(`${Math.round((s.passCount / (s.passCount + s.failCount || 1)) * 100)}%`, { width: cloWidths[4] }),
        ],
      })),
    ],
  });

  const ploWidths = [1400, 2200, 2200, 2200, CONTENT_WIDTH - 1400 - 2200 * 3];
  const ploTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: ploWidths,
    rows: [
      headerRow(["PLO", "Max Weight", "Passed", "Failed", "Pass Rate"], ploWidths),
      ...result.ploStats.map((s) => new TableRow({
        children: [
          cell(s.label, { width: ploWidths[0] }),
          cell(String(s.maxWeight), { width: ploWidths[1] }),
          cell(String(s.passCount), { width: ploWidths[2] }),
          cell(String(s.failCount), { width: ploWidths[3] }),
          cell(`${Math.round((s.passCount / (s.passCount + s.failCount || 1)) * 100)}%`, { width: ploWidths[4] }),
        ],
      })),
    ],
  });

  return new Document({
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: [
        new Paragraph({ children: [new TextRun({ text: "CLO / PLO Pass Rate Report", bold: true, size: 32 })], alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: `${course.code} — ${course.title}`, bold: true, size: 28 })] }),
        new Paragraph({ children: [new TextRun({ text: `Passing threshold: ${criteria.cloPct}% (CLO), ${criteria.ploPct}% (PLO)`, size: 20, color: "555555" })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: "Course Learning Outcomes", bold: true, size: 24 })] }),
        new Paragraph({ text: "" }),
        cloTable,
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: "Program Learning Outcomes", bold: true, size: 24 })] }),
        new Paragraph({ text: "" }),
        ploTable,
      ],
    }],
  });
}
