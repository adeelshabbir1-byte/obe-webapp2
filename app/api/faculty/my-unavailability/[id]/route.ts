import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

const ALLOWED_ROLES = ["SUBJECT_EXPERT", "INSTRUCTOR"];

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const record = await prisma.facultyUnavailability.findUnique({ where: { id: params.id } });
  if (!record || record.facultyId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.facultyUnavailability.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
