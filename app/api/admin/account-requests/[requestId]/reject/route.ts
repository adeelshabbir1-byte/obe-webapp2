import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { writeAuditLog } from "../../../../../../lib/audit";
import { adminCan } from "../../../../../../lib/platformTeam";
import { withErrors } from "../../../../../../lib/apiHandler";

async function POST_handler(req: NextRequest, { params }: { params: { requestId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !(await adminCan(user, "ONBOARDING"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const request = await prisma.accountRequest.findUnique({ where: { id: params.requestId } });
  if (!request) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (request.status !== "PENDING") return NextResponse.json({ error: `already ${request.status.toLowerCase()}` }, { status: 400 });

  await prisma.accountRequest.update({
    where: { id: request.id },
    data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: body.note || null },
  });

  await writeAuditLog({ actorUserId: user.id, action: "ACCOUNT_REQUEST_REJECTED", entityType: "AccountRequest", entityId: request.id, metadata: { note: body.note || "" } });

  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
