import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { getFlag, setFlag } from "../../../lib/scopedSettings";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// Autosaved drafts of long forms, per person and form (Adeel prompt §19.2). GET ?key= · PUT { key, data } · DELETE ?key=
const keyOf = (k: string | null) => (k && /^[\w:./-]{3,120}$/.test(k) ? `draft:${k}` : null);
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const key = keyOf(req.nextUrl.searchParams.get("key"));
  if (!user || !key) return NextResponse.json({ draft: null });
  const raw = await getFlag(user.id, key).catch(() => null);
  try { return NextResponse.json({ draft: raw ? JSON.parse(raw) : null }); } catch { return NextResponse.json({ draft: null }); }
}
async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { key?: string; data?: unknown };
  const key = keyOf(b.key || null);
  if (!key) return NextResponse.json({ error: "bad key" }, { status: 400 });
  const raw = JSON.stringify({ data: b.data, at: new Date().toISOString() });
  if (raw.length > 200_000) return NextResponse.json({ error: "Draft too large." }, { status: 413 });
  await setFlag(user.id, key, raw);
  return NextResponse.json({ ok: true });
}
async function DELETE_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  const key = keyOf(req.nextUrl.searchParams.get("key"));
  if (user && key) await setFlag(user.id, key, null).catch(() => null);
  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const PUT = withErrors(PUT_handler);
export const DELETE = withErrors(DELETE_handler);
