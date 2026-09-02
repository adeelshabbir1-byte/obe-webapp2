import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.id } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const result = await prisma.pLO.updateMany({
    where: { coordinatorId: { in: coordinatorIds }, status: { not: "approved" } },
    data: { status: "approved" },
  });

  await writeAuditLog({ actorUserId: user.id, action: "PLOS_BULK_APPROVED", metadata: { count: result.count } });

  return NextResponse.json({ approved: result.count });
}
