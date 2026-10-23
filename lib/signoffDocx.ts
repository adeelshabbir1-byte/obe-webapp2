import { ImageRun, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, BorderStyle } from "docx";
import { qrPng, type Issued } from "./signoff";

// The sign-off block for Word documents: one column per recorded approval (signature image when uploaded), the stamp,
// the document number and the QR code.
export function docxSignOff(issued: Issued | null): (Paragraph | Table)[] {
  if (!issued) return [new Paragraph({ children: [new TextRun({ text: "Document numbering is not set up yet (run prisma/migration_signoff.sql).", italics: true, size: 18 })] })];
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const borders = { top: none, bottom: none, left: none, right: none };
  const img = (url: string, w: number, h: number) => { try { return new ImageRun({ data: Buffer.from(url.split(",")[1] || "", "base64"), transformation: { width: w, height: h } }); } catch { return null; } };
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const cells = issued.signers.slice(0, 3).map((s) => {
    const sig = s.userId && issued.signatures[s.userId] ? img(issued.signatures[s.userId], 120, 40) : null;
    return new TableCell({ borders, width: { size: 24, type: WidthType.PERCENTAGE }, children: [
      new Paragraph({ children: sig ? [sig] : [new TextRun({ text: " ", size: 40 })] }),
      new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 6, color: "444444", space: 2 } }, children: [new TextRun({ text: s.name, bold: true, size: 19 })] }),
      new Paragraph({ children: [new TextRun({ text: s.title, size: 17 })] }),
      new Paragraph({ children: [new TextRun({ text: `${s.role} · ${when(s.at)}`, size: 15, color: "555555" })] }),
    ] });
  });
  const stamp = issued.stamp ? img(issued.stamp, 70, 70) : null;
  if (stamp) cells.push(new TableCell({ borders, width: { size: 12, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [stamp] })] }));
  if (!cells.length) cells.push(new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: "No approvals recorded yet.", size: 18 })] })] }));
  const qr = new ImageRun({ data: qrPng(issued.url, 3), transformation: { width: 96, height: 96 } });
  cells.push(new TableCell({ borders, width: { size: 28, type: WidthType.PERCENTAGE }, children: [
    new Paragraph({ children: [qr] }),
    new Paragraph({ children: [new TextRun({ text: `Document No. ${issued.docNo}`, bold: true, size: 17 })] }),
    new Paragraph({ children: [new TextRun({ text: `Issued ${when(new Date(issued.issuedAt).toISOString())}. Scan to verify, or open ${issued.url.replace(/\?h=.*/, "")}`, size: 14 })] }),
    ...(issued.revoked ? [new Paragraph({ children: [new TextRun({ text: "REVOKED — NOT VALID", bold: true, color: "B3261E", size: 18 })] })] : []),
  ] }));
  return [
    new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: "Sign-off", bold: true, size: 26, color: "7A1F2B" })] }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: cells })] }),
  ];
}
