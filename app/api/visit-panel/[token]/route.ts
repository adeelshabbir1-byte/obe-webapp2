import { NextRequest, NextResponse } from "next/server";
import { passByToken } from "../../../../lib/visitorPass";
import { buildSar } from "../../../../lib/sarBuilder";
import { buildDossier } from "../../../../lib/accreditation/dossier";
import { writeAuditLog } from "../../../../lib/audit";
import { withErrors } from "../../../../lib/apiHandler";

export const maxDuration = 60;
// GET ?file=sar|dossier — downloads for the visiting panel's read-only link.
async function GET_handler(req: NextRequest, { params }: { params: { token: string } }) {
  const p = await passByToken(params.token);
  if (!p) return NextResponse.json({ error: "This link has expired." }, { status: 403 });
  const file = req.nextUrl.searchParams.get("file");
  await writeAuditLog({ action: "VISITOR_DOWNLOAD", entityType: "AccreditationCycle", entityId: p.cycleId, metadata: { file: file || "", pass: p.label } });
  if (file === "sar") { const r = await buildSar(p.cycleId); if (!r) return NextResponse.json({ error: "not found" }, { status: 404 }); return new NextResponse(r.buffer as unknown as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${r.filename}"` } }); }
  if (file === "dossier") { const r = await buildDossier(p.cycleId); if (!r) return NextResponse.json({ error: "not found" }, { status: 404 }); return new NextResponse(r.buffer, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${r.filename}"` } }); }
  return NextResponse.json({ error: "unknown file" }, { status: 400 });
}
export const GET = withErrors(GET_handler);
