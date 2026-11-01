import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { getFlag, setFlag } from "../../../../lib/scopedSettings";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// GET / PUT { digest: "off" | "daily" | "weekly" } — the person's own choice for the red-and-amber digest (Adeel prompt §1).
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ digest: (await getFlag(user.id, "digest")) || "off" });
}
async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const d = String(((await req.json().catch(() => ({}))) as { digest?: string }).digest || "");
  if (!["off", "daily", "weekly"].includes(d)) return NextResponse.json({ error: "Choose off, daily or weekly." }, { status: 400 });
  await setFlag(user.id, "digest", d);
  return NextResponse.json({ ok: true, digest: d });
}
export const GET = withErrors(GET_handler);
export const PUT = withErrors(PUT_handler);
