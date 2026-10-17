import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { cmdb, CATEGORIES, HANDLERS } from "../../../lib/complaints";
import { notifyUsers, holdersOf } from "../../../lib/notifications";

const t = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

// Complaints and grievances: students and staff lodge them; Student Affairs / heads assign, act and close them.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const st = await getAuthenticatedStudent();
  const user = st ? null : await getAuthenticatedUser();
  if (!st && (!user || !user.mfaVerified)) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    if (b.action === "lodge") {
      const subject = t(b.subject, 160), details = t(b.details, 5000);
      if (!subject || !details || !CATEGORIES.includes(b.category)) return NextResponse.json({ error: "Choose a category and describe the problem." }, { status: 400 });
      let cid = "";
      if (st) { const s = await prisma.student.findUnique({ where: { id: st.id }, select: { batch: { select: { coordinator: { select: { managedById: true } } } } } }); cid = s?.batch.coordinator.managedById || ""; }
      else cid = await chairmanIdFor(user!);
      if (!cid) return NextResponse.json({ error: "Institute not found." }, { status: 400 });
      await cmdb.complaint.create({ data: { chairmanId: cid, byStudentId: st?.id || null, byUserId: user?.id || null, anonymous: !!b.anonymous, category: b.category, subject, details } });
      await notifyUsers(await holdersOf(cid, "STUDENT_AFFAIRS").catch(() => []), { kind: "ASSIGNMENT", title: `New complaint: ${subject}`, body: b.category, href: "/complaints" });
      return NextResponse.json({ ok: true });
    }
    if (!user || !HANDLERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const cid = await chairmanIdFor(user);
    const c = await cmdb.complaint.findFirst({ where: { id: String(b.id || ""), chairmanId: cid } });
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (b.action === "update") {
      const status = ["OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED"].includes(b.status) ? b.status : c.status;
      if ((status === "RESOLVED" || status === "REJECTED") && !t(b.resolution, 3000)) return NextResponse.json({ error: "Write what was done before closing." }, { status: 400 });
      await cmdb.complaint.update({ where: { id: c.id }, data: { status, assignedToId: typeof b.assignedToId === "string" && b.assignedToId ? b.assignedToId : c.assignedToId, resolution: t(b.resolution, 3000) ?? c.resolution, closedAt: status === "RESOLVED" || status === "REJECTED" ? c.closedAt || new Date() : null } });
      if (b.assignedToId && b.assignedToId !== c.assignedToId) await notifyUsers([b.assignedToId], { kind: "ASSIGNMENT", title: `Complaint assigned to you: ${c.subject}`, href: "/complaints" });
      if (c.byUserId && status !== c.status) await notifyUsers([c.byUserId], { kind: "ASSIGNMENT", title: `Your complaint is ${status.toLowerCase().replace("_", " ")}`, body: c.subject, href: "/complaints" });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Run prisma/migration_visit_extras.sql first." }, { status: 500 }); }
}
