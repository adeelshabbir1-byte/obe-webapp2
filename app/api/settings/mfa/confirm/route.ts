import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { verifyTotp, generateBackupCodes } from "../../../../../lib/totp";
import { writeAuditLog } from "../../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = await req.json();
  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fullUser?.mfaSecret) return NextResponse.json({ error: "start setup first" }, { status: 400 });

  if (!verifyTotp(fullUser.mfaSecret, body.code || "")) {
    return NextResponse.json({ error: "invalid code — check your authenticator app and try again" }, { status: 400 });
  }

  const backupCodes = generateBackupCodes();
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaBackupCodes: JSON.stringify(backupCodes) } });
  await writeAuditLog({ actorUserId: user.id, action: "MFA_ENABLED" });

  return NextResponse.json({ backupCodes });
}
