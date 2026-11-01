import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/db";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { notifyUsers } from "../../../../../../lib/notifications";
import { writeAuditLog } from "../../../../../../lib/audit";
import { withErrors } from "../../../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// POST { courseId } — the advisor raises the out-of-batch request for a retake with another batch (Adeel prompt §21.5):
// the existing Out-of-Batch Requests, for the Program Lead of that course to approve. The student's own timetable is
// checked by the Program Lead when deciding (the clash check of registration applies on approval).
async function POST_handler(req: NextRequest, { params }: { params: { studentId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const s = await prisma.student.findUnique({ where: { id: params.studentId }, select: { id: true, name: true, batchId: true, batch: { select: { advisorId: true } } } });
  if (!s || s.batch?.advisorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const courseId = String(((await req.json().catch(() => ({}))) as { courseId?: string }).courseId || "");
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, isOffered: true, batchId: true, coordinatorId: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  if (!course || course.batchId === s.batchId) return NextResponse.json({ error: "Choose a course of another batch." }, { status: 400 });
  if (!course.isOffered) return NextResponse.json({ error: `${course.code} with ${course.batch?.batchName} isn't open for registration yet — raise the request when its term's registration opens.` }, { status: 409 });
  const existing = await prisma.outOfBatchRequest.findFirst({ where: { studentId: s.id, courseId, status: "PENDING" } });
  if (existing) return NextResponse.json({ error: "A request is already waiting." }, { status: 409 });
  await prisma.outOfBatchRequest.create({ data: { studentId: s.id, courseId, reason: `Retake raised by the advisor (${user.name}) — with ${course.batch?.degreeProgram} ${course.batch?.batchName}` } });
  await notifyUsers([course.coordinatorId], { kind: "OUT_OF_BATCH", title: `Retake request: ${s.name} — ${course.code}`, href: "/coordinator/out-of-batch-requests" }).catch(() => null);
  await writeAuditLog({ actorUserId: user.id, action: "RETAKE_REQUEST", entityType: "Student", entityId: s.id, metadata: { courseId } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
