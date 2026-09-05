import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function DELETE(req: Request, { params }: { params: { bundleId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const bundle = await prisma.reportBundle.findUnique({ where: { id: params.bundleId } });
  if (!bundle || bundle.scope !== "COORDINATOR" || bundle.ownerId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.reportBundle.delete({ where: { id: params.bundleId } });
  return NextResponse.json({ ok: true });
}
