import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { OVERVIEW_ROLES, leadsInScope } from "../../../lib/readinessScope";
import { requestRecipients, requestInboxIds } from "../../../lib/requests";

const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

// Ask someone to complete something found in the accreditation report.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !OVERVIEW_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const { chairmanId, leads } = await leadsInScope(user);
  const lead = leads.find((l) => l.id === b.leadId);
  if (!lead) return NextResponse.json({ error: "That program is not in your area" }, { status: 403 });
  const allowed = await requestRecipients(chairmanId, lead);
  if (!allowed.some((r) => r.id === b.toId)) return NextResponse.json({ error: "Choose someone who works on this program" }, { status: 400 });
  const subject = txt(b.subject, 200), body = txt(b.body, 3000);
  if (!subject || !body) return NextResponse.json({ error: "Write what needs to be done" }, { status: 400 });
  const due = b.dueDate ? new Date(b.dueDate) : null;
  if (due && isNaN(due.getTime())) return NextResponse.json({ error: "That date is not valid" }, { status: 400 });
  const href = typeof b.href === "string" && b.href.startsWith("/") ? b.href.slice(0, 300) : null;
  const row = await prisma.taskRequest.create({ data: { chairmanId, fromId: user.id, toId: String(b.toId), leadId: lead.id, subject, area: txt(b.area, 200) || null, href, body, dueDate: due } as never });
  await writeAuditLog({ actorUserId: user.id, action: "TASK_REQUEST_SENT", entityType: "TaskRequest", entityId: row.id });
  return NextResponse.json({ ok: true }, { status: 201 });
}

// body: { id, action: "RESPOND" | "DONE" } by the person asked; { id, action: "REMIND" | "CLOSE" } by the sender.
export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const r = await prisma.taskRequest.findUnique({ where: { id: String(b.id || "") } });
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  const now = new Date();
  if (b.action === "RESPOND" || b.action === "DONE") {
    const inbox = await requestInboxIds(user);
    if (!inbox.includes(r.toId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    let response = txt(b.response, 3000);
    // Another OMC member answering for the committee: say who answered.
    if (response && r.toId !== user.id) response = `${response}\n— ${user.name}`;
    if (b.action === "RESPOND" && !response) return NextResponse.json({ error: "Write your reply" }, { status: 400 });
    await prisma.taskRequest.update({ where: { id: r.id }, data: b.action === "DONE" ? { status: "DONE", doneAt: now, respondedAt: now, ...(response ? { response } : {}) } : { status: "RESPONDED", response, respondedAt: now } });
  } else if (b.action === "REMIND" || b.action === "CLOSE") {
    if (r.fromId !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (b.action === "CLOSE") await prisma.taskRequest.update({ where: { id: r.id }, data: { status: "CLOSED" } });
    else await prisma.taskRequest.update({ where: { id: r.id }, data: { status: "OPEN", remindedAt: now, reminders: { increment: 1 } } });
  } else return NextResponse.json({ error: "unknown action" }, { status: 400 });
  await writeAuditLog({ actorUserId: user.id, action: `TASK_REQUEST_${String(b.action)}`, entityType: "TaskRequest", entityId: r.id });
  return NextResponse.json({ ok: true });
}
