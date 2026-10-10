import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { invalidateInstituteBranding } from "../../../../lib/branding";

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const updated = await prisma.user.update({ where: { id: user.id }, data: { instituteName: body.instituteName || null } });
  invalidateInstituteBranding(user.id);

  return NextResponse.json({ instituteName: updated.instituteName });
}
