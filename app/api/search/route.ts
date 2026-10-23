import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { search, remember, recent, type Viewer } from "../../../lib/search";

export const dynamic = "force-dynamic";

async function viewer(): Promise<{ v: Viewer; key: string } | null> {
  const user = await getAuthenticatedUser().catch(() => null);
  if (user && user.mfaVerified && user.role !== "SUPER_USER") return { v: { kind: "staff", user: user as never }, key: `u:${user.id}` };
  const st = await getAuthenticatedStudent().catch(() => null);
  if (st) return { v: { kind: "student", student: { id: st.id, name: st.name, batchId: (st as { batchId?: string }).batchId || "" } }, key: `s:${st.id}` };
  return null;
}

/** GET ?q= — results grouped by kind (only what the person may see); without q, the person's recent searches. */
export async function GET(req: Request) {
  const me = await viewer();
  if (!me) return NextResponse.json({ error: "Sign in to search." }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") || "";
  if (!q.trim()) return NextResponse.json({ recent: await recent(me.key) });
  return NextResponse.json(await search(me.v, q));
}

/** POST { q } — remember a search the person opened a result from. */
export async function POST(req: Request) {
  const me = await viewer();
  if (!me) return NextResponse.json({ error: "Sign in to search." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  await remember(me.key, String(b.q || ""));
  return NextResponse.json({ ok: true });
}
