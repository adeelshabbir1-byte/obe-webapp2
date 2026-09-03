import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, markSessionMfaVerified } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { verifyTotp } from "../../../../lib/totp";
import { writeAuditLog } from "../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = await req.json();
  if (!body.code) return NextResponse.json({ error: "code is required" }, { status: 400 });

  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fullUser?.mfaSecret) return NextResponse.json({ error: "MFA is not set up on this account" }, { status: 400 });

  let valid = verifyTotp(fullUser.mfaSecret, body.code);

  // Fall back to a backup code if the TOTP code didn't match.
  if (!valid && fullUser.mfaBackupCodes) {
    const codes: string[] = JSON.parse(fullUser.mfaBackupCodes);
    const idx = codes.indexOf(body.code.trim());
    if (idx !== -1) {
      valid = true;
      codes.splice(idx, 1);
      await prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodes: JSON.stringify(codes) } });
    }
  }

  if (!valid) {
    await writeAuditLog({ actorUserId: user.id, action: "MFA_VERIFY_FAILED" });
    return NextResponse.json({ error: "invalid code" }, { status: 401 });
  }

  await markSessionMfaVerified();
  await writeAuditLog({ actorUserId: user.id, action: "MFA_VERIFY_SUCCESS" });

  return NextResponse.json({ ok: true });
}
