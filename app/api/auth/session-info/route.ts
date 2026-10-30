import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { getSessionInfo } from "../../../../lib/shellData";
import { withErrors } from "../../../../lib/apiHandler";

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  return NextResponse.json(await getSessionInfo(user));
}
export const GET = withErrors(GET_handler);
