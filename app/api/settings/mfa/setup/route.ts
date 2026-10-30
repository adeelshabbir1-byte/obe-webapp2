import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { generateSecret, otpAuthUri } from "../../../../../lib/totp";
import { withErrors } from "../../../../../lib/apiHandler";

async function POST_handler() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  // A second set-up would silently replace the working secret (and lock the real owner out); turn MFA off first.
  if ((user as { mfaEnabled?: boolean }).mfaEnabled) return NextResponse.json({ error: "Two-step verification is already on. Turn it off first if you want to set it up again." }, { status: 409 });

  const secret = generateSecret();
  // Stored immediately but mfaEnabled stays false until /confirm succeeds.
  await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret } });

  const uri = otpAuthUri(secret, user.username, "NCEAC OBE Platform");
  return NextResponse.json({ secret, uri });
}
export const POST = withErrors(POST_handler);
