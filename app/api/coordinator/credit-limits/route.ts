import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { minCreditsPerSemester: true, maxCreditsPerSemester: true } });
  return NextResponse.json({ minCreditsPerSemester: me?.minCreditsPerSemester ?? null, maxCreditsPerSemester: me?.maxCreditsPerSemester ?? null });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const min = body.minCreditsPerSemester === "" || body.minCreditsPerSemester === null ? null : parseInt(body.minCreditsPerSemester, 10);
  const max = body.maxCreditsPerSemester === "" || body.maxCreditsPerSemester === null ? null : parseInt(body.maxCreditsPerSemester, 10);
  if (min !== null && max !== null && min > max) return NextResponse.json({ error: "minimum can't be greater than maximum" }, { status: 400 });

  await prisma.user.update({ where: { id: user.id }, data: { minCreditsPerSemester: min, maxCreditsPerSemester: max } });
  return NextResponse.json({ ok: true, minCreditsPerSemester: min, maxCreditsPerSemester: max });
}
