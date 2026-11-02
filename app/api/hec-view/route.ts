import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { makeLink, revoke, setSharing } from "../../../lib/hecView";

export const dynamic = "force-dynamic";
// share {on} (Institute Head) · link {label, days} / revoke {id} (Super Admin)
export async function POST(req: NextRequest) {
  const u = await getAuthenticatedUser();
  if (!u || !u.mfaVerified) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "share") { if (u.role !== "CHAIRMAN") throw new Error("Only the Institute Head decides."); await setSharing(u, await chairmanIdFor(u as never), !!b.on); return NextResponse.json({ ok: true }); }
    if (u.role !== "SUPER_USER") throw new Error("Only the platform team makes HEC links.");
    if (b.action === "link") { const t = await makeLink(u, String(b.label || "HEC"), Number(b.days) || 30); return NextResponse.json({ url: `${req.nextUrl.origin}/hec/${t}` }); }
    if (b.action === "revoke") { await revoke(String(b.id)); return NextResponse.json({ ok: true }); }
    throw new Error("Unknown action.");
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
