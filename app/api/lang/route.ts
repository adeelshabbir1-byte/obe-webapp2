import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { setFlag } from "../../../lib/scopedSettings";

export const dynamic = "force-dynamic";
// The menu language for this person: English (default) or Urdu.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try { await setFlag(user.id, "lang", b.lang === "ur" ? "ur" : null); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
