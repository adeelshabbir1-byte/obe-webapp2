import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";

const ALLOWED_ROLES = ["PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR"];

export async function DELETE(req: Request, { params }: { params: { alumniId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);

  const alum = await prisma.alumni.findUnique({ where: { id: params.alumniId } });
  if (!alum || alum.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.alumni.delete({ where: { id: params.alumniId } });
  return NextResponse.json({ ok: true });
}
