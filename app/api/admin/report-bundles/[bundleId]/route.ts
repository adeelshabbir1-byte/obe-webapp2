import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function DELETE(req: Request, { params }: { params: { bundleId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const bundle = await prisma.reportBundle.findUnique({ where: { id: params.bundleId } });
  if (!bundle || bundle.scope !== "PLATFORM") return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.reportBundle.delete({ where: { id: params.bundleId } });
  return NextResponse.json({ ok: true });
}
