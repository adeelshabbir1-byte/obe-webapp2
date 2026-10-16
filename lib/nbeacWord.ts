import { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, PageOrientation } from "docx";
import type { Item, SarDoc } from "./nbeacSar";

// The NBEAC SAR as a Word document (landscape, for the wide tables) — downloaded on its own, and put in the visit dossier.

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

export function nbeacWordDocument(doc: SarDoc): Document {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: "Self-Assessment Report (SAR) — NBEAC Standards 4.0" })] }),
    new Paragraph({ children: [new TextRun({ text: doc.school, bold: true, size: 26 })] }),
    new Paragraph({ children: [new TextRun({ text: `Prepared ${doc.generatedAt.slice(0, 10)}. Where information is unavailable it is marked "Not Available".`, size: 18 })] }),
  ];
  for (const f of doc.forms) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: `${f.title} (${f.weight})` })] }));
    for (const it of f.items) children.push(...itemBlocks(it));
  }
  return new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, children }] });
}
