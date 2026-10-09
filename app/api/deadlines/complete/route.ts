import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanOf } from "../../../../lib/deadlines";

/** Mark a task done (or undo it). The person it was set for, or whoever set it. */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const d = await prisma.deadline.findUnique({ where: { id: String(b.id || "") } });
  if (!d || d.chairmanId !== chairmanOf(user)) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (d.assigneeId !== user.id && d.setById !== user.id && user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (d.courseId && b.done) return NextResponse.json({ error: "This one is marked done automatically when the work is saved in the course" }, { status: 400 });
  await prisma.deadline.update({ where: { id: d.id }, data: { completedAt: b.done ? new Date() : null } });
  return NextResponse.json({ ok: true });
}
