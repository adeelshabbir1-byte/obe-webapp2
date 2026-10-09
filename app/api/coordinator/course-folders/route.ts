import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const course = await prisma.course.findFirst({ where: { id: String(b.courseId || ""), coordinatorId: user.id }, select: { id: true } });
  if (!course) return NextResponse.json({ error: "not found" }, { status: 404 });
  const data = { kept: !!b.kept, note: String(b.note || "").trim().slice(0, 200) || null, coordinatorId: user.id };
  await prisma.courseFolder.upsert({ where: { courseId: course.id }, create: { courseId: course.id, ...data }, update: data });
  return NextResponse.json({ ok: true });
}
