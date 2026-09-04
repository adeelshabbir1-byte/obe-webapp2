import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";

export async function PUT(req: NextRequest, { params }: { params: { chairmanId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const chairman = await prisma.user.findUnique({ where: { id: params.chairmanId } });
  if (!chairman || chairman.role !== "CHAIRMAN") return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const data: any = {};
  if (body.instituteName !== undefined) data.instituteName = body.instituteName || null;
  if (body.instituteLogo !== undefined) data.instituteLogo = body.instituteLogo || null;

  const updated = await prisma.user.update({ where: { id: params.chairmanId }, data });

  return NextResponse.json({ instituteName: updated.instituteName, instituteLogo: updated.instituteLogo });
}
