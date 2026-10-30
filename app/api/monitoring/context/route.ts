import { NextResponse } from "next/server";
import { getSignedInUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { monitoringOn } from "../../../../lib/monitoring";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// What browser-side monitoring may attach to an error: the user's id, role and institute — never a name or contact.
async function GET_handler() {
  if (!monitoringOn()) return NextResponse.json({});
  const u = await getSignedInUser().catch(() => null);
  if (!u) return NextResponse.json({});
  return NextResponse.json({ id: u.id, role: u.role, institute: await chairmanIdFor(u).catch(() => null) });
}
export const GET = withErrors(GET_handler);
