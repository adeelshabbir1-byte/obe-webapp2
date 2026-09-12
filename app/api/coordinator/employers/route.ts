import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";

const ALLOWED_ROLES = ["PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR"];

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const employers = await prisma.employer.findMany({ where: { chairmanId }, orderBy: { organizationName: "asc" } });
  return NextResponse.json({ employers });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const body = await req.json();
  if (!body.organizationName) return NextResponse.json({ error: "organizationName is required" }, { status: 400 });

  const existing = await prisma.employer.findUnique({ where: { chairmanId_organizationName: { chairmanId, organizationName: body.organizationName } } });
  if (existing) return NextResponse.json({ error: `an employer named "${body.organizationName}" already exists — it can't be added again` }, { status: 409 });

  const employer = await prisma.employer.create({
    data: {
      chairmanId, organizationName: body.organizationName, contactName: body.contactName || null, contactEmail: body.contactEmail || null,
      companySize: body.companySize || null, industryType: body.industryType || null, addedById: user.id, status: "PENDING",
    },
  });

  return NextResponse.json({ employer }, { status: 201 });
}
