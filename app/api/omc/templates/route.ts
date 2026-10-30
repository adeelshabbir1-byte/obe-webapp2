import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { omcLeadScope, omcCourseScope } from "../../../../lib/omcScope";
import { withErrors } from "../../../../lib/apiHandler";

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Scope: courses whose coordinator reports to the same Institute Head who onboarded this OMC member.
  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "", ...omcLeadScope(user) } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, templateStatus: { not: "draft" }, ...omcCourseScope(user) },
    include: { subjectExpert: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ courses });
}
export const GET = withErrors(GET_handler);
