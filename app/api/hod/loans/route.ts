import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { lendableWhere, LoanKind } from "../../../../lib/loans";
import { writeAuditLog } from "../../../../lib/audit";

// The lending Chairman decides: allow some of their people for this course (the requester then picks one), or decline.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "HEAD_OF_DEPARTMENT") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const decision = body.decision;
  if (!body.loanId || (decision !== "APPROVE" && decision !== "REJECT")) return NextResponse.json({ error: "loanId and decision are required" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  if (decision === "REJECT" && !note) return NextResponse.json({ error: "please give a short reason for declining" }, { status: 400 });

  const chairmanId = user.managedById || "";
  const loan = await prisma.teacherLoanRequest.findFirst({ where: { id: body.loanId, status: "PENDING", lendingDepartmentId: user.departmentId || "none", chairmanId, requesterDeanStatus: { not: "PENDING" }, lenderDeanStatus: { not: "PENDING" } } });
  if (!loan) return NextResponse.json({ error: "request not found" }, { status: 404 });

  if (decision === "APPROVE") {
    const ids: string[] = Array.isArray(body.allowedIds) ? Array.from(new Set<string>(body.allowedIds.filter((x: unknown): x is string => typeof x === "string"))) : [];
    if (ids.length === 0) return NextResponse.json({ error: "choose at least one person you are allowing for this course" }, { status: 400 });
    const valid = await prisma.user.findMany({ where: { id: { in: ids }, ...lendableWhere(chairmanId, loan.kind as LoanKind, user.departmentId || "none") }, select: { id: true } });
    if (valid.length !== ids.length) return NextResponse.json({ error: "one of the chosen people is not in your department" }, { status: 400 });
    await prisma.teacherLoanAllowed.createMany({ data: valid.map((v: { id: string }) => ({ loanId: loan.id, instructorId: v.id })), skipDuplicates: true });
  }

  await prisma.teacherLoanRequest.update({
    where: { id: loan.id },
    data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", decidedById: user.id, decidedAt: new Date(), decisionNote: note || null },
  });
  await writeAuditLog({ actorUserId: user.id, action: decision === "APPROVE" ? "TEACHER_LOAN_APPROVED" : "TEACHER_LOAN_REJECTED", entityType: "Course", entityId: loan.courseId, metadata: { loanId: loan.id, kind: loan.kind, note } });
  return NextResponse.json({ ok: true });
}
