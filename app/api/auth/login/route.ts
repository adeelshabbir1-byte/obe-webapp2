import { NextRequest, NextResponse } from "next/server";
import { attemptLogin } from "../../../../lib/auth";
import { createSession } from "../../../../lib/session";
import { ipBlocked, ipOf } from "../../../../lib/rateLimit";

export async function POST(req: NextRequest) {
  const { usernameOrEmail, password } = await req.json();

  if (!usernameOrEmail || !password) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  if (await ipBlocked(ipOf(req.headers))) return NextResponse.json({ error: "Too many failed sign-ins from this network. Please wait 15 minutes." }, { status: 429 });

  const result = await attemptLogin(
    usernameOrEmail,
    password,
    req.headers.get("x-forwarded-for") || undefined
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }

  await createSession(
    result.user.id,
    req.headers.get("x-forwarded-for") || undefined,
    req.headers.get("user-agent") || undefined,
    !result.user.mfaEnabled // if MFA is on, this session starts unverified until the code is entered
  );

  return NextResponse.json({
    user: {
      username: result.user.username,
      role: result.user.role,
      secondaryRole: result.user.secondaryRole,
      name: result.user.name,
      mustChangePassword: result.user.mustChangePassword,
      mfaEnabled: result.user.mfaEnabled,
    },
  });
}
