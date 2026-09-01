import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const requests = await prisma.weightExceptionRequest.findMany({
    where: { status: "pending", course: { coordinatorId: { in: coordinatorIds } } },
    include: { course: { include: { subjectExpert: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ requests });
}
