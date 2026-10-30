import { NextRequest, NextResponse } from "next/server";
import { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, WidthType, PageOrientation } from "docx";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { termFeedback, termOf } from "../../../../lib/feedbackAnalysis";
import { QEC_INCHARGE } from "../../../../lib/duties";
import { buildDocxResponse } from "../../../../lib/docxExport";
import { cell, headerRow } from "../../../../lib/docxTableHelpers";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET ?term=Fall-2026[&teacher=<id>] — the QEC teacher-evaluation proforma as Word: every section's per-question counts,
// averages and total out of 100, the batch norms and the ranking on raw and adjusted scores.
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !(["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role) || (user.extraRoles || []).includes(QEC_INCHARGE))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const term = termOf(req.nextUrl.searchParams.get("term"));
  if (!term) return NextResponse.json({ error: "Choose a term." }, { status: 400 });
  const chairmanId = await chairmanIdFor(user);
  const tf = await termFeedback(chairmanId, term);
  const only = req.nextUrl.searchParams.get("teacher");
  const secs = tf.sections.filter((s) => s.shown && (!only || s.teacherId === only));
  const W = [4200, 700, 700, 700, 700, 700, 900, 900];
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: `Teacher Evaluation Proforma — ${term.name} ${term.year}` })] }),
    new Paragraph({ children: [new TextRun({ text: `Students' answers on a 1–5 scale. Total out of 100 = Σ(question average ÷ 5 × weight) ÷ Σ weights × 100. Results are shown from ${tf.settings.minResponses} answers. Students are not named.`, size: 20, color: "555555" })] }),
  ];
  for (const s of secs) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: `${s.code} ${s.title} — ${s.teacher}` })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: `${s.batch} · ${s.teacherB.n} answers · total ${s.teacherB.total ?? "—"}/100${s.adjusted !== null ? ` · adjusted ${s.adjusted}/5 (batch norm ${s.norm}, ${(s.delta || 0) >= 0 ? "+" : ""}${s.delta})` : ""}`, size: 20 })] }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
      headerRow(["Question", "5", "4", "3", "2", "1", "Average", "Weight"], W),
      ...s.teacherB.lines.map((l) => new TableRow({ children: [cell(l.text, { width: W[0] }), ...[4, 3, 2, 1, 0].map((i) => cell(String(l.counts[i]), { width: 700 })), cell(l.avg === null ? "—" : String(l.avg), { width: 900, bold: true }), cell(String(l.weight), { width: 900 })] })),
    ] }));
  }
  if (!only) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "How strict or generous each batch rates" })] }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
      headerRow(["Batch", "Answers", "Norm /5", "vs institute"], [5000, 1400, 1400, 1400]),
      ...tf.batches.map((b) => new TableRow({ children: [cell(b.label), cell(String(b.n)), cell(String(b.score ?? "—")), cell(b.vs === null ? "—" : `${b.vs >= 0 ? "+" : ""}${b.vs}`)] })),
    ] }));
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Ranking" })] }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
      headerRow(["#", "Teacher", "Answers", "Total /100", "Raw /5", "Adjusted /5"], [600, 4400, 1200, 1300, 1200, 1300]),
      ...tf.ranking.filter((r) => r.shown).map((r, i) => new TableRow({ children: [cell(String(i + 1)), cell(r.teacher), cell(String(r.n)), cell(String(r.total ?? "—")), cell(String(r.raw ?? "—")), cell(String(r.adjusted ?? "—"), { bold: true })] })),
    ] }));
  }
  const doc = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.PORTRAIT }, margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, children }] });
  return buildDocxResponse(`teacher-evaluation-${term.name}-${term.year}.docx`, doc);
}
export const GET = withErrors(GET_handler);
