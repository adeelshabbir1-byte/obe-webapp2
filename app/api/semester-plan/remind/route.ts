import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { SETTER_ROLES, chairmanOf, reach } from "../../../../lib/deadlines";

// body: { deadlineId, toId, item? } - remind one person about a late plan task.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !SETTER_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const t = (await prisma.deadline.findFirst({ where: { id: String(b.deadlineId || ""), chairmanId: chairmanOf(user), allCourses: true } as never })) as unknown as { title: string; dueDate: Date } | null;
  if (!t) return NextResponse.json({ error: "task not found" }, { status: 404 });
  const { people } = await reach(user);
  if (!people.some((p) => p.id === b.toId)) return NextResponse.json({ error: "That person is not in your area" }, { status: 403 });
  const recent = await prisma.taskRequest.findFirst({ where: { fromId: user.id, toId: String(b.toId), subject: `Reminder: ${t.title}`, status: "OPEN", createdAt: { gte: new Date(Date.now() - 86400000) } } as never });
  if (recent) return NextResponse.json({ error: "A reminder was already sent in the last day" }, { status: 409 });
  const item = String(b.item || "").slice(0, 200);
  const due = t.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  await prisma.taskRequest.create({ data: { chairmanId: chairmanOf(user), fromId: user.id, toId: String(b.toId), subject: `Reminder: ${t.title}`, area: item || null, href: "/deadlines", body: `This task was due on ${due} and is not marked done${item ? ` for ${item}` : ""}. Please complete it, or reply to say what is holding it up.` } as never });
  return NextResponse.json({ ok: true });
}
