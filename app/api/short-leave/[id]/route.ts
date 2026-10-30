import { NextRequest, NextResponse } from "next/server";
import { getSignedInUser, getAuthenticatedUser } from "../../../../lib/session";
import { writeAuditLog } from "../../../../lib/audit";
import { notifyUsers } from "../../../../lib/notifications";
import { sdb, canDecideLeave, type ShortLeaveRow, type SubRow } from "../../../../lib/shortLeave";
import { prisma } from "../../../../lib/db";
import { details, policies, setDetail } from "../../../../lib/leaveRules";
import { approverFor } from "../../../../lib/approvers";
import { withErrors } from "../../../../lib/apiHandler";

// POST { action: "approve" | "reject" | "cancel", note } — the Chairman decides; the teacher can withdraw it.
async function POST_handler(req: NextRequest, { params }: { params: { id: string } }) {
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
  if (b.action !== "approve" && b.action !== "reject") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  const approve = b.action === "approve";
  const det = (await details([l.id])).get(l.id);
  const pol = det ? (await policies(l.chairmanId)).find((p) => p.kind === det.kind) : null;
  const teacherDept = (await prisma.user.findUnique({ where: { id: l.userId }, select: { departmentId: true } }))?.departmentId || null;
  const deanStep = await approverFor(l.chairmanId, "DEAN", { departmentId: teacherDept });
  if (user.role === "DEAN" || (det?.deanStatus === "PENDING" && deanStep.ids.includes(user.id))) {
    // The Dean's step: only for types that need it, after the HOD, for teachers of the Dean's faculty (or whoever acts
    // for or covers the Dean).
    const t = await prisma.user.findUnique({ where: { id: l.userId }, select: { department_: { select: { facultyId: true } } } });
    const isDean = user.role === "DEAN" && user.managedById === l.chairmanId && !!user.facultyId && t?.department_?.facultyId === user.facultyId;
    if (!det || det.deanStatus !== "PENDING" || !(isDean || deanStep.ids.includes(user.id))) return NextResponse.json({ error: "This leave is not waiting for the Dean." }, { status: 403 });
    await setDetail(l.id, { deanStatus: approve ? "APPROVED" : "REJECTED", deanId: user.id, deanAt: new Date(), deanNote: note });
  } else {
    if (!(await canDecideLeave(user, l))) return NextResponse.json({ error: "You can't decide this leave." }, { status: 403 });
    if (approve) {
      const open = await sdb.substituteClass.count({ where: { leaveId: l.id, status: { in: ["NEEDED", "DECLINED"] } } });
      if (open) return NextResponse.json({ error: `Arrange cover for ${open} class(es) first — a substitute, a make-up date, or cancel the class.` }, { status: 409 });
    }
    if (approve && det && pol?.needsDean && user.role === "HEAD_OF_DEPARTMENT" && det.deanStatus !== "APPROVED") {
      await setDetail(l.id, { deanStatus: "PENDING", hodId: user.id, hodAt: new Date() });
      const t = await prisma.user.findUnique({ where: { id: l.userId }, select: { name: true } });
      // The Dean, or whoever acts for or covers the Dean — unless that is this HoD themself (then the step is done).
      const deans = deanStep.ids.filter((id) => id !== user.id && id !== l.userId).map((id) => ({ id }));
      if (deans.length) {
        await notifyUsers(deans.map((d) => d.id), { kind: "REQUEST", title: `${pol.label} for ${t?.name}: HOD approved, needs the Dean`, body: `${det.days} working day(s).`, href: "/leave-approvals" });
        await notifyUsers([l.userId], { kind: "REQUEST", title: "Your leave: HOD approved, now with the Dean", href: "/my-leave" });
        return NextResponse.json({ ok: true, waiting: "DEAN" });
      }
    }
    if (det) await setDetail(l.id, { hodId: user.id, hodAt: new Date() });
  }
  await sdb.shortLeave.update({ where: { id: l.id }, data: { status: approve ? "APPROVED" : "REJECTED", approverId: user.id, decidedAt: new Date(), decisionNote: note } });
  if (!approve) await sdb.substituteClass.updateMany({ where: { leaveId: l.id }, data: { status: "CANCELLED" } });
  await writeAuditLog({ actorUserId: user.id, action: approve ? "SHORT_LEAVE_APPROVED" : "SHORT_LEAVE_REJECTED", entityType: "User", entityId: l.userId, metadata: { leaveId: l.id, note } });
  await notifyUsers([l.userId], { kind: "REQUEST", title: `Your leave was ${approve ? "approved" : "not approved"}`, body: `${user.name} ${approve ? "approved" : "did not approve"} your leave${note ? `: ${note}` : "."}`, href: "/my-leave" });
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
