import { Document, Paragraph, TextRun, Table, TableRow, AlignmentType, WidthType } from "docx";
import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { getOmcActivityLog, type ActivityLogFilter } from "./reports";
import { formatActionLabel, formatMetadata } from "./auditLabels";
import { cell, headerRow, CONTENT_WIDTH } from "./docxTableHelpers";

type ReportUser = { id: string; role: string; managedById: string | null };
type SemDates = {
  semesterStartDate: Date | null; midtermStartDate: Date | null; midtermEndDate: Date | null;
  finalStartDate: Date | null; finalEndDate: Date | null;
};

const PHASES = [
  { key: "before_start", label: "Before Start of Semester" },
  { key: "midterm", label: "During Midterm Examinations" },
  { key: "before_final", label: "After Midterm, Before Final Examinations" },
  { key: "final", label: "During Final Examinations" },
  { key: "after_final", label: "After Final Examinations" },
  { key: "other", label: "Other / Outside This Semester's Recorded Dates" },
] as const;
type PhaseKey = typeof PHASES[number]["key"];

function phaseFor(t: number, sd: SemDates | null): PhaseKey {
  if (!sd) return "other";
  if (sd.midtermStartDate && sd.midtermEndDate && t >= sd.midtermStartDate.getTime() && t <= sd.midtermEndDate.getTime()) return "midterm";
  if (sd.finalStartDate && sd.finalEndDate && t >= sd.finalStartDate.getTime() && t <= sd.finalEndDate.getTime()) return "final";
  if (sd.finalEndDate && t > sd.finalEndDate.getTime()) return "after_final";
  if (sd.semesterStartDate && t < sd.semesterStartDate.getTime()) return "before_start";
  if (sd.semesterStartDate && t >= sd.semesterStartDate.getTime()) return "before_final"; // after start, not yet in a named exam window
  return "other";
}

/**
 * Builds a formal "Minutes of Meeting"-style Word document from the same
 * OMC activity log the on-screen report shows, grouped into the phases
 * of one specific term (before the semester started, during midterms,
 * between midterm and final, during finals, after finals) rather than a
 * flat chronological list — the format an accreditation panel expects.
 * `term` selects which SemesterDates row provides the phase boundaries;
 * if none is given (or none exists for that program/term/year), every
 * entry in range falls into "Other" and the document still generates,
 * just without phase grouping.
 */
export async function generateOmcMinutes(
  user: ReportUser,
  filter: ActivityLogFilter,
  term?: { degreeProgram: string; termName: string; termYear: number }
) {
  const chairmanId = await chairmanIdFor(user);
  const chairman = chairmanId ? await prisma.user.findUnique({ where: { id: chairmanId } }) : null;

  let semDates: SemDates | null = null;
  if (term && chairmanId) {
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } });
    semDates = await prisma.semesterDates.findFirst({
      where: { coordinatorId: { in: coordinators.map((c) => c.id) }, degreeProgram: term.degreeProgram, termName: term.termName, termYear: term.termYear },
      select: { semesterStartDate: true, midtermStartDate: true, midtermEndDate: true, finalStartDate: true, finalEndDate: true },
    });
  }

  // Pull every matching row across every page — this is a printed record,
  // not a paginated screen.
  const allRows: Awaited<ReturnType<typeof getOmcActivityLog>>["rows"] = [];
  let page = 1;
  while (true) {
    const { rows, total, pageSize } = await getOmcActivityLog(user, { ...filter, page });
    allRows.push(...rows);
    if (page * pageSize >= total) break;
    page++;
    if (page > 200) break;
  }

  const byPhase = new Map<PhaseKey, typeof allRows>();
  for (const p of PHASES) byPhase.set(p.key, []);
  for (const row of allRows) byPhase.get(phaseFor(row.createdAt.getTime(), semDates))!.push(row);
  // Oldest-first within each phase reads like a real meeting timeline.
  for (const p of PHASES) byPhase.get(p.key)!.reverse();

  const colWidths = [1400, 1800, 2600, 2600, CONTENT_WIDTH - 1400 - 1800 - 2600 * 2];
  function phaseSection(label: string, rows: typeof allRows) {
    if (rows.length === 0) return [];
    const table = new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: colWidths,
      rows: [
        headerRow(["Date", "OMC Member", "Action", "On", "Details"], colWidths),
        ...rows.map((r) => new TableRow({
          children: [
            cell(r.createdAt.toISOString().slice(0, 10), { width: colWidths[0] }),
            cell(r.actorName, { width: colWidths[1] }),
            cell(formatActionLabel(r.action), { width: colWidths[2] }),
            cell(r.entityLabel, { width: colWidths[3] }),
            cell(formatMetadata(r.metadata) || "—", { width: colWidths[4] }),
          ],
        })),
      ],
    });
    return [
      new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 24 })], spacing: { before: 300, after: 120 } }),
      table,
    ];
  }

  const termLabel = term ? `${term.degreeProgram} — ${term.termName} ${term.termYear}` : "All Recorded Activity";
  const body: (Paragraph | Table)[] = [
    new Paragraph({ children: [new TextRun({ text: "Minutes of Meeting", bold: true, size: 36 })], alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: "Outcomes-Based Education Committee (OMC)", bold: true, size: 26 })], alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
    new Paragraph({ children: [new TextRun({ text: chairman?.instituteName || "Institution", size: 22, color: "555555" })], alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: termLabel, size: 22, color: "555555" })], alignment: AlignmentType.CENTER, spacing: { after: 40 } }),
    new Paragraph({ children: [new TextRun({ text: `Generated ${new Date().toISOString().slice(0, 10)}`, size: 18, color: "888888" })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
    new Paragraph({
      children: [new TextRun({
        text: "This record lists every action taken by an OMC member — course template reviews and approvals, PLO/CLO mapping decisions, curriculum and content-sync changes, and institutional policy settings — grouped by the phase of the semester in which it occurred, as recorded automatically by the system at the time each action was taken.",
        size: 20, color: "555555",
      })],
      spacing: { after: 200 },
    }),
  ];

  if (!semDates && term) {
    body.push(new Paragraph({
      children: [new TextRun({ text: `No semester dates are recorded for ${termLabel} — every entry below is listed under "Other" rather than by phase. Set this term's dates on the Semester & Exam Dates page to get phase grouping.`, size: 20, italics: true, color: "9A5B00" })],
      spacing: { after: 200 },
    }));
  }

  for (const p of PHASES) body.push(...phaseSection(p.label, byPhase.get(p.key)!));
  if (allRows.length === 0) {
    body.push(new Paragraph({ children: [new TextRun({ text: "No OMC activity recorded for this filter.", size: 20, color: "888888" })] }));
  }

  body.push(
    new Paragraph({ text: "", spacing: { before: 400 } }),
    new Paragraph({ children: [new TextRun({ text: "Prepared by: ______________________        Reviewed by (Chairman): ______________________", size: 20 })], spacing: { before: 300 } }),
  );

  return new Document({
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: body,
    }],
  });
}
