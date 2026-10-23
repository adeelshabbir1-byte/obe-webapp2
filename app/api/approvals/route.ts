import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { notifyUsers } from "../../../lib/notifications";
import { whoIs, staffOf, rdb, str, dateOrNull } from "../../../lib/registers";
import { inboxFor, act, forgetCount, DEFAULT_SETTING } from "../../../lib/approvals/inbox";
import { allProviders } from "../../../lib/approvals/registry";

const HINT = "Run prisma/migration_approvals_inbox.sql in Supabase first.";

/** GET — everything waiting for the signed-in person (with counts by kind). */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const box = await inboxFor(user as never);
  const counts: Record<string, number> = {};
  for (const i of box.items) counts[i.kind] = (counts[i.kind] || 0) + 1;
  return NextResponse.json({ ...box, counts, total: box.items.length });
}

/**
 * POST { action, ... }
 *   decide { kind, id, decision: "approve" | "return", reason }        bulk { items: [{ kind, id }] } — safe kinds only
 *   delegate { toUserId, startDate, endDate, note, fromUserId? }        revoke { id }
 *   setting { kind, remindAfterDays, escalateAfterDays } — the Institute Head
 */
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const action = str(b.action);

  if (action === "decide") {
    const decision = b.decision === "return" ? "return" : "approve";
    const r = await act(user as never, str(b.kind), str(b.id), decision, str(b.reason), req);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  if (action === "bulk") {
    const list = (Array.isArray(b.items) ? b.items : []).slice(0, 50) as { kind: string; id: string }[];
    const safe = new Set(allProviders().filter((p) => p.bulk).map((p) => p.kind));
    let done = 0; const errors: string[] = [];
    for (const it of list) {
      if (!safe.has(it.kind)) { errors.push(`${it.kind}: decide one by one`); continue; }
      const r = await act(user as never, it.kind, it.id, "approve", "", req);
      if (r.ok) done++; else errors.push(r.error || "refused");
    }
    return NextResponse.json({ ok: true, done, errors });
  }

  if (action === "delegate") {
    const from = str(b.fromUserId) || user.id;
    if (from !== user.id && !w.head) return NextResponse.json({ error: "Only the Institute Head can set a delegation for someone else." }, { status: 403 });
    const staff = await staffOf(w.chairmanId);
    const to = str(b.toUserId);
    if (!staff.some((s) => s.id === to) || to === from) return NextResponse.json({ error: "Choose a colleague in your institute." }, { status: 400 });
    if (from !== user.id && !staff.some((s) => s.id === from)) return NextResponse.json({ error: "Choose a colleague in your institute." }, { status: 400 });
    const start = dateOrNull(b.startDate), end = dateOrNull(b.endDate);
    if (!start || !end || end < start) return NextResponse.json({ error: "Give the first and last day (the last day on or after the first)." }, { status: 400 });
    end.setHours(23, 59, 59, 999);
    try {
      const row = await rdb.approvalDelegation.create({ data: { id: randomUUID(), chairmanId: w.chairmanId, fromUserId: from, toUserId: to, startDate: start, endDate: end, note: str(b.note).slice(0, 300) || null, createdById: user.id } });
      const fromName = staff.find((s) => s.id === from)?.name || user.name;
      await writeAuditLog({ actorUserId: user.id, action: "APPROVAL_DELEGATED", entityType: "ApprovalDelegation", entityId: row.id, metadata: { from, to, start: start.toISOString(), end: end.toISOString() } });
      await notifyUsers([to], { kind: "APPROVAL_DELEGATION", title: `${fromName} has handed you their approvals`, body: `From ${start.toLocaleDateString("en-GB")} to ${end.toLocaleDateString("en-GB")}. Their items appear in My Approvals, marked "on behalf of ${fromName}".`, href: "/approvals" });
      forgetCount(to);
      return NextResponse.json({ ok: true });
    } catch { return NextResponse.json({ error: HINT }, { status: 500 }); }
  }

  if (action === "revoke") {
    try {
      const d = await rdb.approvalDelegation.findUnique({ where: { id: str(b.id) } });
      if (!d || d.chairmanId !== w.chairmanId || (d.fromUserId !== user.id && d.toUserId !== user.id && !w.head)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      await rdb.approvalDelegation.update({ where: { id: d.id }, data: { revokedAt: new Date() } });
      await writeAuditLog({ actorUserId: user.id, action: "APPROVAL_DELEGATION_ENDED", entityType: "ApprovalDelegation", entityId: d.id, metadata: {} });
      forgetCount(d.toUserId);
      return NextResponse.json({ ok: true });
    } catch { return NextResponse.json({ error: HINT }, { status: 500 }); }
  }

  if (action === "setting") {
    if (!w.head) return NextResponse.json({ error: "Only the Institute Head sets reminder and escalation days." }, { status: 403 });
    const kind = str(b.kind);
    if (!allProviders().some((p) => p.kind === kind)) return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
    const remind = Math.max(1, Math.min(60, Math.round(Number(b.remindAfterDays) || DEFAULT_SETTING.remindAfterDays)));
    const esc = Math.max(remind, Math.min(90, Math.round(Number(b.escalateAfterDays) || DEFAULT_SETTING.escalateAfterDays)));
    try {
      await rdb.approvalSetting.upsert({ where: { chairmanId_kind: { chairmanId: w.chairmanId, kind } }, create: { id: randomUUID(), chairmanId: w.chairmanId, kind, remindAfterDays: remind, escalateAfterDays: esc }, update: { remindAfterDays: remind, escalateAfterDays: esc } });
      await writeAuditLog({ actorUserId: user.id, action: "APPROVAL_SETTING_SAVED", entityType: "ApprovalSetting", entityId: kind, metadata: { remind, esc } });
      return NextResponse.json({ ok: true });
    } catch { return NextResponse.json({ error: HINT }, { status: 500 }); }
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
