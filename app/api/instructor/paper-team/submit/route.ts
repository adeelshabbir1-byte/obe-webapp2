import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { loadTeams, syncApprovedPaper } from "../../../../../lib/courseTeams";
import { writeAuditLog } from "../../../../../lib/audit";

// The Course Lead sends the finished paper (Midterm or Final) to the other teachers of the course for approval.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "INSTRUCTOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const examType = body.examType === "Midterm" || body.examType === "Final" ? body.examType : null;
  if (!examType || !body.leadCourseId) return NextResponse.json({ error: "choose the course and the paper (Midterm or Final)" }, { status: 400 });

  const chairmanId = await chairmanIdFor(user);
  const team = (await loadTeams(chairmanId)).find((t) => t.rows.some((r) => r.courseId === body.leadCourseId));
  if (!team) return NextResponse.json({ error: "course team not found" }, { status: 404 });
  if (team.leadId !== user.id) return NextResponse.json({ error: "only the Course Lead can send the paper for approval" }, { status: 403 });
  const row = team.rows.find((r) => r.courseId === body.leadCourseId)!;
  if (!row.teachers.some((t) => t.id === user.id)) return NextResponse.json({ error: "choose one of your own sections" }, { status: 400 });

  const items = await prisma.paperDistributionItem.count({ where: { courseId: row.courseId, source: "INSTRUCTOR", examType } });
  if (items === 0) return NextResponse.json({ error: `Set up the ${examType} paper first (Paper Distribution) - there are no questions yet.` }, { status: 400 });

  const others = team.teachers.filter((t) => t.id !== user.id);
  const existing = await prisma.paperSubmission.findUnique({ where: { chairmanId_teamKey_examType: { chairmanId, teamKey: team.key, examType } } });
  const alone = others.length === 0;
  const data = { leadCourseId: row.courseId, leadId: user.id, status: alone ? "APPROVED" : "SUBMITTED", submittedAt: new Date(), approvedAt: alone ? new Date() : null };
  const submission = existing
    ? await prisma.paperSubmission.update({ where: { id: existing.id }, data: { ...data, version: existing.version + 1 } })
    : await prisma.paperSubmission.create({ data: { chairmanId, teamKey: team.key, examType, ...data } });
  if (existing) await prisma.paperApproval.deleteMany({ where: { submissionId: existing.id } });
  if (alone) await syncApprovedPaper(team, row.courseId, examType);
  await writeAuditLog({ actorUserId: user.id, action: "PAPER_SUBMITTED_FOR_APPROVAL", entityType: "Course", entityId: row.courseId, metadata: { examType, version: submission.version } });
  return NextResponse.json({ ok: true, version: submission.version });
}
