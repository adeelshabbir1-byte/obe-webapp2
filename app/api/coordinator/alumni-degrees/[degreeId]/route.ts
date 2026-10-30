import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { withErrors } from "../../../../../lib/apiHandler";

const ALLOWED_ROLES = ["PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR"];

async function DELETE_handler(req: Request, { params }: { params: { degreeId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);

  const degree = await prisma.alumniAdditionalDegree.findUnique({ where: { id: params.degreeId }, include: { alumni: true } });
  if (!degree || degree.alumni.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.alumniAdditionalDegree.delete({ where: { id: params.degreeId } });
  return NextResponse.json({ ok: true });
}
export const DELETE = withErrors(DELETE_handler);
