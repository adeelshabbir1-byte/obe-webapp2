import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { invalidatePlatformBranding } from "../../../../lib/branding";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const data: any = {};
  if (body.ownerLogo !== undefined) data.ownerLogo = body.ownerLogo || null;
  if (body.nceacLogo !== undefined) data.nceacLogo = body.nceacLogo || null;

  const settings = await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
  invalidatePlatformBranding();

  return NextResponse.json({ settings });
}
