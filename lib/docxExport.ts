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

/** Converts a base64 data URI logo into docx ImageRun options, or null if absent/unparseable. */
export function logoImageOptions(dataUri: string | null | undefined, maxWidthPx = 90) {
  if (!dataUri) return null;
  const match = dataUri.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (!match) return null;
  const type = match[1] === "jpg" ? "jpeg" : match[1];
  const buffer = Buffer.from(match[2], "base64");
  return { data: buffer, transformation: { width: maxWidthPx, height: maxWidthPx }, type: type as "png" | "jpeg" };
}
