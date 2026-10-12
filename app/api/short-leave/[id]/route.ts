import { NextRequest, NextResponse } from "next/server";
import { getSignedInUser, getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { notifyUsers } from "../../../../lib/notifications";
import { sdb, canDecideLeave, type ShortLeaveRow, type SubRow } from "../../../../lib/shortLeave";

// POST { action: "approve" | "reject" | "cancel", note } — the Chairman decides; the teacher can withdraw it.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSignedInUser();
  const user = await getAuthenticatedUser();
  if (!me || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const l = (await sdb.shortLeave.findUnique({ where: { id: params.id } })) as ShortLeaveRow | null;
  if (!l) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const note = b.note ? String(b.note).slice(0, 500) : null;
  if (b.action === "cancel") {
    if (l.userId !== me.id) return NextResponse.json({ error: "Only you can withdraw your leave." }, { status: 403 });
    await sdb.shortLeave.update({ where: { id: l.id }, data: { status: "CANCELLED" } });
    const subs = (await sdb.substituteClass.findMany({ where: { leaveId: l.id } })) as SubRow[];
    await sdb.substituteClass.updateMany({ where: { leaveId: l.id }, data: { status: "CANCELLED" } });
    await notifyUsers(subs.map((s) => s.substituteId), { kind: "ASSIGNMENT", title: `Substitute class no longer needed`, body: `${me.name} withdrew their leave; you don't need to take their classes.`, href: "/my-leave" });
    return NextResponse.json({ ok: true });
  }
  if (!(await canDecideLeave(user, l))) return NextResponse.json({ error: "You can't decide this leave." }, { status: 403 });
  if (b.action !== "approve" && b.action !== "reject") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  const approve = b.action === "approve";
  await sdb.shortLeave.update({ where: { id: l.id }, data: { status: approve ? "APPROVED" : "REJECTED", approverId: user.id, decidedAt: new Date(), decisionNote: note } });
  if (!approve) await sdb.substituteClass.updateMany({ where: { leaveId: l.id }, data: { status: "CANCELLED" } });
  await writeAuditLog({ actorUserId: user.id, action: approve ? "SHORT_LEAVE_APPROVED" : "SHORT_LEAVE_REJECTED", entityType: "User", entityId: l.userId, metadata: { leaveId: l.id, note } });
  await notifyUsers([l.userId], { kind: "REQUEST", title: `Your leave was ${approve ? "approved" : "not approved"}`, body: `${user.name} ${approve ? "approved" : "did not approve"} your leave${note ? `: ${note}` : "."}`, href: "/my-leave" });
  return NextResponse.json({ ok: true });
}
