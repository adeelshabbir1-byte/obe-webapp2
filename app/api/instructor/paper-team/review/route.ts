import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { loadTeams, syncApprovedPaper } from "../../../../../lib/courseTeams";
import { writeAuditLog } from "../../../../../lib/audit";

// Another teacher of the course approves the Course Lead's paper, or asks for changes (a note is required).
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "INSTRUCTOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const approve = body.decision === "APPROVE";
  if (!body.submissionId || (!approve && body.decision !== "CHANGES")) return NextResponse.json({ error: "submissionId and decision are required" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 400) : "";
  if (!approve && !note) return NextResponse.json({ error: "please say what should change" }, { status: 400 });

  const chairmanId = await chairmanIdFor(user);
  const sub = await prisma.paperSubmission.findFirst({ where: { id: body.submissionId, chairmanId } });
  if (!sub) return NextResponse.json({ error: "paper not found" }, { status: 404 });
  const team = (await loadTeams(chairmanId)).find((t) => t.key === sub.teamKey);
  if (!team || !team.teachers.some((t) => t.id === user.id) || user.id === sub.leadId) return NextResponse.json({ error: "you are not a reviewer of this paper" }, { status: 403 });
  if (sub.status === "APPROVED") return NextResponse.json({ error: "this paper is already approved" }, { status: 400 });

  await prisma.paperApproval.upsert({
    where: { submissionId_userId: { submissionId: sub.id, userId: user.id } },
    create: { submissionId: sub.id, userId: user.id, status: approve ? "APPROVED" : "CHANGES_REQUESTED", note: note || null },
    update: { status: approve ? "APPROVED" : "CHANGES_REQUESTED", note: note || null, decidedAt: new Date() },
  });
  const approvals = await prisma.paperApproval.findMany({ where: { submissionId: sub.id } });
  const reviewers = team.teachers.filter((t) => t.id !== sub.leadId);
  let status = "SUBMITTED";
  if (approvals.some((a) => a.status === "CHANGES_REQUESTED")) status = "CHANGES_REQUESTED";
  else if (reviewers.every((r) => approvals.some((a) => a.userId === r.id && a.status === "APPROVED"))) status = "APPROVED";
  await prisma.paperSubmission.update({ where: { id: sub.id }, data: { status, approvedAt: status === "APPROVED" ? new Date() : null } });
  if (status === "APPROVED") await syncApprovedPaper(team, sub.leadCourseId, sub.examType);
  await writeAuditLog({ actorUserId: user.id, action: approve ? "PAPER_APPROVED" : "PAPER_CHANGES_REQUESTED", entityType: "Course", entityId: sub.leadCourseId, metadata: { examType: sub.examType, version: sub.version, status } });
  return NextResponse.json({ ok: true, status });
}
