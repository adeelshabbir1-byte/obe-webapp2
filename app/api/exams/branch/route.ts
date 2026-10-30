import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { ebdb } from "../../../../lib/examBranch";
import { writeAuditLog } from "../../../../lib/audit";
import { notifyUsers } from "../../../../lib/notifications";
import { withErrors } from "../../../../lib/apiHandler";

// Institute Head: put staff in (or take them out of) the exam branch, which then runs exam sessions, duties and swaps.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "CHAIRMAN") return NextResponse.json({ error: "Only the Institute Head sets up the exam branch." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const target = await prisma.user.findFirst({ where: { id: String(b.userId || ""), isActive: true, OR: [{ managedById: user.id }, { managedBy: { managedById: user.id } }] }, select: { id: true, name: true } });
  if (!target) return NextResponse.json({ error: "Choose a staff member." }, { status: 400 });
  try {
    if (b.remove) await ebdb.examStaff.deleteMany({ where: { chairmanId: user.id, userId: target.id } });
    else { await ebdb.examStaff.upsert({ where: { chairmanId_userId: { chairmanId: user.id, userId: target.id } }, create: { chairmanId: user.id, userId: target.id }, update: {} }); await notifyUsers([target.id], { kind: "ASSIGNMENT", title: "You are in the exam branch", body: "You can now create exam sessions, the date sheet, rooms and invigilation duties.", href: "/exams" }); }
    await writeAuditLog({ actorUserId: user.id, action: b.remove ? "EXAM_BRANCH_REMOVED" : "EXAM_BRANCH_ADDED", entityType: "User", entityId: target.id });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Run prisma/migration_exam_branch.sql first." }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
