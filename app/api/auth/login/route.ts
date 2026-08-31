import { NextRequest, NextResponse } from "next/server";
import { attemptLogin } from "../../../../lib/auth";
import { createSession } from "../../../../lib/session";

export async function POST(req: NextRequest) {
  const { usernameOrEmail, password } = await req.json();

  if (!usernameOrEmail || !password) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

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
    req.headers.get("user-agent") || undefined
  );

  return NextResponse.json({
    user: {
      username: result.user.username,
      role: result.user.role,
      name: result.user.name,
      mustChangePassword: result.user.mustChangePassword,
    },
  });
}
