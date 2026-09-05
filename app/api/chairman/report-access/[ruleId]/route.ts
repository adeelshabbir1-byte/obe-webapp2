import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function DELETE(req: Request, { params }: { params: { ruleId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rule = await prisma.reportAccessRule.findUnique({ where: { id: params.ruleId } });
  if (!rule || rule.chairmanId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.reportAccessRule.delete({ where: { id: params.ruleId } });
  return NextResponse.json({ ok: true });
}
