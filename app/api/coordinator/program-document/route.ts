import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { generateProgramDocument } from "../../../../lib/programDocumentGenerator";
import { buildDocxResponse } from "../../../../lib/docxExport";
import { prisma } from "../../../../lib/db";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batchId = req.nextUrl.searchParams.get("batchId");
  if (!batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });

  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const doc = await generateProgramDocument(batchId, user.id);
    return buildDocxResponse(`${batch.degreeProgram.replace(/\s+/g, "-")}-${batch.batchName.replace(/\s+/g, "-")}-Program-Document.docx`, doc);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "something went wrong generating the document" }, { status: 500 });
  }
}
