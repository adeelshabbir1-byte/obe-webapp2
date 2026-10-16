import { NextRequest, NextResponse } from "next/server";
import { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, PageOrientation } from "docx";
import { getAuthenticatedUser } from "../../../../lib/session";
import { buildDocxResponse } from "../../../../lib/docxExport";
import { sarScope } from "../../../../lib/sarAccess";
import { buildNbeacSar, type Item } from "../../../../lib/nbeacSar";

const BUILDERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];
const cell = (text: string, head = false) => new TableCell({
  shading: head ? { type: ShadingType.CLEAR, fill: "F4EFE1" } : undefined,
  children: String(text).split("\n").map((line) => new Paragraph({ children: [new TextRun({ text: line, bold: head, size: 17 })] })),
});

function itemBlocks(it: Item): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [new Paragraph({ spacing: { before: 200, after: 60 }, children: [new TextRun({ text: `${it.code}  `, bold: true, size: 20 }), new TextRun({ text: it.question, size: 20 })] })];
  if (it.status === "restricted") { out.push(new Paragraph({ children: [new TextRun({ text: "Confidential — attached separately.", italics: true, size: 18 })] })); return out; }
  if (it.kind === "narrative") {
    for (const p of (it.text || "Not Available").split(/\n+/)) out.push(new Paragraph({ children: [new TextRun({ text: p, size: 20 })] }));
  } else if (it.kind === "appendix") {
    if (!it.files?.length) out.push(new Paragraph({ children: [new TextRun({ text: "Not Available", italics: true, size: 18 })] }));
    for (const f of it.files || []) out.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: `${f.title}${f.approvedBy ? ` — approved by ${f.approvedBy}` : ""}${f.date ? `, ${f.date}` : ""}`, size: 18 })] }));
  } else if (!it.rows?.length) {
    out.push(new Paragraph({ children: [new TextRun({ text: "Not Available", italics: true, size: 18 })] }));
  } else {
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ tableHeader: true, children: it.columns!.map((c) => cell(c, true)) }), ...it.rows.map((r) => new TableRow({ children: r.map((c) => cell(c === null || c === "" ? "—" : String(c))) }))],
    }));
  }
  return out;
}

// The NBEAC SAR as a Word document (landscape, for the wide tables).
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !BUILDERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const scope = await sarScope(user);
  const deptId = req.nextUrl.searchParams.get("dept") || "";
  if (!scope.departments.some((d) => d.id === deptId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const doc = await buildNbeacSar(user, scope, deptId);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: "Self-Assessment Report (SAR) — NBEAC Standards 4.0" })] }),
    new Paragraph({ children: [new TextRun({ text: doc.school, bold: true, size: 26 })] }),
    new Paragraph({ children: [new TextRun({ text: `Prepared ${doc.generatedAt.slice(0, 10)}. Where information is unavailable it is marked "Not Available".`, size: 18 })] }),
  ];
  for (const f of doc.forms) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: `${f.title} (${f.weight})` })] }));
    for (const it of f.items) children.push(...itemBlocks(it));
  }
  const word = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, children }] });
  return buildDocxResponse(`NBEAC-SAR-${doc.school.replace(/[^A-Za-z0-9]+/g, "-")}.docx`, word);
}
