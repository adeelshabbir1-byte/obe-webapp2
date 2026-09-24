import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

// Round-robins every currently-unassigned, non-draft course evenly
// across every OMC member in this institution — a one-click way to
// split up a backlog rather than assigning each course by hand.
// Never touches a course that's already assigned to someone.
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const omcMembers = await prisma.user.findMany({ where: { role: "OMC", managedById: user.managedById || "" }, orderBy: { name: "asc" } });
  if (omcMembers.length === 0) return NextResponse.json({ error: "no OMC members found" }, { status: 400 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const unassigned = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, templateStatus: { not: "draft" }, assignedOmcReviewerId: null },
    orderBy: { createdAt: "asc" },
  });

  for (let i = 0; i < unassigned.length; i++) {
    const reviewer = omcMembers[i % omcMembers.length];
    await prisma.course.update({ where: { id: unassigned[i].id }, data: { assignedOmcReviewerId: reviewer.id } });
  }

  await writeAuditLog({ actorUserId: user.id, action: "OMC_REVIEWS_AUTO_BALANCED", metadata: { assignedCount: unassigned.length, omcMemberCount: omcMembers.length } });

  return NextResponse.json({ assignedCount: unassigned.length, omcMemberCount: omcMembers.length });
}
