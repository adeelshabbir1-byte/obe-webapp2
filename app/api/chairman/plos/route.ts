import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.id } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const plos = await prisma.pLO.findMany({
    where: { coordinatorId: { in: coordinatorIds } },
    include: { coordinator: true },
    orderBy: [{ coordinatorId: "asc" }, { number: "asc" }],
  });

  return NextResponse.json({ plos });
}
