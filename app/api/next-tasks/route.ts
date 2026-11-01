import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { nextTasks } from "../../../lib/nextTasks";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// GET — "What's next for me": this person's open tasks, in order (the same list as on the home page).
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const r = await nextTasks(user);
  return NextResponse.json({ tasks: r.tasks, failed: r.failed });
}
export const GET = withErrors(GET_handler);
