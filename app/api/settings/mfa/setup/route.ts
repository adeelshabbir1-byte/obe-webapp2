import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { generateSecret, otpAuthUri } from "../../../../../lib/totp";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const secret = generateSecret();
  // Stored immediately but mfaEnabled stays false until /confirm succeeds.
  await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret } });

  const uri = otpAuthUri(secret, user.username, "NCEAC OBE Platform");
  return NextResponse.json({ secret, uri });
}
