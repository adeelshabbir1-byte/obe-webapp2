import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { notifyUsers } from "../../../../lib/notifications";

const STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "DISMISSED"];
const MANAGERS = ["OMC", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN", "CHAIRMAN", "DEPARTMENT_COORDINATOR"];
const ASSIGNERS = ["OMC", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"];

// Record what was done about a topic follow-up (the teacher of the target course, or the teacher assigned to it),
// or assign a teacher to run the tutorial / extra class (OMC, Program Lead, Chairman, Institute Head).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const f = await prisma.topicFollowUp.findUnique({ where: { id: params.id } }).catch(() => null);
  const chairmanId = await chairmanIdFor(user);
  if (!f || f.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));

  const mine = await prisma.course.findMany({ where: { OR: [{ instructorId: user.id }, { subjectExpertId: user.id }] }, select: { id: true, code: true, coordinatorId: true } });
  const actsOn = f.assignedToId === user.id
    || (!!f.targetCourseId && mine.some((c) => c.id === f.targetCourseId))
    || (!f.targetCourseId && mine.some((c) => c.code === f.targetCourseCode && c.coordinatorId === f.coordinatorId && c.id !== f.sourceCourseId));
  const manager = MANAGERS.includes(user.role);
  const data: Record<string, unknown> = {};

  if (b.assignedToId !== undefined) {
    if (!ASSIGNERS.includes(user.role)) return NextResponse.json({ error: "Only the OMC, the Program Lead or the Chairman assigns a teacher." }, { status: 403 });
    if (b.assignedToId) {
      const t = await prisma.user.findUnique({ where: { id: String(b.assignedToId) }, select: { id: true, role: true, managedById: true, isActive: true } });
      if (!t || !t.isActive || (await chairmanIdFor(t)) !== chairmanId) return NextResponse.json({ error: "Choose a teacher of your institute." }, { status: 400 });
      data.assignedToId = t.id;
      if (f.status === "OPEN") data.status = "IN_PROGRESS";
    } else data.assignedToId = null;
  }

  if (b.status !== undefined || b.actionTaken !== undefined) {
    if (!actsOn && !manager) return NextResponse.json({ error: "Only the teacher this follow-up is for (or the OMC / Program Lead) can update it." }, { status: 403 });
    const action = typeof b.actionTaken === "string" ? b.actionTaken.trim().slice(0, 2000) : undefined;
    const status = b.status !== undefined ? String(b.status) : undefined;
    if (status && !STATUSES.includes(status)) return NextResponse.json({ error: "unknown status" }, { status: 400 });
    if ((status === "DONE" || status === "DISMISSED") && !(action ?? f.actionTaken)) {
      return NextResponse.json({ error: status === "DONE" ? "Write down what was done (e.g. the tutorial held and how students did)." : "Say why it is being dismissed." }, { status: 400 });
    }
    if (action !== undefined && action !== (f.actionTaken || "")) { data.actionTaken = action || null; data.actionById = user.id; data.actionAt = new Date(); }
    if (status) data.status = status;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "nothing to change" }, { status: 400 });

  const updated = await prisma.topicFollowUp.update({ where: { id: f.id }, data });
  await writeAuditLog({ actorUserId: user.id, action: "TOPIC_FOLLOW_UP_UPDATED", entityType: "TopicFollowUp", entityId: f.id, metadata: { status: updated.status, assignedToId: updated.assignedToId || "" } });
  if (data.assignedToId && data.assignedToId !== f.assignedToId) {
    await notifyUsers([String(data.assignedToId)], { kind: "FOLLOW_UP", title: `You are asked to cover "${f.targetTopic || f.topic}" (${f.targetCourseCode})`, body: f.recommendation, href: "/follow-ups", exceptId: user.id });
  }
  if (updated.status === "DONE" && f.status !== "DONE") {
    await notifyUsers([f.createdById], { kind: "FOLLOW_UP", title: `Follow-up done: "${f.topic}" (${f.targetCourseCode})`, body: updated.actionTaken || "", href: "/follow-ups", exceptId: user.id });
  }
  return NextResponse.json({ followUp: updated });
}
