import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { computePrerequisiteCorrelations } from "../../../../lib/prerequisiteCorrelation";
import { deptScope } from "../../../../lib/omcScope";
import { withErrors } from "../../../../lib/apiHandler";

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", ...deptScope(user) }, select: { id: true } });
    const coordinatorIds = coordinators.map((c) => c.id);

    const pairs = await computePrerequisiteCorrelations(coordinatorIds);
    return NextResponse.json({ pairs });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "something went wrong computing prerequisite correlations" }, { status: 500 });
  }
}
export const GET = withErrors(GET_handler);
