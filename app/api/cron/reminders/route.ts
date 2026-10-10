import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";

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
  const ids = Array.from(per.keys());
  if (!ids.length) return NextResponse.json({ sent: 0 });
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
  return NextResponse.json({ sent: data.length, emailed });
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
