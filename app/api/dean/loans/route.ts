import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

// A Dean answers a teacher request that involves their faculty. Approving lets it carry on to the lending Chairman;
// declining ends it (a short reason is required).
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "DEAN" || !user.facultyId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const decision = body.decision;
  if (!body.loanId || (decision !== "APPROVE" && decision !== "REJECT")) return NextResponse.json({ error: "loanId and decision are required" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  if (decision === "REJECT" && !note) return NextResponse.json({ error: "please give a short reason for declining" }, { status: 400 });

  const loan = await prisma.teacherLoanRequest.findFirst({
    where: {
      id: body.loanId, chairmanId: user.managedById || "", status: { in: ["PENDING", "APPROVED"] },
      OR: [{ requesterDeanStatus: "PENDING", requestingDepartment: { facultyId: user.facultyId } }, { lenderDeanStatus: "PENDING", lendingDepartment: { facultyId: user.facultyId } }],
    },
    include: { requestingDepartment: { select: { facultyId: true } } },
  });
  if (!loan) return NextResponse.json({ error: "request not found" }, { status: 404 });

  const asRequester = loan.requesterDeanStatus === "PENDING" && loan.requestingDepartment.facultyId === user.facultyId;
  const verdict = decision === "APPROVE" ? "APPROVED" : "REJECTED";
  await prisma.teacherLoanRequest.update({
    where: { id: loan.id },
    data: {
      ...(asRequester ? { requesterDeanStatus: verdict } : { lenderDeanStatus: verdict }),
      ...(decision === "REJECT" ? { status: "REJECTED", decidedById: user.id, decidedAt: new Date(), decisionNote: `Dean: ${note}` } : {}),
    },
  });
  await writeAuditLog({ actorUserId: user.id, action: decision === "APPROVE" ? "DEAN_LOAN_APPROVED" : "DEAN_LOAN_REJECTED", entityType: "Course", entityId: loan.courseId, metadata: { loanId: loan.id, note } });
  return NextResponse.json({ ok: true });
}
