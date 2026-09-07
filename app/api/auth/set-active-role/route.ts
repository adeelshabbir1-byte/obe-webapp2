import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, setActiveRole } from "../../../../lib/session";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const body = await req.json();
  const role = body.role;
  const allowed = [user.rawRole, user.secondaryRole].filter(Boolean);
  if (!allowed.includes(role)) return NextResponse.json({ error: "not a role you're able to act as" }, { status: 403 });

  await setActiveRole(role);
  return NextResponse.json({ ok: true });
}
