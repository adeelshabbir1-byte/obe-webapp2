import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

async function getOwnedPlo(chairmanId: string, ploId: string) {
  const plo = await prisma.pLO.findUnique({ where: { id: ploId }, include: { coordinator: true } });
  if (!plo || plo.coordinator.managedById !== chairmanId) return null;
  return plo;
}

export async function PATCH(req: NextRequest, { params }: { params: { ploId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const plo = await getOwnedPlo(user.id, params.ploId);
  if (!plo) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  // Chairman can edit the text directly, and/or set a decision.
  const data: any = {};
  if (body.title) data.title = body.title;
  if (body.description) data.description = body.description;
  if (body.status && ["approved", "changes-requested", "draft"].includes(body.status)) data.status = body.status;
  if (typeof body.chairmanComment === "string") data.chairmanComment = body.chairmanComment || null;

  const updated = await prisma.pLO.update({ where: { id: params.ploId }, data });

  await writeAuditLog({
    actorUserId: user.id, action: body.status === "approved" ? "PLO_APPROVED" : "PLO_REVIEWED",
    entityType: "PLO", entityId: params.ploId,
  });

  return NextResponse.json({ plo: updated });
}
