import { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType } from "docx";

export const PAGE_WIDTH_DXA = 12240;
export const MARGIN_DXA = 1440;
export const CONTENT_WIDTH = PAGE_WIDTH_DXA - MARGIN_DXA * 2;

export function cell(text: string, opts: { bold?: boolean; width?: number; shade?: string; size?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.shade ? { type: ShadingType.CLEAR, fill: opts.shade } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text: text || "—", bold: !!opts.bold, size: opts.size || 20 })] })],
  });
}

export function headerRow(labels: string[], widths: number[]) {
  return new TableRow({ children: labels.map((l, i) => cell(l, { bold: true, width: widths[i], shade: "E8E6FB" })) });
}
