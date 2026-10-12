import { NextRequest, NextResponse } from "next/server";
import { getSignedInUser, getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { notifyUsers } from "../../../../../lib/notifications";
import { sdb, canDecideLeave, type ShortLeaveRow, type SubRow } from "../../../../../lib/shortLeave";

const day = (d: Date) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// POST — arrange one class of a leave:
//   { action: "assign", substituteId }  (Chairman, or the teacher proposing a colleague)
//   { action: "makeup", makeupDate } | { action: "cancel" }  (Chairman or the teacher)
//   { action: "accept" | "decline" }  (the substitute)
//   { action: "done", topic }  (the substitute, or the teacher for a make-up class)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSignedInUser();
  const user = await getAuthenticatedUser();
  if (!me || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const c = (await sdb.substituteClass.findUnique({ where: { id: params.id } })) as SubRow | null;
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const l = (await sdb.shortLeave.findUnique({ where: { id: c.leaveId } })) as ShortLeaveRow | null;
  if (!l || l.status === "REJECTED" || l.status === "CANCELLED") return NextResponse.json({ error: "This leave is not active." }, { status: 409 });
  const b = await req.json().catch(() => ({}));
  const decider = await canDecideLeave(user, l);
  const owner = me.id === l.userId;
  const what = `${c.courseCode} ${c.sectionLabel}, ${day(c.date)} ${c.timeLabel}, ${c.roomName}`;
  const teacher = (await prisma.user.findUnique({ where: { id: l.userId }, select: { name: true } }))?.name || "a colleague";

  if (b.action === "assign") {
    if (!decider && !owner) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const sid = String(b.substituteId || "");
    if (!sid || sid === l.userId) return NextResponse.json({ error: "Choose a substitute." }, { status: 400 });
    await sdb.substituteClass.update({ where: { id: c.id }, data: { plan: "SUBSTITUTE", substituteId: sid, status: "ASSIGNED", makeupDate: null } });
    if (c.substituteId && c.substituteId !== sid) await notifyUsers([c.substituteId], { kind: "ASSIGNMENT", title: "Substitute class given to someone else", body: what, href: "/my-leave" });
    await notifyUsers([sid], { kind: "ASSIGNMENT", title: `Please take a class for ${teacher}`, body: `${what}. Accept or decline it on Short Leave.`, href: "/my-leave" });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "makeup" || b.action === "cancel") {
    if (!decider && !owner) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const md = b.action === "makeup" ? new Date(`${b.makeupDate}T00:00:00Z`) : null;
    if (b.action === "makeup" && (!md || isNaN(md.getTime()))) return NextResponse.json({ error: "Choose the make-up date." }, { status: 400 });
    if (c.substituteId) await notifyUsers([c.substituteId], { kind: "ASSIGNMENT", title: "Substitute class no longer needed", body: what, href: "/my-leave" });
    await sdb.substituteClass.update({ where: { id: c.id }, data: { plan: b.action === "makeup" ? "MAKEUP" : "CANCEL", substituteId: null, status: b.action === "makeup" ? "MAKEUP_SET" : "CANCELLED", makeupDate: md, note: b.note ? String(b.note).slice(0, 300) : null } });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "accept" || b.action === "decline") {
    if (c.substituteId !== me.id) return NextResponse.json({ error: "This class wasn't given to you." }, { status: 403 });
    await sdb.substituteClass.update({ where: { id: c.id }, data: { status: b.action === "accept" ? "ACCEPTED" : "DECLINED", ...(b.action === "decline" ? { substituteId: null } : {}) } });
    await notifyUsers([l.userId, l.approverId], { kind: "ASSIGNMENT", title: `${me.name} ${b.action === "accept" ? "will take" : "can't take"} ${c.courseCode} on ${day(c.date)}`, body: what, href: "/leave-approvals", exceptId: me.id });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "done") {
    if (c.substituteId !== me.id && !(owner && c.plan === "MAKEUP")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    await sdb.substituteClass.update({ where: { id: c.id }, data: { status: "DONE", topic: b.topic ? String(b.topic).slice(0, 300) : null } });
    if (c.substituteId === me.id) await notifyUsers([l.userId], { kind: "REQUEST", title: `${me.name} took your ${c.courseCode} class`, body: `${what}${b.topic ? ` — covered: ${b.topic}` : ""}. Log it in your lecture content.`, href: "/my-leave" });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
