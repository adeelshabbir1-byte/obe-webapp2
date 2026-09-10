import { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, PageBreak, AlignmentType } from "docx";
import { prisma } from "./db";

const PAGE_WIDTH_DXA = 12240;
const MARGIN_DXA = 1440;
const CONTENT_WIDTH = PAGE_WIDTH_DXA - MARGIN_DXA * 2;

function cell(text: string, opts: { bold?: boolean; width?: number; shade?: string; size?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.shade ? { type: ShadingType.CLEAR, fill: opts.shade } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text: text || "—", bold: !!opts.bold, size: opts.size || 20 })] })],
  });
}

function headerRow(labels: string[], widths: number[]) {
  return new TableRow({ children: labels.map((l, i) => cell(l, { bold: true, width: widths[i], shade: "E8E6FB" })) });
}

export async function generateProgramDocument(batchId: string, coordinatorId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.coordinatorId !== coordinatorId) throw new Error("batch not found");

  const [profile, plos, courses] = await Promise.all([
    prisma.programProfile.findUnique({ where: { coordinatorId_degreeProgram: { coordinatorId, degreeProgram: batch.degreeProgram } } }),
    prisma.pLO.findMany({ where: { batchId }, orderBy: { number: "asc" } }),
    prisma.course.findMany({
      where: { batchId },
      orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      include: {
        prerequisiteCourse: true,
        subjectExpert: true,
        clos: { where: { source: "SE" }, orderBy: { code: "asc" }, include: { mappedPlo: true } },
        lectureRows: { where: { source: "SE" }, orderBy: { lectureNumber: "asc" } },
      },
    }),
  ]);

  const peos: string[] = profile?.peos ? JSON.parse(profile.peos) : [];
  const totalCredits = courses.reduce((s, c) => s + c.creditHours, 0);
  const byCategory = new Map<string, { credits: number; count: number }>();
  for (const c of courses) {
    const entry = byCategory.get(c.courseType) || { credits: 0, count: 0 };
    entry.credits += c.creditHours; entry.count += 1;
    byCategory.set(c.courseType, entry);
  }
  const maxSemester = courses.length > 0 ? Math.max(...courses.map((c) => c.semesterNumber || 1)) : 0;

  const children: (Paragraph | Table)[] = [];

  // --- Title page ---
  children.push(
    new Paragraph({ spacing: { before: 2000 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Program Curriculum", bold: true, size: 40 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: batch.degreeProgram, bold: true, size: 32 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800 }, children: [new TextRun({ text: `Batch: ${batch.batchName}`, size: 24 })] }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // --- Department Intro / Vision / Mission ---
  if (profile?.departmentIntro || profile?.departmentVision || profile?.departmentMission) {
    if (profile.departmentIntro) {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Department Introduction", bold: true })] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: profile.departmentIntro })] }),
      );
    }
    if (profile.departmentVision) {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Vision", bold: true })] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: profile.departmentVision })] }),
      );
    }
    if (profile.departmentMission) {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Mission", bold: true })] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: profile.departmentMission })] }),
      );
    }
  }

  // --- PEOs ---
  if (peos.length > 0) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300 }, children: [new TextRun({ text: "Program Education Objectives (PEOs)", bold: true })] }));
    peos.forEach((p, i) => {
      children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: `PEO ${i + 1}: `, bold: true }), new TextRun({ text: p })] }));
    });
  }

  // --- PLOs table ---
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300 }, children: [new TextRun({ text: "Program Learning Outcomes (PLOs)", bold: true })] }));
  if (plos.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: "No PLOs have been defined for this batch yet.", italics: true })] }));
  } else {
    const ploWidths = [Math.round(CONTENT_WIDTH * 0.15), Math.round(CONTENT_WIDTH * 0.25), CONTENT_WIDTH - Math.round(CONTENT_WIDTH * 0.4)];
    children.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      rows: [
        headerRow(["PLO #", "Title", "Description"], ploWidths),
        ...plos.map((p) => new TableRow({ children: [cell(`PLO-${p.number}`, { width: ploWidths[0] }), cell(p.title, { width: ploWidths[1] }), cell(p.description, { width: ploWidths[2] })] })),
      ],
    }));
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // --- Program Structure table ---
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Program Structure", bold: true })] }));
  const structWidths = [Math.round(CONTENT_WIDTH * 0.4), Math.round(CONTENT_WIDTH * 0.3), CONTENT_WIDTH - Math.round(CONTENT_WIDTH * 0.7)];
  children.push(new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    rows: [
      headerRow(["Category", "Courses", "Credit Hours"], structWidths),
      ...Array.from(byCategory.entries()).map(([cat, v]) => new TableRow({ children: [cell(cat, { width: structWidths[0] }), cell(String(v.count), { width: structWidths[1] }), cell(String(v.credits), { width: structWidths[2] })] })),
      new TableRow({ children: [cell("Total", { bold: true, width: structWidths[0], shade: "F4EFE1" }), cell(String(courses.length), { bold: true, width: structWidths[1], shade: "F4EFE1" }), cell(String(totalCredits), { bold: true, width: structWidths[2], shade: "F4EFE1" })] }),
    ],
  }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // --- Semester-wise Study Plan ---
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Scheme of Studies / Semester-Wise Study Plan", bold: true })] }));
  const planWidths = [Math.round(CONTENT_WIDTH * 0.12), Math.round(CONTENT_WIDTH * 0.38), Math.round(CONTENT_WIDTH * 0.2), Math.round(CONTENT_WIDTH * 0.15), CONTENT_WIDTH - Math.round(CONTENT_WIDTH * 0.85)];
  for (let sem = 1; sem <= maxSemester; sem++) {
    const semCourses = courses.filter((c) => (c.semesterNumber || 1) === sem);
    if (semCourses.length === 0) continue;
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200 }, children: [new TextRun({ text: `Semester ${sem}`, bold: true })] }));
    children.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      rows: [
        headerRow(["Code", "Title", "Prerequisite", "Category", "Cr. Hrs."], planWidths),
        ...semCourses.map((c) => new TableRow({ children: [
          cell(c.code, { width: planWidths[0] }), cell(c.title, { width: planWidths[1] }),
          cell(c.prerequisiteCourse?.code || "None", { width: planWidths[2] }), cell(c.courseType, { width: planWidths[3] }),
          cell(String(c.creditHours), { width: planWidths[4] }),
        ] })),
        new TableRow({ children: [cell(`Credit Hours (Semester ${sem})`, { bold: true, width: planWidths[0] + planWidths[1] + planWidths[2] + planWidths[3], shade: "F4EFE1" }), cell(String(semCourses.reduce((s, c) => s + c.creditHours, 0)), { bold: true, width: planWidths[4], shade: "F4EFE1" })] }),
      ],
    }));
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // --- Per-course detailed syllabus ---
  for (const c of courses) {
    const labelW = Math.round(CONTENT_WIDTH * 0.22);
    const valueW = CONTENT_WIDTH - labelW;
    function lv(label: string, value: string) {
      return new TableRow({ children: [cell(label, { bold: true, width: labelW, shade: "F4EFE1" }), cell(value, { width: valueW })] });
    }

    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: c.title, bold: true })] }));
    children.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      rows: [
        lv("Course Code", c.code),
        lv("Credit Hours", String(c.creditHours)),
        lv("Category", c.courseType),
        lv("Prerequisite", c.prerequisiteCourse ? `${c.prerequisiteCourse.code} — ${c.prerequisiteCourse.title}` : "None"),
        lv("Assessment Weights", `Assignment ${c.assignmentPct}%, Quiz ${c.quizPct}%, Project ${c.projectPct}%, Lab ${c.labPct}%, Midterm ${c.midtermPct}%, Final ${c.finalPct}%`),
        lv("Subject Expert", c.subjectExpert?.name || "—"),
        lv("Lab Instructor", c.labInstructorName || "N/A"),
        lv("Catalog Description", c.catalogDescription || "—"),
        lv("Programming Assignments", c.programmingAssignmentsNote || "—"),
      ],
    }));

    if (c.clos.length > 0) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200 }, children: [new TextRun({ text: "Course Learning Outcomes (CLOs)", bold: true })] }));
      const cloWidths = [Math.round(CONTENT_WIDTH * 0.55), Math.round(CONTENT_WIDTH * 0.15), CONTENT_WIDTH - Math.round(CONTENT_WIDTH * 0.7)];
      children.push(new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        rows: [
          headerRow(["Statement", "Bloom Level", "PLO"], cloWidths),
          ...c.clos.map((clo) => new TableRow({ children: [
            cell(`${clo.code}: ${clo.statement}`, { width: cloWidths[0] }), cell(clo.bloomLevel, { width: cloWidths[1] }),
            cell(clo.mappedPlo ? `PLO-${clo.mappedPlo.number}` : "—", { width: cloWidths[2] }),
          ] })),
        ],
      }));
    }

    if (c.textbook || c.referenceMaterial) {
      children.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Text Book(s): ", bold: true }), new TextRun({ text: c.textbook || "—" })] }));
      if (c.referenceMaterial) children.push(new Paragraph({ children: [new TextRun({ text: "Reference Material: ", bold: true }), new TextRun({ text: c.referenceMaterial })] }));
    }

    if (c.lectureRows.length > 0) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200 }, children: [new TextRun({ text: "Weekly Lesson Plan", bold: true })] }));
      const weekWidths = [Math.round(CONTENT_WIDTH * 0.15), CONTENT_WIDTH - Math.round(CONTENT_WIDTH * 0.15)];
      const weekRows: TableRow[] = [headerRow(["Week", "Topics"], weekWidths)];
      for (let i = 0; i < c.lectureRows.length; i += 2) {
        const weekNum = Math.floor(i / 2) + 1;
        const topics = c.lectureRows.slice(i, i + 2).map((r) => r.topic).filter(Boolean).join("; ");
        weekRows.push(new TableRow({ children: [cell(`Week ${weekNum}`, { width: weekWidths[0] }), cell(topics || "—", { width: weekWidths[1] })] }));
      }
      children.push(new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, rows: weekRows }));
    }

    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  return new Document({
    sections: [{
      properties: { page: { size: { width: PAGE_WIDTH_DXA, height: 15840 }, margin: { top: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA, right: MARGIN_DXA } } },
      children,
    }],
  });
}
