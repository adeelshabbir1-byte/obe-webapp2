import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { withErrors } from "../../../../../lib/apiHandler";

async function PATCH_handler(req: NextRequest, { params }: { params: { ploId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const plo = await prisma.pLO.findUnique({ where: { id: params.ploId } });
  if (!plo || plo.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  { const lk = await (await import("../../../../../lib/curriculumLibrary")).batchLock(plo.batchId, "ga"); if (lk) return NextResponse.json({ error: lk }, { status: 423 }); }

  const body = await req.json();
  if (!body.title || !body.description) {
    return NextResponse.json({ error: "title and description are required" }, { status: 400 });
  }

  // Editing a previously-approved PLO sends it back to draft — an approval
  // is a snapshot of specific text, not a blank check for future edits.
  const nextStatus = plo.status === "approved" ? "draft" : plo.status;

  const updated = await prisma.pLO.update({
    where: { id: params.ploId },
    data: { title: body.title, description: body.description, status: nextStatus, chairmanComment: null },
  });

  await writeAuditLog({ actorUserId: user.id, action: "PLO_UPDATED", entityType: "PLO", entityId: params.ploId });

  return NextResponse.json({ plo: updated });
}

async function DELETE_handler(req: Request, { params }: { params: { ploId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const plo = await prisma.pLO.findUnique({ where: { id: params.ploId } });
  if (!plo || plo.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  { const lk = await (await import("../../../../../lib/curriculumLibrary")).batchLock(plo.batchId, "ga"); if (lk) return NextResponse.json({ error: lk }, { status: 423 }); }

  const cloCount = await prisma.cLO.count({ where: { mappedPloId: params.ploId } });
  if (cloCount > 0) {
    return NextResponse.json({ error: `cannot delete — ${cloCount} CLO(s) are mapped to this GA` }, { status: 409 });
  }

  await prisma.pLO.delete({ where: { id: params.ploId } });
  await writeAuditLog({ actorUserId: user.id, action: "PLO_DELETED", entityType: "PLO", entityId: params.ploId });

  return NextResponse.json({ ok: true });
}
export const PATCH = withErrors(PATCH_handler);
export const DELETE = withErrors(DELETE_handler);
