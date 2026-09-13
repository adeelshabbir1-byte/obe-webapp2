import { Document, Paragraph, TextRun, Table, TableRow, AlignmentType, WidthType } from "docx";
import { prisma } from "./db";
import { cell, headerRow, CONTENT_WIDTH } from "./docxTableHelpers";

function courseHeader(course: { code: string; title: string; creditHours: number }, personName?: string) {
  return [
    new Paragraph({ children: [new TextRun({ text: `${course.code} — ${course.title}`, bold: true, size: 28 })] }),
    new Paragraph({ children: [new TextRun({ text: `${course.creditHours} Credit Hours${personName ? ` · ${personName}` : ""}`, size: 20, color: "555555" })] }),
    new Paragraph({ text: "" }),
  ];
}

/** Course Log — the Instructor's actual delivery record: which lecture
 * happened on which real date, and any reschedule note. */
export async function generateCourseLog(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { instructor: true } });
  if (!course) throw new Error("course not found");

  const rows = await prisma.lectureRow.findMany({ where: { courseId, source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" } });

  const widths = [900, 900, 1600, CONTENT_WIDTH - 900 * 2 - 1600 - 2200, 2200];
  const table = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      headerRow(["Week", "Lec. No.", "Actual Date", "Topic", "Notes"], widths),
      ...rows.map((r) => new TableRow({
        children: [
          cell(String(r.week), { width: widths[0] }),
          cell(String(r.lectureNumber), { width: widths[1] }),
          cell(r.actualDate ? r.actualDate.toISOString().slice(0, 10) : "Not yet delivered", { width: widths[2] }),
          cell(r.topic, { width: widths[3] }),
          cell(r.rescheduledNote || "", { width: widths[4], size: 18 }),
        ],
      })),
    ],
  });

  return new Document({
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: [
        new Paragraph({ children: [new TextRun({ text: "Course Log", bold: true, size: 32 })], alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "" }),
        ...courseHeader(course, course.instructor?.name),
        table,
      ],
    }],
  });
}

/** Course Tentative Weekly Plan — the Subject Expert's planned schedule:
 * topic, mapped CLO, and Bloom's level for every planned lecture. */
export async function generateCourseWeeklyPlan(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { subjectExpert: true } });
  if (!course) throw new Error("course not found");

  const rows = await prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, include: { clo: true }, orderBy: { lectureNumber: "asc" } });

  const widths = [900, 900, CONTENT_WIDTH - 900 * 2 - 1600 - 1300, 1600, 1300];
  const table = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      headerRow(["Week", "Lec. No.", "Topic", "CLO", "Bloom's Level"], widths),
      ...rows.map((r) => new TableRow({
        children: [
          cell(String(r.week), { width: widths[0] }),
          cell(String(r.lectureNumber), { width: widths[1] }),
          cell(r.topic, { width: widths[2] }),
          cell(r.clo?.code || "—", { width: widths[3] }),
          cell(r.bloomLevel || "—", { width: widths[4] }),
        ],
      })),
    ],
  });

  return new Document({
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: [
        new Paragraph({ children: [new TextRun({ text: "Course Tentative Weekly Plan", bold: true, size: 32 })], alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "" }),
        ...courseHeader(course, course.subjectExpert?.name),
        table,
      ],
    }],
  });
}
