import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { applyLoan } from "../../../../lib/loans";
import { writeAuditLog } from "../../../../lib/audit";

// The lending Head of Department says yes or no to lending one of their teachers.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "HEAD_OF_DEPARTMENT") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const decision = body.decision;
  if (!body.loanId || (decision !== "APPROVE" && decision !== "REJECT")) return NextResponse.json({ error: "loanId and decision are required" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  if (decision === "REJECT" && !note) return NextResponse.json({ error: "please give a short reason for declining" }, { status: 400 });

  const loan = await prisma.teacherLoanRequest.findFirst({ where: { id: body.loanId, status: "PENDING", lendingDepartmentId: user.departmentId || "none", chairmanId: user.managedById || "" } });
  if (!loan) return NextResponse.json({ error: "request not found" }, { status: 404 });

  await prisma.teacherLoanRequest.update({
    where: { id: loan.id },
    data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", decidedById: user.id, decidedAt: new Date(), decisionNote: note || null },
  });
  if (decision === "APPROVE") await applyLoan(loan.id, user.id);
  await writeAuditLog({ actorUserId: user.id, action: decision === "APPROVE" ? "TEACHER_LOAN_APPROVED" : "TEACHER_LOAN_REJECTED", entityType: "Course", entityId: loan.courseId, metadata: { loanId: loan.id, instructorId: loan.instructorId, note } });
  return NextResponse.json({ ok: true });
}
