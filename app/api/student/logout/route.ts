import { NextResponse } from "next/server";
import { destroyStudentSession } from "../../../../lib/studentSession";
import { withErrors } from "../../../../lib/apiHandler";

async function POST_handler() {
  await destroyStudentSession();
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
