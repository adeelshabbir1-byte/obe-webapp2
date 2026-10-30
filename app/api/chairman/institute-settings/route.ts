import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { invalidateInstituteBranding } from "../../../../lib/branding";
import { withErrors } from "../../../../lib/apiHandler";

async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const updated = await prisma.user.update({ where: { id: user.id }, data: { instituteName: body.instituteName || null } });
  invalidateInstituteBranding(user.id);

  return NextResponse.json({ instituteName: updated.instituteName });
}
export const PUT = withErrors(PUT_handler);
