import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedUser } from "../../../../lib/session";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// GET ?q= — colleagues a task can be "waiting on": the same department, and the people above you (your manager and theirs).
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ people: [] });
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { departmentId: true, managedById: true, managedBy: { select: { managedById: true } } } });
  const up = [me?.managedById, me?.managedBy?.managedById].filter((x): x is string => !!x);
  const people = await prisma.user.findMany({
    where: { isActive: true, id: { not: user.id }, role: { not: "SUPER_USER" }, name: { contains: q, mode: "insensitive" }, OR: [...(me?.departmentId ? [{ departmentId: me.departmentId }] : []), { id: { in: up.concat("none") } }] },
    select: { id: true, name: true, role: true }, take: 8, orderBy: { name: "asc" },
  });
  return NextResponse.json({ people });
}
export const GET = withErrors(GET_handler);
