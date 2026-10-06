import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { writeAuditLog } from "../../../../../lib/audit";

// The author's own coordinator approves or rejects a course before it becomes public.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const pc = await prisma.publicCourse.findUnique({ where: { id: params.id }, include: { author: { select: { managedById: true } } } });
  if (!pc || pc.author.managedById !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (pc.status !== "PENDING") return NextResponse.json({ error: "this course isn't waiting for review" }, { status: 409 });

  const body = await req.json();
  const approve = body?.decision === "APPROVE";
  if (!approve && body?.decision !== "REJECT") return NextResponse.json({ error: "decision must be APPROVE or REJECT" }, { status: 400 });
  const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, 2000) : "";
  if (!approve && !comment) return NextResponse.json({ error: "please say why it was rejected so the author can fix it" }, { status: 400 });

  await prisma.publicCourse.update({ where: { id: pc.id }, data: { status: approve ? "PUBLIC" : "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewComment: comment || null } });
  await writeAuditLog({ actorUserId: user.id, action: approve ? "PUBLIC_COURSE_APPROVED" : "PUBLIC_COURSE_REJECTED", entityType: "PublicCourse", entityId: pc.id });
  return NextResponse.json({ ok: true });
}
