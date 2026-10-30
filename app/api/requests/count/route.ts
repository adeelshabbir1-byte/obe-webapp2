import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { getRequestsCount } from "../../../../lib/shellData";
import { withErrors } from "../../../../lib/apiHandler";

// How many requests need this person: asked of them and still open, or answered and waiting for them to read.
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ count: 0 });
  return NextResponse.json({ count: await getRequestsCount(user) });
}
export const GET = withErrors(GET_handler);
