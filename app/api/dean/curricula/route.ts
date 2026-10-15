import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

// The Dean's sign-off (or "returned for changes") on one of the institute's curricula for their faculty.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "DEAN" || !user.facultyId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.curriculumId || (body.status !== "APPROVED" && body.status !== "RETURNED")) return NextResponse.json({ error: "curriculumId and status are required" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  if (body.status === "RETURNED" && !note) return NextResponse.json({ error: "please say what needs to change" }, { status: 400 });
  const curriculum = await prisma.masterCurriculum.findFirst({ where: { id: body.curriculumId, chairmanId: user.managedById || "none" } });
  if (!curriculum) return NextResponse.json({ error: "curriculum not found" }, { status: 404 });
  // A sign-off is only taken after the Dean has opened the curriculum (recorded when the review page is shown).
  const opened = await prisma.auditLog.findFirst({ where: { actorUserId: user.id, action: "DEAN_CURRICULUM_OPENED", entityId: curriculum.id }, select: { id: true } });
  if (!opened) return NextResponse.json({ error: "Open the curriculum and review it before approving or returning it." }, { status: 409 });
  await prisma.curriculumDeanApproval.upsert({
    where: { facultyId_curriculumId: { facultyId: user.facultyId, curriculumId: curriculum.id } },
    create: { facultyId: user.facultyId, curriculumId: curriculum.id, status: body.status, note: note || null, decidedById: user.id },
    update: { status: body.status, note: note || null, decidedById: user.id, decidedAt: new Date() },
  });
  await writeAuditLog({ actorUserId: user.id, action: "DEAN_CURRICULUM_" + body.status, entityType: "MasterCurriculum", entityId: curriculum.id, metadata: { note } });
  return NextResponse.json({ ok: true });
}
