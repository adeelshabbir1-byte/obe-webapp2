import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const requests = await prisma.accountRequest.findMany({
    include: { reviewedBy: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], // PENDING sorts first alphabetically
  });

  return NextResponse.json({ requests });
}
