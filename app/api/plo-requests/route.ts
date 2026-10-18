import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { pdb, canRequest, notifyOmc } from "../../../lib/ploRequests";

// POST { courseId, ploId, action: ADD | REMOVE, reason } — the course's Subject Expert or Instructor asks the OMC.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const action = b.action === "REMOVE" ? "REMOVE" : b.action === "ADD" ? "ADD" : null;
  const reason = String(b.reason || "").trim().slice(0, 2000);
  if (!action || !b.courseId || !b.ploId) return NextResponse.json({ error: "Choose a GA." }, { status: 400 });
  if (reason.length < 10) return NextResponse.json({ error: "Tell the OMC why (at least a sentence)." }, { status: 400 });
  const c = await canRequest(user, String(b.courseId));
  if (!c) return NextResponse.json({ error: "Only this course's Subject Expert or Instructor can ask." }, { status: 403 });
  const plo = await prisma.pLO.findUnique({ where: { id: String(b.ploId) }, select: { id: true, number: true, batchId: true } });
  if (!plo || plo.batchId !== c.batchId) return NextResponse.json({ error: "That GA is not one of this batch's GAs." }, { status: 400 });
  const on = !!(await prisma.coursePloMapping.findUnique({ where: { courseId_ploId: { courseId: String(b.courseId), ploId: plo.id } } }));
  if (action === "ADD" && on) return NextResponse.json({ error: `GA-${plo.number} is already on this course.` }, { status: 400 });
  if (action === "REMOVE" && !on) return NextResponse.json({ error: `GA-${plo.number} is not on this course.` }, { status: 400 });
  const chairmanId = c.coordinator?.managedById || "";
  try {
    const dup = await pdb.ploChangeRequest.findFirst({ where: { courseId: String(b.courseId), ploId: plo.id, status: "PENDING" } });
    if (dup) return NextResponse.json({ error: `A request about GA-${plo.number} is already waiting for the OMC.` }, { status: 400 });
    const row = await pdb.ploChangeRequest.create({ data: { chairmanId, courseId: String(b.courseId), ploId: plo.id, action, reason, requestedById: user.id, requestedAs: user.role } });
    const course = await prisma.course.findUnique({ where: { id: String(b.courseId) }, select: { code: true, title: true } });
    await writeAuditLog({ actorUserId: user.id, action: "PLO_REQUEST_MADE", entityType: "Course", entityId: String(b.courseId), metadata: { requestId: row.id, action, ploNumber: plo.number } });
    await notifyOmc(chairmanId, `${user.name} asks to ${action === "ADD" ? "add" : "remove"} GA-${plo.number} ${action === "ADD" ? "to" : "from"} ${course?.code}`, `${course?.title}: ${reason}`);
    return NextResponse.json({ ok: true, id: row.id });
  } catch {
    return NextResponse.json({ error: "The GA request table is not in the database yet — run prisma/migration_plo_requests.sql in Supabase." }, { status: 500 });
  }
}
