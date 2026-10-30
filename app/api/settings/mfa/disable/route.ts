import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";
import { withErrors } from "../../../../../lib/apiHandler";

async function POST_handler() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null } });
  await writeAuditLog({ actorUserId: user.id, action: "MFA_DISABLED" });

  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
