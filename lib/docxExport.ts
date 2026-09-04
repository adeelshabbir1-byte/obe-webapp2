import { Document, Packer } from "docx";
import { NextResponse } from "next/server";

export async function buildDocxResponse(filename: string, doc: Document) {
  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
