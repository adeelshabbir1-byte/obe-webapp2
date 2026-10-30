import { NextResponse } from "next/server";
import { destroySession } from "../../../../lib/session";
import { withErrors } from "../../../../lib/apiHandler";

async function POST_handler() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
