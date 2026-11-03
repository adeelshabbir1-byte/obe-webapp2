import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedUser } from "../../../../lib/session";
import { saveMemberProfile } from "../../../../lib/platformTeam";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const u = await getAuthenticatedUser();
  if (!u || !u.mfaVerified) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (u.role !== "SUPER_USER" && !(await prisma.user.findUnique({ where: { id: u.id }, select: { isPlatformExpert: true } }))?.isPlatformExpert) return NextResponse.json({ error: "For the platform team." }, { status: 403 });
  try { await saveMemberProfile(u.id, await req.json().catch(() => ({}))); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
