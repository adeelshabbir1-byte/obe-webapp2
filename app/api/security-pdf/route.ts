import { NextResponse } from "next/server";
import { PdfDoc } from "../../../lib/pdfDoc";
import { S } from "../../../lib/securityFacts";

export const dynamic = "force-dynamic";

// Public: the same text as /security, as a PDF to attach to a procurement or IT review.
export async function GET() {
  const pdf = await PdfDoc.create("OBEHUB - security and data protection");
  pdf.title("Security & data protection", `How OBEHUB keeps university data safe · ${new Date().toISOString().slice(0, 10)}`);
  for (const [h, items] of S) { pdf.h1(h); for (const t of items) pdf.text(`- ${t}`, { indent: 6 }); }
  return new NextResponse(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="OBEHUB-security.pdf"' } });
}
