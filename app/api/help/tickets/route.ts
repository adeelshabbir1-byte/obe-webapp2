import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { notifyUsers } from "../../../../lib/notifications";
import { writeAuditLog } from "../../../../lib/audit";
import { helpViewer, viewerById, type HelpViewer } from "../../../../lib/help/access";
import { DESKS, deskOf, recipientsFor, type DeskKey } from "../../../../lib/help/desks";
import { CATEGORIES, PRIORITIES, STATUS_LABEL, deskSetting, extrasOf, saveExtra, slaState, type Extra } from "../../../../lib/help/deskExtra";

export const dynamic = "force-dynamic";

const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const MISSING = "Help requests aren't available yet — run prisma/migration_help_center.sql in Supabase.";
type Ticket = NonNullable<Awaited<ReturnType<typeof prisma.helpTicket.findUnique>>>;

const ids = (t: Ticket): string[] => { try { const x = JSON.parse(t.recipientIds); return Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []; } catch { return []; } };
const isRequester = (v: HelpViewer, t: Ticket) => (v.kind === "staff" ? t.requesterUserId === v.id : t.requesterStudentId === v.id);
/** Someone who answers: a person it was routed to, the institute's head, or (for technical requests) a Super User. */
const isHandler = (v: HelpViewer, t: Ticket) => v.kind === "staff" && (ids(t).includes(v.id) || (v.role === "CHAIRMAN" && t.chairmanId === v.id) || v.role === "SUPER_USER");
const link = (id: string, forStudent: boolean) => `${forStudent ? "/student/help" : "/help/requests"}?id=${id}`;

function view(t: Ticket, v: HelpViewer, e?: Extra) {
  return {
    category: e?.category || null, priority: e?.priority || null, tags: e?.tags || "", sla: slaState(e, t.status), statusLabel: STATUS_LABEL[t.status] || t.status, hasScreenshot: !!e?.screenshot,
    id: t.id, desk: t.desk, deskLabel: deskOf(t.desk)?.label || t.desk, subject: t.subject, body: t.body, query: t.query, page: t.page, status: t.status,
    requesterName: t.requesterName, requesterRole: t.requesterRole, createdAt: t.createdAt, lastActivityAt: t.lastActivityAt, resolvedAt: t.resolvedAt,
    mine: isRequester(v, t), canAnswer: isHandler(v, t),
  };
}

// GET ?id= one request with its replies; otherwise { mine, inbox } — what I asked, and what was routed to me.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const v = await helpViewer(sp.get("audience") === "student" ? "student" : "staff");
  if (!v) return NextResponse.json({ error: "Sign in to use help." }, { status: 401 });
  try {
    const id = sp.get("id");
    if (id) {
      const t = await prisma.helpTicket.findUnique({ where: { id } });
      if (!t || (!isRequester(v, t) && !isHandler(v, t))) return NextResponse.json({ error: "not found" }, { status: 404 });
      const messages = await prisma.helpTicketMessage.findMany({ where: { ticketId: t.id }, orderBy: { createdAt: "asc" } });
      const people = ids(t).length ? await prisma.user.findMany({ where: { id: { in: ids(t) } }, select: { name: true } }) : [];
      const e = (await extrasOf([t.id])).get(t.id);
      return NextResponse.json({
        ticket: { ...view(t, v, e), routedTo: people.map((p) => p.name), screenshot: e?.screenshot || null, browser: e?.browser || null, pageUrl: e?.pageUrl || null, fixNote: e?.fixNote || null, releaseRef: e?.releaseRef || null, faqArticleId: e?.faqArticleId || null },
        categories: CATEGORIES, priorities: PRIORITIES,
        messages: messages.map((m) => ({ id: m.id, authorName: m.authorName, body: m.body, createdAt: m.createdAt, fromRequester: t.requesterUserId ? m.authorUserId === t.requesterUserId : !!m.authorStudentId && m.authorStudentId === t.requesterStudentId })),
        desks: DESKS.filter((d) => t.requesterStudentId ? d.students : true).map((d) => ({ key: d.key, label: d.label })),
      });
    }
    const mine = await prisma.helpTicket.findMany({ where: v.kind === "staff" ? { requesterUserId: v.id } : { requesterStudentId: v.id }, orderBy: { lastActivityAt: "desc" }, take: 100 });
    let inbox: Ticket[] = [];
    if (v.kind === "staff") {
      const or: Record<string, unknown>[] = [{ recipientIds: { contains: `"${v.id}"` } }];
      if (v.role === "CHAIRMAN") or.push({ chairmanId: v.id });
      if (v.role === "SUPER_USER") or.push(sp.get("scope") === "all" ? { id: { not: "" } } : { desk: "TECHNICAL" });
      // Students' requests have no requesterUserId; a plain NOT would drop them (NULL never compares), so keep nulls explicitly.
      inbox = await prisma.helpTicket.findMany({ where: { AND: [{ OR: or as never }, { OR: [{ requesterUserId: null }, { requesterUserId: { not: v.id } }] }] }, orderBy: [{ lastActivityAt: "desc" }], take: 200 });
    }
    const ex = await extrasOf([...mine, ...inbox].map((t) => t.id));
    const insts = v.kind === "staff" && v.role === "SUPER_USER" ? new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(inbox.map((t) => t.chairmanId).filter((x): x is string => !!x))) } }, select: { id: true, instituteName: true } })).map((u) => [u.id, u.instituteName])) : null;
    return NextResponse.json({ mine: mine.map((t) => view(t, v, ex.get(t.id))), inbox: inbox.map((t) => ({ ...view(t, v, ex.get(t.id)), institute: insts?.get(t.chairmanId || "") || null })), categories: CATEGORIES, priorities: PRIORITIES, desks: DESKS.filter((d) => (v.kind === "student" ? d.students : true)).map((d) => ({ key: d.key, label: d.label, who: d.who })) });
  } catch {
    return NextResponse.json({ error: MISSING }, { status: 503 });
  }
}

// POST { desk, subject, body, query?, page?, audience } — raise a help request; it goes straight to the people who can answer it.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const v = await helpViewer(b.audience === "student" ? "student" : "staff");
  if (!v) return NextResponse.json({ error: "Sign in to use help." }, { status: 401 });
  const desk = deskOf(String(b.desk || ""));
  if (!desk || (v.kind === "student" && !desk.students)) return NextResponse.json({ error: "Choose what your request is about." }, { status: 400 });
  const subject = txt(b.subject, 160), body = txt(b.body, 4000);
  if (subject.length < 4 || body.length < 10) return NextResponse.json({ error: "Give a short subject and describe the problem (what you tried, what happened)." }, { status: 400 });
  try {
    const since = new Date(Date.now() - 24 * 3600_000);
    const today = await prisma.helpTicket.count({ where: { ...(v.kind === "staff" ? { requesterUserId: v.id } : { requesterStudentId: v.id }), createdAt: { gte: since } } });
    if (today >= 15) return NextResponse.json({ error: "You've raised many requests today. Reply on one of them instead, or try again tomorrow." }, { status: 429 });
    // Local requests also reach the institute's own support people; system problems go to the platform's Super Users.
    const setting = await deskSetting(v.chairmanId);
    const recipients = Array.from(new Set([...(await recipientsFor(v, desk.key)), ...(desk.key === "TECHNICAL" ? [] : setting.supportUserIds)])).filter((x) => x !== v.id);
    const page = typeof b.page === "string" && b.page.startsWith("/") ? b.page.slice(0, 200) : null;
    const category = CATEGORIES.some(([k]) => k === b.category) ? String(b.category) : "HOW_TO";
    const priority = PRIORITIES.some(([k]) => k === b.priority) ? String(b.priority) : "NORMAL";
    const shot = typeof b.screenshot === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(b.screenshot) && b.screenshot.length <= 2_000_000 ? b.screenshot : null;
    const t = await prisma.helpTicket.create({
      data: {
        chairmanId: v.chairmanId, desk: desk.key, subject, body, query: txt(b.query, 200) || null, page,
        requesterUserId: v.kind === "staff" ? v.id : null, requesterStudentId: v.kind === "student" ? v.id : null,
        requesterName: v.name, requesterRole: v.role, recipientIds: JSON.stringify(recipients),
      },
    });
    await saveExtra(t.id, { category, priority, screenshot: shot, browser: txt(b.browser, 300) || null, pageUrl: txt(b.pageUrl, 500) || null, slaDueAt: new Date(Date.now() + (setting.sla[priority] || 72) * 3600_000) });
    await notifyUsers(recipients, { kind: "HELP", title: `${priority === "URGENT" ? "URGENT " : ""}Help request from ${v.name}: ${subject}`, body: body.slice(0, 300), href: link(t.id, false) });
    if (v.kind === "staff") await writeAuditLog({ actorUserId: v.id, action: "HELP_REQUEST_RAISED", entityType: "HelpTicket", entityId: t.id, metadata: { desk: desk.key } });
    return NextResponse.json({ ok: true, id: t.id, routedTo: recipients.length, who: desk.who }, { status: 201 });
  } catch {
    return NextResponse.json({ error: MISSING }, { status: 503 });
  }
}

// PATCH { id, action, body?, desk?, audience } — reply | resolve | reopen | close | forward.
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const v = await helpViewer(b.audience === "student" ? "student" : "staff");
  if (!v) return NextResponse.json({ error: "Sign in to use help." }, { status: 401 });
  try {
    const t = await prisma.helpTicket.findUnique({ where: { id: String(b.id || "") } });
    if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
    const requester = isRequester(v, t), handler = isHandler(v, t);
    if (!requester && !handler) return NextResponse.json({ error: "not found" }, { status: 404 });
    const now = new Date();
    const requesterIds = t.requesterUserId ? [t.requesterUserId] : [];
    const tellRequester = (title: string, body?: string) => notifyUsers(requesterIds, { kind: "HELP", title, body, href: link(t.id, false) });
    const tellHandlers = (title: string, body?: string) => notifyUsers([...ids(t), t.assignedToId], { kind: "HELP", title, body, href: link(t.id, false), exceptId: v.kind === "staff" ? v.id : null });

    switch (b.action) {
      case "reply": {
        const body = txt(b.body, 4000);
        if (body.length < 2) return NextResponse.json({ error: "Write a reply." }, { status: 400 });
        if (t.status === "CLOSED") return NextResponse.json({ error: "This request is closed. Raise a new one if you still need help." }, { status: 400 });
        await prisma.helpTicketMessage.create({ data: { ticketId: t.id, authorUserId: v.kind === "staff" ? v.id : null, authorStudentId: v.kind === "student" ? v.id : null, authorName: v.name, body } });
        const status = requester ? "OPEN" : "ANSWERED";
        if (handler && !requester) { const e = (await extrasOf([t.id])).get(t.id); if (e && !e.firstResponseAt) await saveExtra(t.id, { firstResponseAt: now }); }
        await prisma.helpTicket.update({ where: { id: t.id }, data: { status, lastActivityAt: now, ...(handler && !t.assignedToId ? { assignedToId: v.id } : {}) } });
        if (requester) await tellHandlers(`${v.name} replied: ${t.subject}`, body.slice(0, 300));
        else await tellRequester(`Answer to your help request: ${t.subject}`, body.slice(0, 300));
        return NextResponse.json({ ok: true, status });
      }
      case "resolve": {
        await prisma.helpTicket.update({ where: { id: t.id }, data: { status: "RESOLVED", resolvedAt: now, lastActivityAt: now } });
        if (!requester) await tellRequester(`Help request resolved: ${t.subject}`, "Reopen it if the problem isn't solved.");
        return NextResponse.json({ ok: true, status: "RESOLVED" });
      }
      case "reopen": {
        if (!requester) return NextResponse.json({ error: "Only the person who asked can reopen it." }, { status: 403 });
        await prisma.helpTicket.update({ where: { id: t.id }, data: { status: "OPEN", resolvedAt: null, lastActivityAt: now } });
        await tellHandlers(`Help request reopened: ${t.subject}`);
        return NextResponse.json({ ok: true, status: "OPEN" });
      }
      case "close": {
        if (!requester && !(v.kind === "staff" && (v.role === "CHAIRMAN" || v.role === "SUPER_USER"))) return NextResponse.json({ error: "Only the person who asked closes it — mark it resolved instead." }, { status: 403 });
        await prisma.helpTicket.update({ where: { id: t.id }, data: { status: "CLOSED", lastActivityAt: now } });
        return NextResponse.json({ ok: true, status: "CLOSED" });
      }
      case "forward": {
        if (!handler) return NextResponse.json({ error: "Only the people answering can send it to another desk." }, { status: 403 });
        const desk = deskOf(String(b.desk || ""));
        if (!desk || desk.key === t.desk) return NextResponse.json({ error: "Choose another desk." }, { status: 400 });
        const who = await viewerById(t.requesterUserId ? "staff" : "student", (t.requesterUserId || t.requesterStudentId)!, t.requesterRole);
        if (!who) return NextResponse.json({ error: "The person who asked no longer has an account." }, { status: 400 });
        const recipients = (await recipientsFor(who, desk.key as DeskKey)).filter((x) => x !== v.id);
        const note = txt(b.body, 1000);
        await prisma.helpTicketMessage.create({ data: { ticketId: t.id, authorUserId: v.id, authorName: v.name, body: `Sent to “${desk.label}” (${desk.who}).${note ? ` ${note}` : ""}` } });
        await prisma.helpTicket.update({ where: { id: t.id }, data: { desk: desk.key, recipientIds: JSON.stringify(recipients), status: "OPEN", assignedToId: null, lastActivityAt: now } });
        await notifyUsers(recipients, { kind: "HELP", title: `Help request from ${t.requesterName}: ${t.subject}`, body: `Passed on by ${v.name}.`, href: link(t.id, false) });
        return NextResponse.json({ ok: true, status: "OPEN" });
      }
      case "status": {
        if (!handler) return NextResponse.json({ error: "Only the people answering set this." }, { status: 403 });
        const st = String(b.status || "");
        if (!["IN_PROGRESS", "WAITING", "OPEN"].includes(st)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
        await prisma.helpTicket.update({ where: { id: t.id }, data: { status: st, lastActivityAt: now, ...(!t.assignedToId ? { assignedToId: v.id } : {}) } });
        if (st === "IN_PROGRESS") { const e = (await extrasOf([t.id])).get(t.id); if (e && !e.firstResponseAt) await saveExtra(t.id, { firstResponseAt: now }); }
        if (st === "WAITING") await tellRequester(`Waiting for you: ${t.subject}`, txt(b.body, 300) || "The people answering need more information from you. Please reply.");
        return NextResponse.json({ ok: true, status: st });
      }
      case "tags": {
        if (!handler) return NextResponse.json({ error: "Only the people answering set tags." }, { status: 403 });
        const tags = txt(b.tags, 300).split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 10).join(", ");
        if (!(await saveExtra(t.id, { tags }))) return NextResponse.json({ error: "Run prisma/migration_help_desk.sql first." }, { status: 503 });
        return NextResponse.json({ ok: true });
      }
      case "fix": {
        if (!handler) return NextResponse.json({ error: "Only the people answering record the fix." }, { status: 403 });
        if (!(await saveExtra(t.id, { fixNote: txt(b.fixNote, 2000) || null, releaseRef: txt(b.releaseRef, 120) || null }))) return NextResponse.json({ error: "Run prisma/migration_help_desk.sql first." }, { status: 503 });
        if (v.kind === "staff") await writeAuditLog({ actorUserId: v.id, action: "HELP_FIX_RECORDED", entityType: "HelpTicket", entityId: t.id, metadata: { release: txt(b.releaseRef, 120) || null } });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: MISSING }, { status: 503 });
  }
}
