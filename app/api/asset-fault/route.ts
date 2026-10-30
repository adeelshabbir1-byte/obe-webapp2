import { NextResponse } from "next/server";
import { getSignedInUser } from "../../../lib/session";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { reportFault, ASSET_HINT } from "../../../lib/assets";
import { withErrors } from "../../../lib/apiHandler";

/** POST { assetId, description, name } — anyone in the lab reports a fault from the QR label (signed in or not). */
async function POST_handler(req: Request) {
  const b = await req.json().catch(() => ({}));
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (description.length < 5) return NextResponse.json({ error: "Say what is wrong (for example: does not start, no display, keyboard missing)." }, { status: 400 });
  const staff = await getSignedInUser().catch(() => null), student = staff ? null : await getAuthenticatedStudent().catch(() => null);
  const name = staff?.name || (student ? `${student.name} (student)` : typeof b.name === "string" && b.name.trim() ? `${b.name.trim().slice(0, 80)} (not signed in)` : "Someone in the lab (not signed in)");
  try { await reportFault(String(b.assetId || ""), description, { id: staff?.id || null, name }); return NextResponse.json({ ok: true }); }
  catch (e) { const m = String((e as Error).message || e); return NextResponse.json({ error: /does not exist|Cannot read properties of undefined/.test(m) ? ASSET_HINT : m.slice(0, 300) }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
