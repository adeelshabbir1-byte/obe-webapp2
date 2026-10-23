import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { writeAuditLog } from "../../../../lib/audit";
import { inviteToFdp } from "../../../../lib/feedbackAnalysis";
import { QEC_INCHARGE } from "../../../../lib/duties";

export const dynamic = "force-dynamic";

// POST { sessionId, userId, questionKey, scoreBefore } — invite a teacher to an FDP session because a feedback question
// scored low. The Institute Head, a Dean, a Chairman or the QEC In-charge.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !(["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role) || (user.extraRoles || []).includes(QEC_INCHARGE))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  const b = await req.json().catch(() => ({}));
  const teacher = await (await import("../../../../lib/db")).prisma.user.findFirst({ where: { id: String(b.userId || ""), OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }, select: { id: true } });
  if (!teacher) return NextResponse.json({ error: "Teacher not found." }, { status: 404 });
  try {
    await inviteToFdp(chairmanId, String(b.sessionId || ""), teacher.id, String(b.questionKey || ""), typeof b.scoreBefore === "number" ? b.scoreBefore : null);
    await writeAuditLog({ actorUserId: user.id, action: "FDP_INVITED_FROM_FEEDBACK", entityType: "User", entityId: teacher.id, metadata: { sessionId: String(b.sessionId || ""), question: String(b.questionKey || "") } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not invite." }, { status: 400 });
  }
}
