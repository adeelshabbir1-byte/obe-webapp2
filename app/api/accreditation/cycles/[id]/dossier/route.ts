import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/db";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { writeAuditLog } from "../../../../../../lib/audit";
import { govScope, inScope } from "../../../../../../lib/accreditation/governance";
import { buildDossier } from "../../../../../../lib/accreditation/dossier";
import { withErrors } from "../../../../../../lib/apiHandler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET — the visit dossier as a ZIP: every task form, the evidence, the SAR (NBEAC), minutes, CQI and an index.
async function GET_handler(_req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  const s = user ? await govScope(user) : null;
  if (!user || !s) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const c = await prisma.accreditationCycle.findUnique({ where: { id: params.id } });
    if (!c || !inScope(s, c)) return NextResponse.json({ error: "not found" }, { status: 404 });
    const out = await buildDossier(c.id);
    if (!out) return NextResponse.json({ error: "not found" }, { status: 404 });
    await writeAuditLog({ actorUserId: user.id, action: "ACCREDITATION_DOSSIER_EXPORTED", entityType: "AccreditationCycle", entityId: c.id, metadata: { bytes: out.buffer.length } });
    return new NextResponse(out.buffer, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${out.filename}"` } });
  } catch (e) {
    console.error("dossier", (e as Error).message);
    return NextResponse.json({ error: "The dossier couldn't be put together — run prisma/migration_accreditation_governance.sql if you haven't yet." }, { status: 503 });
  }
}
export const GET = withErrors(GET_handler);
