import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { getSessionInfo } from "../../../../lib/shellData";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  return NextResponse.json(await getSessionInfo(user));
}
