import { AlignmentType, Document, HeadingLevel, ImageRun, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, ShadingType } from "docx";
import { PdfDoc } from "./pdfDoc";
import { logoImageOptions } from "./docxExport";

// One document model for the HEC files (NOC file, audit pack, MoC, Diploma Supplement), rendered as PDF or Word.
export type Block = { t: "title"; s: string; sub?: string } | { t: "h"; s: string } | { t: "p"; s: string; small?: boolean } | { t: "kv"; rows: [string, unknown][] } | { t: "table"; cols: [string, number][]; rows: (string | number | null | undefined)[][] };

export async function toPdf(blocks: Block[], footer: string, logo?: string | null) {
  const pdf = await PdfDoc.create(footer);
  await pdf.image(logo, 60);
  for (const b of blocks) {
    if (b.t === "title") pdf.title(b.s, b.sub);
    else if (b.t === "h") pdf.text(b.s, { bold: true, gap: 8 });
    else if (b.t === "p") b.small ? pdf.note(b.s) : pdf.text(b.s, { size: 9 });
    else if (b.t === "kv") pdf.kv(b.rows);
    else pdf.table(b.cols, b.rows, { size: 8 });
  }
  return Buffer.from(await pdf.save());
}
const TW = 9360; // table width in DXA (A4 text width with 1" margins ≈ 9026; kept within page)
export function toDocx(blocks: Block[], logo?: string | null) {
  const kids: (Paragraph | Table)[] = [];
  const img = logoImageOptions(logo, 70);
  if (img) kids.push(new Paragraph({ children: [new ImageRun(img as never)] }));
  for (const b of blocks) {
    if (b.t === "title") { kids.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(b.s)] })); if (b.sub) kids.push(new Paragraph({ children: [new TextRun({ text: b.sub, color: "666666" })] })); }
    else if (b.t === "h") kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: [new TextRun(b.s)] }));
    else if (b.t === "p") kids.push(new Paragraph({ children: [new TextRun({ text: b.s, size: b.small ? 18 : 21, color: b.small ? "666666" : undefined })] }));
    else {
      const cols: [string, number][] = b.t === "kv" ? [["", 2600], ["", TW - 2600]] : b.cols;
      const total = cols.reduce((a, c) => a + c[1], 0);
      const widths = cols.map((c) => Math.round((c[1] / total) * TW));
      const rows = b.t === "kv" ? b.rows.map(([k, v]) => [k, String(v ?? "—")]) : b.rows;
      const cell = (text: string, w: number, head: boolean) => new TableCell({ width: { size: w, type: WidthType.DXA }, shading: head ? { type: ShadingType.CLEAR, fill: "E8EEF5", color: "auto" } : undefined, children: [new Paragraph({ children: [new TextRun({ text, bold: head, size: 18 })] })] });
      const trs = [...(b.t === "table" ? [new TableRow({ tableHeader: true, children: cols.map((c, i) => cell(c[0], widths[i], true)) })] : []), ...rows.map((r) => new TableRow({ children: r.map((x, i) => cell(String(x ?? ""), widths[i], b.t === "kv" && i === 0)) }))];
      kids.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: widths, rows: trs }));
      kids.push(new Paragraph({ children: [] }));
    }
  }
  kids.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 480 }, children: [new TextRun({ text: "Signed: ______________________        Date: __________", size: 20 })] }));
  return new Document({ sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: kids }] });
}
