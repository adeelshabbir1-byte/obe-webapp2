import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

// A small A4 document builder on pdf-lib (pure JavaScript, no native parts): headings, wrapped paragraphs, key–value
// lists, tables that break across pages, simple bar charts, and "page x of y" footers.

const W = 595.28, H = 841.89, M = 42;
const INK = rgb(0.14, 0.1, 0.11), MUTED = rgb(0.4, 0.38, 0.39), BRAND = rgb(0.494, 0.141, 0.208), LINE = rgb(0.85, 0.8, 0.81), HEAD = rgb(0.96, 0.93, 0.94);
export const GREEN = rgb(0.12, 0.42, 0.23), RED = rgb(0.7, 0.15, 0.12), AMBER = rgb(0.6, 0.2, 0.07);

// The standard PDF fonts only know Latin-1 (WinAnsi): turn common symbols into plain text and drop the rest.
const MAP: Record<string, string> = { "—": "-", "–": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "•": "-", "✓": "Yes", "✗": "No", "≥": ">=", "≤": "<=", "→": "->", "←": "<-", "…": "...", "×": "x", "÷": "/", "●": "*", "★": "*", "\t": " " };
export function clean(s: unknown): string {
  return String(s ?? "").replace(/\r/g, "").split("").map((ch) => { if (MAP[ch] !== undefined) return MAP[ch]; const c = ch.charCodeAt(0); return ch === "\n" || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) ? ch : ""; }).join("");
}

export class PdfDoc {
  doc!: PDFDocument; font!: PDFFont; bold!: PDFFont; page!: PDFPage; y = H - M; footer = "";
  static async create(footer: string) { const d = new PdfDoc(); d.doc = await PDFDocument.create(); d.font = await d.doc.embedFont(StandardFonts.Helvetica); d.bold = await d.doc.embedFont(StandardFonts.HelveticaBold); d.footer = clean(footer); d.newPage(); return d; }
  newPage() { this.page = this.doc.addPage([W, H]); this.y = H - M; }
  need(h: number) { if (this.y - h < M + 20) this.newPage(); }
  wrap(text: string, size: number, width: number, font = this.font): string[] {
    const out: string[] = [];
    for (const para of clean(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width) { // a very long word: break it
          let i = w.length; while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
          if (line) { out.push(line); line = ""; }
          out.push(w.slice(0, i)); w = w.slice(i);
        }
        const next = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) > width) { out.push(line); line = w; } else line = next;
      }
      out.push(line);
    }
    return out;
  }
  text(s: string, o: { size?: number; bold?: boolean; color?: RGB; indent?: number; gap?: number } = {}) {
    const size = o.size ?? 9.5, font = o.bold ? this.bold : this.font, x = M + (o.indent || 0);
    for (const l of this.wrap(s, size, W - M - x, font)) { this.need(size + 3); this.page.drawText(l, { x, y: this.y - size, size, font, color: o.color || INK }); this.y -= size + 3; }
    this.y -= o.gap ?? 3;
  }
  title(s: string, sub?: string) {
    this.page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: BRAND });
    this.text(s, { size: 17, bold: true, color: BRAND, gap: 2 });
    if (sub) this.text(sub, { size: 10, color: MUTED, gap: 8 });
  }
  h1(s: string) { this.need(40); this.y -= 6; this.text(s, { size: 13, bold: true, color: BRAND, gap: 1 }); this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.8, color: LINE }); this.y -= 7; }
  h2(s: string) { this.need(26); this.y -= 2; this.text(s, { size: 10.5, bold: true, gap: 2 }); }
  note(s: string) { this.text(s, { size: 8.5, color: MUTED }); }
  kv(rows: [string, unknown][]) {
    for (const [k, v] of rows) {
      const lines = this.wrap(String(v ?? "-") || "-", 9.5, W - 2 * M - 150);
      this.need(lines.length * 12.5 + 2);
      this.page.drawText(clean(k), { x: M, y: this.y - 9.5, size: 9.5, font: this.bold, color: MUTED });
      lines.forEach((l, i) => this.page.drawText(l, { x: M + 150, y: this.y - 9.5 - i * 12.5, size: 9.5, font: this.font, color: INK }));
      this.y -= lines.length * 12.5 + 2;
    }
    this.y -= 4;
  }
  /** cols: [header, share of the width]; cell colours optional. */
  table(cols: [string, number][], rows: (string | number | null | undefined)[][], o: { size?: number; colour?: (r: number, c: number) => RGB | undefined } = {}) {
    const size = o.size ?? 8.5, tw = W - 2 * M, total = cols.reduce((t, c) => t + c[1], 0);
    const ws = cols.map((c) => (c[1] / total) * tw);
    const draw = (cells: string[], head: boolean, ri: number) => {
      const lines = cells.map((c, i) => this.wrap(c, size, ws[i] - 6, head ? this.bold : this.font));
      const h = Math.max(...lines.map((l) => l.length)) * (size + 2.5) + 5;
      if (this.y - h < M + 20) { this.newPage(); if (!head) draw(cols.map((c) => c[0]), true, -1); }
      if (head) this.page.drawRectangle({ x: M, y: this.y - h, width: tw, height: h, color: HEAD });
      let x = M;
      lines.forEach((ls, i) => { ls.forEach((l, j) => this.page.drawText(l, { x: x + 3, y: this.y - 3.5 - size - j * (size + 2.5), size, font: head ? this.bold : this.font, color: (!head && o.colour?.(ri, i)) || INK })); x += ws[i]; });
      this.page.drawLine({ start: { x: M, y: this.y - h }, end: { x: M + tw, y: this.y - h }, thickness: 0.4, color: LINE });
      this.y -= h;
    };
    this.need(40);
    draw(cols.map((c) => c[0]), true, -1);
    rows.forEach((r, ri) => draw(r.map((x) => (x === null || x === undefined || x === "" ? "-" : String(x))), false, ri));
    this.y -= 8;
  }
  bars(items: [string, number][], o: { height?: number; colour?: RGB } = {}) {
    const h = o.height ?? 90, max = Math.max(1, ...items.map((i) => i[1])), bw = (W - 2 * M) / Math.max(items.length, 1);
    this.need(h + 30);
    const base = this.y - h;
    items.forEach(([label, v], i) => {
      const bh = (v / max) * (h - 14);
      const x = M + i * bw + bw * 0.15;
      this.page.drawRectangle({ x, y: base, width: bw * 0.7, height: Math.max(bh, 0.5), color: o.colour || BRAND });
      this.page.drawText(String(v), { x: x + 2, y: base + bh + 2, size: 8, font: this.bold, color: INK });
      this.page.drawText(clean(label), { x: x, y: base - 11, size: 7.5, font: this.font, color: MUTED });
    });
    this.y = base - 22;
  }
  async save() {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => { p.drawText(`${this.footer}  -  page ${i + 1} of ${pages.length}`, { x: M, y: 22, size: 7.5, font: this.font, color: MUTED }); });
    return this.doc.save();
  }
}
