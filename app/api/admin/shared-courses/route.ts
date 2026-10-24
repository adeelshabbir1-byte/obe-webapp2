import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { notifyUsers } from "../../../../lib/notifications";
import { adminCan } from "../../../../lib/platformTeam";

// POST { id, action: hide | restore, reason } — the Shared Courses Moderator takes a shared course down (spam,
// copyright, quality) or puts it back.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || !(await adminCan(user, "SHARED_MODERATOR"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const pc = await prisma.publicCourse.findUnique({ where: { id: String(b.id || "") }, select: { id: true, code: true, title: true, authorId: true, status: true } });
  if (!pc) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const reason = String(b.reason || b.note || "").trim().slice(0, 500);
  if (b.action === "hide") {
    if (reason.length < 5) return NextResponse.json({ error: "Say why it is taken down (the author sees this)." }, { status: 400 });
    await prisma.publicCourse.update({ where: { id: pc.id }, data: { status: "WITHDRAWN", reviewComment: `Taken down by the moderator: ${reason}`, reviewedById: user.id, reviewedAt: new Date() } });
    await notifyUsers([pc.authorId], { kind: "ASSIGNMENT", title: `Your shared course ${pc.code} was taken down`, body: reason, href: "/public-library" }).catch(() => null);
  } else if (b.action === "restore") {
    await prisma.publicCourse.update({ where: { id: pc.id }, data: { status: "PUBLIC", reviewComment: null, reviewedById: user.id, reviewedAt: new Date() } });
  } else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  await writeAuditLog({ actorUserId: user.id, action: b.action === "hide" ? "SHARED_COURSE_TAKEN_DOWN" : "SHARED_COURSE_RESTORED", entityType: "PublicCourse", entityId: pc.id, metadata: { reason } });
  return NextResponse.json({ ok: true, message: b.action === "hide" ? "Taken down; the author was told why." : "Back in the catalog." });
}
