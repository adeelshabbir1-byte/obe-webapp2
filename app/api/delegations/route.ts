import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { delegate, given, heldBy, revoke, tasksOf, TASKS } from "../../../lib/delegation";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// My delegations (Adeel prompt §13). GET: given and received, and the tasks my role can delegate.
// POST { kind, toUserId, tasks[], scope{chains[]}, maxLeaveDays, startAt, endAt, mayPassOn, shared, note, parentId } — delegate.
// DELETE ?id= — revoke (the delegator only; passed-on copies end too).
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [g, r] = await Promise.all([given(user.id), heldBy(user.id)]);
  const ids = Array.from(new Set([...g.map((x) => x.toUserId), ...r.map((x) => x.fromUserId)]));
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids.concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const label = (k: string) => TASKS.find((t) => t.key === k)?.label || k;
  const shape = (x: (typeof g)[number]) => ({ ...x, tasks: (JSON.parse(x.tasksJson) as string[]).map((k) => ({ key: k, label: label(k) })), scope: JSON.parse(x.scopeJson), to: names.get(x.toUserId) || "", from: names.get(x.fromUserId) || "", active: !x.revokedAt && x.endAt > new Date() && x.startAt <= new Date() });
  return NextResponse.json({ given: g.map(shape), received: r.map(shape), mine: tasksOf(user.role), never: TASKS.filter((t) => !t.delegable) });
}
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; toUserId?: string; tasks?: string[]; scope?: { chains?: number[] }; maxLeaveDays?: number; startAt?: string; endAt?: string; mayPassOn?: boolean; shared?: boolean; note?: string; parentId?: string };
  if (!b.toUserId || !b.endAt) return NextResponse.json({ error: "Choose a person and an end date." }, { status: 400 });
  const to = await prisma.user.findUnique({ where: { id: b.toUserId }, select: { id: true, isActive: true } });
  if (!to?.isActive) return NextResponse.json({ error: "That person isn't active." }, { status: 400 });
  const cid = await chairmanIdFor(user as never);
  try {
    const id = await delegate({ id: user.id, role: user.role, name: user.name }, cid, {
      kind: b.kind === "ACTING" ? "ACTING" : "TASKS", toUserId: b.toUserId, tasks: b.kind === "ACTING" ? tasksOf(user.role).map((t) => t.key) : (b.tasks || []),
      scope: { chains: (b.scope?.chains || []).filter((n) => Number.isInteger(n)), departmentId: user.departmentId || null },
      maxLeaveDays: b.maxLeaveDays ? Number(b.maxLeaveDays) : null, startAt: b.startAt ? new Date(b.startAt) : new Date(), endAt: new Date(b.endAt),
      mayPassOn: !!b.mayPassOn, shared: !!b.shared, note: (b.note || "").slice(0, 300), parentId: b.parentId || null,
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
async function DELETE_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try { await revoke(user.id, String(req.nextUrl.searchParams.get("id") || "")); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
export const DELETE = withErrors(DELETE_handler);
