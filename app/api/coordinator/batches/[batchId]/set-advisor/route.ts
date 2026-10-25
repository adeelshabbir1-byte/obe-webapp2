import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { snapshot } from "../../../../../../lib/planHistory";
import { writeAuditLog } from "../../../../../../lib/audit";
import { advisorCandidatesWhere } from "../../../../../../lib/advisors";

export async function PUT(req: NextRequest, { params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batch = await prisma.batch.findUnique({ where: { id: params.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  const body = await req.json();
  let advisorId: string | null = null;
  if (body.advisorId) {
    const advisor = await prisma.user.findFirst({ where: { AND: [{ id: String(body.advisorId) }, advisorCandidatesWhere(user)] } as never });
    if (!advisor) {
      return NextResponse.json({ error: "invalid advisor" }, { status: 400 });
    }
    advisorId = advisor.id;
  }

  await prisma.batch.update({ where: { id: batch.id }, data: { advisorId } });
  // Hand-over: each student's plan as it stands is kept as a version, so what the earlier advisor planned stays on record.
  if (batch.advisorId && batch.advisorId !== advisorId) {
    const [from, to] = await Promise.all([prisma.user.findUnique({ where: { id: batch.advisorId }, select: { name: true } }), advisorId ? prisma.user.findUnique({ where: { id: advisorId }, select: { name: true } }) : null]);
    const studs = await prisma.student.findMany({ where: { batchId: batch.id }, select: { id: true } });
    for (const st of studs) await snapshot(st.id, user.id, "HANDOVER", `Advisor changed: ${from?.name || "—"} → ${to?.name || "none"}`);
  }
  await writeAuditLog({ actorUserId: user.id, action: "BATCH_ADVISOR_SET", entityType: "Batch", entityId: batch.id, metadata: { from: batch.advisorId, to: advisorId } });
  return NextResponse.json({ ok: true, advisorId });
}
