import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { deleteBatchCompletely } from "../../../../../lib/deleteBatchCompletely";
import { writeAuditLog } from "../../../../../lib/audit";
import { withErrors } from "../../../../../lib/apiHandler";

export const maxDuration = 60;

// The batch's planned / current student count (Batches page). It sets how the batch is split into student sections for
// the timetable (Section A, B, … of at most the limit), so those are recomputed straight away.
async function PUT_handler(req: Request, { params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const batch = await prisma.batch.findUnique({ where: { id: params.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const studentCount = parseInt(body.studentCount, 10);
  if (isNaN(studentCount) || studentCount < 0 || studentCount > 5000) return NextResponse.json({ error: "studentCount must be a number from 0 to 5000" }, { status: 400 });
  const updated = await prisma.batch.update({ where: { id: batch.id }, data: { studentCount } });
  const { ensureBatchSections, getMaxSection } = await import("../../../../../lib/studentSections");
  const { timetableScopeFor } = await import("../../../../../lib/timetableScope");
  const max = await getMaxSection(user.managedById || "", (await timetableScopeFor(user)).key);
  const sections = await ensureBatchSections(batch.id, max).catch(() => []);
  await writeAuditLog({ actorUserId: user.id, action: "BATCH_STUDENT_COUNT_UPDATED", entityType: "Batch", entityId: batch.id, metadata: { studentCount, sections: sections.map((s) => `${s.label}:${s.size}`).join(" ") } });
  return NextResponse.json({ batch: updated, sections });
}

async function DELETE_handler(req: Request, { params }: { params: { batchId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const batch = await prisma.batch.findUnique({ where: { id: params.batchId } });
  if (!batch || batch.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await deleteBatchCompletely(params.batchId);
  await writeAuditLog({ actorUserId: user.id, action: "BATCH_DELETED", entityType: "Batch", entityId: params.batchId });

  return NextResponse.json({ ok: true });
}
export const PUT = withErrors(PUT_handler);
export const DELETE = withErrors(DELETE_handler);
