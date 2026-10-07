import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { assignFromLoan, REQUEST_ROLES, LoanKind } from "../../../../lib/loans";

// After the lending head has allowed some people, the requester picks one of them for the course.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = user.role === "COURSE_ASSIGNER" ? user.managedById || "" : await chairmanIdFor(user);
  const body = await req.json().catch(() => ({}));
  if (!body.loanId || !body.instructorId) return NextResponse.json({ error: "loanId and instructorId are required" }, { status: 400 });

  const loan = await prisma.teacherLoanRequest.findFirst({ where: { id: body.loanId, chairmanId } });
  if (!loan) return NextResponse.json({ error: "request not found" }, { status: 404 });
  if (!REQUEST_ROLES[loan.kind as LoanKind].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (user.role === "HEAD_OF_DEPARTMENT" && loan.requestingDepartmentId !== user.departmentId) return NextResponse.json({ error: "request not found" }, { status: 404 });

  const error = await assignFromLoan(loan.id, body.instructorId, user.id);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
