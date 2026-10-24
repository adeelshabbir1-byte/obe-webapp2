import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { adminCan } from "../../../../lib/platformTeam";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !(await adminCan(user, "ONBOARDING"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const requests = await prisma.accountRequest.findMany({
    include: { reviewedBy: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], // PENDING sorts first alphabetically
  });

  return NextResponse.json({ requests });
}
