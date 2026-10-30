import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { saveDetail } from "../../../lib/aas";
import { STAFF_SELF, checkValues, canonValues } from "../../../lib/aasFields";
import { portalLists } from "../../../lib/nceacPortal";
import { chairmanIdFor } from "../../../lib/reportScope";
import { withErrors } from "../../../lib/apiHandler";

/** POST — a teacher saves their own Faculty Directory details (NCEAC). */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const lists = await portalLists(await chairmanIdFor(user).catch(() => null));
  const v = canonValues("staff", Object.fromEntries(STAFF_SELF.map((k) => [k, typeof b[k] === "string" ? b[k] : ""])), lists);
  const bad = checkValues("staff", v, lists);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  try { await saveDetail("staff", (user as { realUserId?: string }).realUserId || user.id, v, user.id); } catch { return NextResponse.json({ error: "Not set up yet — the Super User needs to run prisma/migration_aas.sql." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
