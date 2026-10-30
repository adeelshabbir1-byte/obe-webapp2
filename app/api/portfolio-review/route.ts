import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { pdb } from "../../../lib/portfolio";
import { reviewBatchWhere } from "../../../lib/reviewScope";
import { withErrors } from "../../../lib/apiHandler";

// Staff verify (or un-verify) a student's portfolio entry.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const where = await reviewBatchWhere(user);
  if (!where) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const item = (await pdb.studentPortfolioItem.findUnique({ where: { id: String(b.id || "") } })) as { id: string; studentId: string } | null;
  if (!item || !(await prisma.student.count({ where: { id: item.studentId, batch: where } }))) return NextResponse.json({ error: "not found" }, { status: 404 });
  await pdb.studentPortfolioItem.update({ where: { id: item.id }, data: b.undo ? { verifiedAt: null, verifiedById: null } : { verifiedAt: new Date(), verifiedById: user.id } });
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
