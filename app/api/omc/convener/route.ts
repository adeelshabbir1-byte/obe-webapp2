import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { convenerView, shareOut } from "../../../../lib/omcConvener";
import { notifyUsers } from "../../../../lib/notifications";
import { writeAuditLog } from "../../../../lib/audit";

// POST { action: "share" } | { action: "assign", courseId, reviewerId } — the department's OMC Convener shares out reviews.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { extraRoles: true, departmentId: true } });
  if (!(me?.extraRoles || []).includes("OMC_CONVENER")) return NextResponse.json({ error: "Only the department's OMC Convener does this." }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  const v = await convenerView({ ...user, departmentId: me?.departmentId }, chairmanId);
  if (!v) return NextResponse.json({ error: "Your account has no department." }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  if (b.action === "share") {
    const n = await shareOut(v);
    await notifyUsers(v.members.map((m) => m.id), { kind: "OMC", title: "OMC reviews shared out", body: `${n} course design(s) assigned by the OMC Convener.`, href: "/omc/queue", exceptId: user.id });
    await writeAuditLog({ actorUserId: user.id, action: "OMC_CONVENER_SHARED", metadata: { assigned: n } }).catch(() => null);
    return NextResponse.json({ ok: true, message: `${n} review(s) assigned.` });
  }
  if (b.action === "assign") {
    const c = v.courses.find((x) => x.id === String(b.courseId)), r = v.members.find((m) => m.id === String(b.reviewerId));
    if (!c || !r) return NextResponse.json({ error: "Choose a course and a member of your OMC." }, { status: 400 });
    await prisma.course.update({ where: { id: c.id }, data: { assignedOmcReviewerId: r.id } });
    await notifyUsers([r.id], { kind: "OMC", title: `Review assigned: ${c.code} ${c.title}`, href: "/omc/queue" });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
