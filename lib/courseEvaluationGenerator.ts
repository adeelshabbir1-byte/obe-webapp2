import { Document, Paragraph, TextRun, Table, TableRow, AlignmentType, WidthType } from "docx";
import { prisma } from "./db";
import { computeCloPloPassRates } from "./resultMate";
import { getPassingCriteria } from "./passingCriteria";
import { chairmanIdFor } from "./reportScope";
import { cell, headerRow, CONTENT_WIDTH } from "./docxTableHelpers";
import { proposeFollowUps } from "./topicLinks";

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
      new TableRow({ children: [cell("Instructor's Name", { bold: true, width: headerWidths[0] }), cell(course.instructor?.name || "—", { width: headerWidths[1] }), cell("No. of Students Achieved GAs", { bold: true, width: headerWidths[2] }), cell(result.ploStats.map((s) => `${s.label}: ${s.passCount}`).join(", "), { width: headerWidths[3], size: 16 })] }),
      new TableRow({ children: [cell("Credit Hours", { bold: true, width: headerWidths[0] }), cell(String(course.creditHours), { width: headerWidths[1] }), cell("", { width: headerWidths[2] }), cell("", { width: headerWidths[3] })] }),
    ],
  });

  // ---- CLO table ----
  const cloWidths = [900, 3600, 1300, 1300, 900, 1100, 1200, 1100];
  const cloTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cloWidths,
    rows: [
      headerRow(["CLO #", "Course Learning Outcome", "Learning Level", "Mapped GA", "Lec", "Marks", "Pass Rate", "Below"], cloWidths),
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
      headerRow(["GA #", "Graduate Attribute", "Marks", "Pass Rate", "Below", ""], ploWidths),
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

  // Topics: what was planned but not taught, how the class did on each topic, what this course passes on to later
  // courses, and what was done about the follow-ups this course received (continuous quality improvement).
  const topics = await proposeFollowUps(courseId, viewer).catch(() => null);
  const received = await prisma.topicFollowUp.findMany({
    where: { OR: [{ targetCourseId: courseId }, { targetCourseId: null, targetCourseCode: course.code, coordinatorId: course.coordinatorId, sourceCourseId: { not: courseId } }] },
    orderBy: { createdAt: "asc" },
  }).catch(() => []);
  const weakTopics = topics ? topics.results.filter((r) => r.students >= 3 && r.below / r.students > 0.5) : [];
  const heading = (t: string) => new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 24 })] });
  const line = (t: string) => new Paragraph({ children: [new TextRun({ text: t, size: 20 })] });
  const topicWidths = [3600, 1600, 2600, 1800];
  const topicSection = topics && topics.results.some((r) => r.students > 0) ? [
    heading("Results by Topic"),
    new Paragraph({ text: "" }),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: topicWidths,
      rows: [
        headerRow(["Topic", "Lectures", `Students below ${topics.passPct}%`, "Class average"], topicWidths),
        ...topics.results.filter((r) => r.students > 0).map((r) => new TableRow({ children: [
          cell(r.topic, { width: topicWidths[0], size: 16 }), cell(r.lectures.join(", "), { width: topicWidths[1] }),
          cell(`${r.below} of ${r.students}`, { width: topicWidths[2] }), cell(r.avgPct !== null ? `${r.avgPct}%` : "—", { width: topicWidths[3] }),
        ] })),
      ],
    }),
    new Paragraph({ text: "" }),
  ] : [];
  const missed = topics?.missedTopics || [];
  const extraSections = [
    ...topicSection,
    heading("Topics Planned but Not Taught"),
    ...(missed.length ? missed.map((t, i) => line(`${i + 1}. ${t} — the next offering of this course must cover it.`)) : [line("None: every planned topic was taught.")]),
    new Paragraph({ text: "" }),
    heading("Weak Topics (taught and assessed, most students below the pass mark)"),
    ...(weakTopics.length ? weakTopics.map((r, i) => line(`${i + 1}. ${r.topic}: ${r.below} of ${r.students} students below ${topics!.passPct}% (assessed by ${r.items.join(", ")}).`)) : [line("None.")]),
    new Paragraph({ text: "" }),
    heading("Recommendations for Later Courses"),
    ...(topics && topics.proposals.length ? topics.proposals.map((p, i) => line(`${i + 1}. To ${p.targetCourseCode}${p.targetTopic ? ` (${p.targetTopic})` : " (next offering)"}: ${p.recommendation}`)) : [line("None.")]),
    new Paragraph({ text: "" }),
    heading("Follow-ups Received and Action Taken"),
    ...(received.length ? received.map((f, i) => line(`${i + 1}. From ${f.sourceCourseCode} — "${f.targetTopic || f.topic}": ${f.recommendation} Status: ${f.status === "DONE" ? "done" : f.status === "IN_PROGRESS" ? "in progress" : f.status === "DISMISSED" ? "not needed" : "open"}.${f.actionTaken ? ` Action taken: ${f.actionTaken}` : ""}`)) : [line("None.")]),
    new Paragraph({ text: "" }),
  ];

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
        new Paragraph({ children: [new TextRun({ text: "Graduate Attributes", bold: true, size: 24 })] }),
        new Paragraph({ text: "" }),
        ploTable,
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: "Instructor's Observations (Be Specific and Brief)", bold: true, size: 24 })] }),
        new Paragraph({ text: "" }),
        ...observationLines.map((l, i) => new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${l}`, size: 20 })] })),
        new Paragraph({ text: "" }),
        ...extraSections,
      ],
    }],
  });
}
