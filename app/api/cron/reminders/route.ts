import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { notifyUsers } from "../../../../lib/notifications";
import { KIND_ROLE } from "../../../../lib/deadlines";
import { runInactivityCheck } from "../../../../lib/inactivity";
import { closeDueSessions } from "../../../../lib/attendance";

export const dynamic = "force-dynamic";

// Runs daily (vercel.json). Anyone with tasks overdue or due within 3 days gets one in-app reminder a week.
// Set CRON_SECRET in Vercel; Vercel sends it as "Authorization: Bearer <secret>".
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 86400000);
  const rows = (await prisma.deadline.findMany({
    where: { assigneeId: { not: null }, completedAt: null, allCourses: false, dueDate: { lt: soon } } as never,
    select: { assigneeId: true, setById: true, chairmanId: true, dueDate: true },
    take: 5000,
  })) as unknown as { assigneeId: string; setById: string; chairmanId: string; dueDate: Date }[];
  const per = new Map<string, { late: number; soon: number; setById: string; chairmanId: string }>();
  for (const r of rows) {
    const e = per.get(r.assigneeId) || { late: 0, soon: 0, setById: r.setById, chairmanId: r.chairmanId };
    if (r.dueDate < now) e.late++; else e.soon++;
    per.set(r.assigneeId, e);
  }
  const bell = await bellReminders(now, soon);
  // Sign-in watch: bosses hear about people who haven't opened the app for their limit of working days.
  const inactive = await runInactivityCheck(now).catch(() => 0);
  // QR attendance sessions whose time ran out while nobody had the page open: mark the absentees and the shortages.
  const attendanceClosed = await closeDueSessions().catch(() => 0);
  const ids = Array.from(per.keys());
  if (!ids.length) return NextResponse.json({ sent: 0, bell, inactive, attendanceClosed });
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const [recent, active] = await Promise.all([
    prisma.taskRequest.findMany({ where: { toId: { in: ids }, subject: { startsWith: "Reminder:" }, createdAt: { gte: weekAgo } } as never, select: { toId: true } }),
    prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } }),
  ]) as unknown as [{ toId: string }[], { id: string }[]];
  const skip = new Set(recent.map((r) => r.toId));
  const ok = new Set(active.map((u) => u.id));
  const data = ids.filter((id) => !skip.has(id) && ok.has(id)).slice(0, 500).map((id) => {
    const e = per.get(id)!;
    const parts = [e.late ? `${e.late} overdue` : "", e.soon ? `${e.soon} due within 3 days` : ""].filter(Boolean).join(" and ");
    return { chairmanId: e.chairmanId, fromId: e.setById, toId: id, subject: `Reminder: ${parts}`, area: null, href: "/deadlines", body: `You have ${parts}. Open your Deadlines to see which tasks and complete them, or reply to say what is holding you up.` };
  });
  if (data.length) await prisma.taskRequest.createMany({ data: data as never });
  const emailed = await emailDigest(data.map((d) => ({ toId: d.toId, subject: d.subject, body: d.body })));
  return NextResponse.json({ sent: data.length, emailed, bell, inactive, attendanceClosed });
}

// Optional email: only when RESEND_API_KEY and EMAIL_FROM are set in Vercel (a free Resend account is enough). Otherwise reminders stay in the app.
async function emailDigest(items: { toId: string; subject: string; body: string }[]) {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from || !items.length) return 0;
  const users = (await prisma.user.findMany({ where: { id: { in: items.map((i) => i.toId) } }, select: { id: true, email: true, name: true } })) as unknown as { id: string; email: string | null; name: string }[];
  const email = new Map<string, { email: string | null; name: string }>(users.map((u) => [u.id, u]));
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  let sent = 0;
  for (let i = 0; i < items.length; i += 10) {
    await Promise.all(items.slice(i, i + 10).map(async (it) => {
      const u = email.get(it.toId);
      if (!u?.email) return;
      try {
        const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [u.email], subject: it.subject, text: `Dear ${u.name},\n\n${it.body}\n\n${base ? `${base}/deadlines` : ""}` }) });
        if (res.ok) sent++;
      } catch { /* one failed email must not stop the rest */ }
    }));
  }
  return sent;
}

// The bell: every person with work overdue or due within 3 days — named deadlines AND course deadlines that belong to
// whoever holds the course's role (Subject Expert, Instructor, Program Lead). Once a day in the app; by email at most
// once a week (kind DEADLINE emails, DEADLINE_DAILY does not).
async function bellReminders(now: Date, soon: Date) {
  const rows = (await prisma.deadline.findMany({
    where: { completedAt: null, allCourses: false, dueDate: { lt: soon } } as never,
    select: { title: true, dueDate: true, assigneeId: true, courseId: true, role: true, kind: true },
    take: 20000,
  })) as unknown as { title: string; dueDate: Date; assigneeId: string | null; courseId: string | null; role: string | null; kind: string }[];
  const courseIds = Array.from(new Set(rows.map((r) => r.courseId).filter((x): x is string => !!x)));
  const courses = courseIds.length ? await prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, code: true, subjectExpertId: true, instructorId: true, coordinatorId: true } }) : [];
  const cOf = new Map(courses.map((c) => [c.id, c]));
  const per = new Map<string, { late: string[]; soon: string[] }>();
  for (const r of rows) {
    let who = r.assigneeId;
    if (!who && r.courseId) {
      const c = cOf.get(r.courseId); const role = r.role || KIND_ROLE[r.kind];
      who = (role === "INSTRUCTOR" ? c?.instructorId : role === "PROGRAM_COORDINATOR" ? c?.coordinatorId : c?.subjectExpertId) || null;
    }
    if (!who) continue;
    const e = per.get(who) || { late: [], soon: [] };
    const label = `${r.title.replace(/ \((Fall|Spring)[^)]*\)$/i, "")}${r.courseId && cOf.get(r.courseId) ? ` (${cOf.get(r.courseId)!.code})` : ""}`;
    (r.dueDate < now ? e.late : e.soon).push(label);
    per.set(who, e);
  }
  const ids = Array.from(per.keys());
  if (!ids.length) return 0;
  const ndb = prisma as unknown as Record<string, any>;
  let recentDay: { userId: string }[] = [], recentWeek: { userId: string }[] = [];
  try {
    [recentDay, recentWeek] = await Promise.all([
      ndb.notification.findMany({ where: { userId: { in: ids }, kind: { in: ["DEADLINE", "DEADLINE_DAILY"] }, createdAt: { gte: new Date(now.getTime() - 20 * 3600000) } }, select: { userId: true } }),
      ndb.notification.findMany({ where: { userId: { in: ids }, kind: "DEADLINE", createdAt: { gte: new Date(now.getTime() - 7 * 86400000) } }, select: { userId: true } }),
    ]);
  } catch { return 0; }
  const skip = new Set(recentDay.map((r) => r.userId)), weekly = new Set(recentWeek.map((r) => r.userId));
  let n = 0;
  for (const id of ids) {
    if (skip.has(id)) continue;
    const e = per.get(id)!;
    const parts = [e.late.length ? `${e.late.length} overdue` : "", e.soon.length ? `${e.soon.length} due within 3 days` : ""].filter(Boolean).join(" and ");
    const list = [...e.late, ...e.soon];
    await notifyUsers([id], { kind: weekly.has(id) ? "DEADLINE_DAILY" : "DEADLINE", title: `You have ${parts}`, body: `${list.slice(0, 4).join("; ")}${list.length > 4 ? ` and ${list.length - 4} more` : ""}.`, href: "/deadlines" });
    n++;
  }
  return n;
}
