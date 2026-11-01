import { rgb } from "pdf-lib";
import { PdfDoc, clean } from "./pdfDoc";
import { latexPng, latexDocx } from "./mathRender";
import { mathSegments } from "./qbankCore";

// A drafted paper as Word and PDF. Equations ($…$) are native Word equations where possible (else sharp images) and
// sharp images in the PDF, so they read the same as on screen. The layout options come from the paper template
// (build C); without one, a plain institute layout is used.

export type PaperQ = { no: string; text: string; marks: number; clo?: string | null; options?: string[]; parts?: { label: string; text: string; marks: number; clo?: string | null }[] };
export type Layout = {
  header: [string, string][]; title: string; instructions: string; showMarks: boolean; showClo: boolean; numbering: "Q1" | "1.1";
  sections?: { title: string; note?: string; questions: PaperQ[] }[]; footer: string; watermark?: string | null; fontSize?: number; margins?: number; rollBoxes?: boolean; page?: "A4" | "Letter";
};

const INK = rgb(0.14, 0.1, 0.11);
/** One paragraph with inline equations: words wrap, each equation is an image on the line (display equations on their own line). */
async function rich(d: PdfDoc, text: string, o: { size?: number; indent?: number; bold?: boolean } = {}) {
  const size = o.size ?? 10.5, M = 42, W = d.page.getWidth(), x0 = M + (o.indent || 0), right = W - M;
  const font = o.bold ? d.bold : d.font;
  const lineH = size + 5;
  let x = x0;
  d.need(lineH); let base = d.y - size;
  const newLine = (h = lineH) => { d.y -= h; d.need(lineH); base = d.y - size; x = x0; };
  for (const para of text.split("\n")) {
    for (const seg of mathSegments(para)) {
      if (!seg.math) {
        for (const w of clean(seg.text).split(/(\s+)/)) {
          if (!w) continue;
          if (/^\s+$/.test(w)) { x += font.widthOfTextAtSize(" ", size); continue; }
          const ww = font.widthOfTextAtSize(w, size);
          if (x + ww > right && x > x0) newLine();
          d.page.drawText(w, { x, y: base, size, font, color: INK }); x += ww;
        }
        continue;
      }
      const img = await latexPng(seg.text, seg.display, size);
      if (!img) { const t = `[${seg.text}]`; d.page.drawText(clean(t), { x, y: base, size, font, color: INK }); x += font.widthOfTextAtSize(clean(t), size); continue; }
      const pic = await d.doc.embedPng(img.png);
      if (seg.display) { if (x > x0) newLine(); const h = img.height + 6; d.need(h); base = d.y - img.height - 3; d.page.drawImage(pic, { x: x0 + Math.max(0, (right - x0 - img.width) / 2), y: base, width: img.width, height: img.height }); d.y -= h; d.need(lineH); base = d.y - size; x = x0; continue; }
      if (x + img.width > right && x > x0) newLine(Math.max(lineH, img.height + 4));
      d.page.drawImage(pic, { x, y: base - img.depth, width: img.width, height: img.height }); x += img.width + 1;
    }
    newLine();
  }
  d.y -= 2;
}

export async function paperPdf(l: Layout, questions: PaperQ[]): Promise<Uint8Array> {
  const d = await PdfDoc.create(l.footer);
  d.title(l.title);
  d.kv(l.header);
  if (l.rollBoxes) d.text("Roll number: ____________________     Name: ________________________________", { size: 10, gap: 8 });
  if (l.instructions) { d.h2("Instructions"); await rich(d, l.instructions, { size: 9.5 }); }
  const sections = l.sections?.length ? l.sections : [{ title: "", questions }];
  for (const s of sections) {
    if (s.title) { d.h1(s.title); if (s.note) d.note(s.note); }
    for (const q of s.questions) {
      d.need(40);
      const tag = [l.showMarks ? `${q.marks} mark${q.marks === 1 ? "" : "s"}` : "", l.showClo && q.clo ? q.clo : ""].filter(Boolean).join(" · ");
      d.text(`${q.no}${tag ? `   [${tag}]` : ""}`, { size: 10.5, bold: true, gap: 1 });
      await rich(d, q.text, { indent: 14, size: l.fontSize || 10.5 });
      for (const [i, o] of (q.options || []).entries()) await rich(d, `(${String.fromCharCode(97 + i)}) ${o}`, { indent: 26, size: l.fontSize || 10.5 });
      for (const p of q.parts || []) await rich(d, `(${p.label}) ${p.text}${l.showMarks ? `   [${p.marks}]` : ""}${l.showClo && p.clo ? ` ${p.clo}` : ""}`, { indent: 26, size: l.fontSize || 10.5 });
      d.y -= 4;
    }
  }
  if (l.watermark) {
    const { degrees } = await import("pdf-lib");
    for (const p of d.doc.getPages()) p.drawText(clean(l.watermark), { x: 70, y: 260, size: 26, font: d.bold, color: rgb(0.75, 0.2, 0.25), opacity: 0.18, rotate: degrees(35) });
  }
  return d.save();
}

/** The same paper as a Word document: native equations where possible, else the same image as the PDF. */
export async function paperDocx(l: Layout, questions: PaperQ[]): Promise<Buffer> {
  const dx = await import("docx");
  const runs = async (text: string, size = 22, bold = false) => {
    const out: unknown[] = [];
    for (const seg of mathSegments(text)) {
      if (!seg.math) { out.push(new dx.TextRun({ text: seg.text, size, bold })); continue; }
      const native = await latexDocx(seg.text);
      if (native) { out.push(new dx.Math({ children: native as never })); continue; }
      const img = await latexPng(seg.text, seg.display);
      if (img) out.push(new dx.ImageRun({ data: Buffer.from(img.png), transformation: { width: Math.round(img.width * 1.33), height: Math.round(img.height * 1.33) }, type: "png" } as never));
      else out.push(new dx.TextRun({ text: `[${seg.text}]`, size }));
    }
    return out;
  };
  const paras: unknown[] = [];
  const P = async (text: string, o: { size?: number; bold?: boolean; indent?: number; heading?: boolean } = {}) => { for (const line of text.split("\n")) paras.push(new dx.Paragraph({ children: (await runs(line, o.size, o.bold)) as never, indent: o.indent ? { left: o.indent } : undefined, heading: o.heading ? dx.HeadingLevel.HEADING_1 : undefined, spacing: { after: 80 } })); };
  await P(l.title, { size: 32, bold: true });
  for (const [k, v] of l.header) paras.push(new dx.Paragraph({ children: [new dx.TextRun({ text: `${k}: `, bold: true, size: 20 }), new dx.TextRun({ text: v, size: 20 })] }));
  if (l.rollBoxes) await P("Roll number: ____________________     Name: ________________________________");
  if (l.instructions) { await P("Instructions", { bold: true }); await P(l.instructions, { size: 20 }); }
  const sections = l.sections?.length ? l.sections : [{ title: "", note: "", questions }];
  for (const s of sections) {
    if (s.title) { await P(s.title, { heading: true }); if (s.note) await P(s.note, { size: 20 }); }
    for (const q of s.questions) {
      const tag = [l.showMarks ? `${q.marks} mark${q.marks === 1 ? "" : "s"}` : "", l.showClo && q.clo ? q.clo : ""].filter(Boolean).join(" · ");
      paras.push(new dx.Paragraph({ children: [new dx.TextRun({ text: `${q.no}${tag ? `   [${tag}]` : ""}`, bold: true })], spacing: { before: 160 } }));
      await P(q.text, { indent: 300 });
      for (const [i, o] of (q.options || []).entries()) await P(`(${String.fromCharCode(97 + i)}) ${o}`, { indent: 600 });
      for (const p of q.parts || []) await P(`(${p.label}) ${p.text}${l.showMarks ? `   [${p.marks}]` : ""}${l.showClo && p.clo ? ` ${p.clo}` : ""}`, { indent: 600 });
    }
  }
  const doc = new dx.Document({
    sections: [{
      properties: { page: { margin: { top: (l.margins || 1) * 1440, bottom: (l.margins || 1) * 1440, left: (l.margins || 1) * 1440, right: (l.margins || 1) * 1440 } } },
      headers: l.watermark ? { default: new dx.Header({ children: [new dx.Paragraph({ children: [new dx.TextRun({ text: l.watermark, color: "C0303F", size: 18 })] })] }) } : undefined,
      footers: { default: new dx.Footer({ children: [new dx.Paragraph({ children: [new dx.TextRun(`${l.footer}  ·  page `), new dx.TextRun({ children: [dx.PageNumber.CURRENT] }), new dx.TextRun(" of "), new dx.TextRun({ children: [dx.PageNumber.TOTAL_PAGES] })] })] }) },
      children: paras as never,
    }],
  });
  return dx.Packer.toBuffer(doc);
}
