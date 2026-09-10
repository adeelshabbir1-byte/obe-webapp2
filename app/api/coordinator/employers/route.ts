import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const employers = await prisma.employer.findMany({ where: { coordinatorId: user.id }, orderBy: { organizationName: "asc" } });
  return NextResponse.json({ employers });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.organizationName) return NextResponse.json({ error: "organizationName is required" }, { status: 400 });

  const employer = await prisma.employer.create({
    data: { coordinatorId: user.id, organizationName: body.organizationName, contactName: body.contactName || null, contactEmail: body.contactEmail || null },
  });

  return NextResponse.json({ employer }, { status: 201 });
}
