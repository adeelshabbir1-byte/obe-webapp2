import { randomUUID } from "crypto";
import { prisma } from "../db";
import { whoIs } from "../registers";
import { allProviders, providerOf, daysSince, type Ctx, type Item, type SessionUser, type Action } from "./registry";
import { delegatorsTo } from "./delegation";
import { approverFor, type PositionKey } from "../approvers";
import { notifyUsers } from "../notifications";
import { writeAuditLog } from "../audit";
import "./providers";

// The approvals inbox: everything waiting for one person, from every module (lib/approvals/providers.ts).

const adb = prisma as unknown as Record<string, any>;
export type Setting = { kind: string; remindAfterDays: number; escalateAfterDays: number };
export const DEFAULT_SETTING = { remindAfterDays: 3, escalateAfterDays: 7 };

export async function settingsOf(chairmanId: string): Promise<Map<string, Setting>> {
  try { return new Map(((await adb.approvalSetting.findMany({ where: { chairmanId } })) as Setting[]).map((s) => [s.kind, s])); } catch { return new Map(); }
}
export const settingFor = (m: Map<string, Setting>, kind: string): Setting => m.get(kind) || { kind, ...DEFAULT_SETTING };

const toSession = (u: { id: string; name: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null; extraRoles?: string[] | null }): SessionUser => ({ id: u.id, name: u.name, role: u.role, managedById: u.managedById, departmentId: u.departmentId ?? null, facultyId: u.facultyId ?? null, extraRoles: u.extraRoles ?? [] });

async function itemsAs(user: SessionUser): Promise<{ items: Item[]; failed: string[] }> {
  const w = await whoIs(user as never);
  if (!w) return { items: [], failed: [] };
  const ctx: Ctx = { user, w };
  const failed: string[] = [];
  const lists = await Promise.all(allProviders().map(async (p) => {
    try { return await p.fetch(ctx); } catch { failed.push(p.label); return [] as Item[]; }
  }));
  return { items: lists.flat(), failed };
}

export type Inbox = { items: (Item & { label: string; bulk: boolean; age: number; overdue: boolean })[]; acting: { id: string; name: string; until: Date }[]; failed: string[] };

/** Everything waiting for this person, plus what is waiting for anyone who has delegated their approvals to them. */
export async function inboxFor(raw: Parameters<typeof toSession>[0]): Promise<Inbox> {
  const user = toSession(raw);
  const own = await itemsAs(user);
  const map = new Map<string, Item>(own.items.map((i) => [`${i.kind}:${i.id}`, i]));
  const dels = await delegatorsTo(user.id);
  const acting: Inbox["acting"] = [];
  for (const d of dels) {
    const p = await prisma.user.findUnique({ where: { id: d.fromUserId } });
    if (!p) continue;
    acting.push({ id: p.id, name: p.name, until: d.endDate });
    const theirs = await itemsAs(toSession(p as never));
    for (const it of theirs.items) {
      const k = `${it.kind}:${it.id}`;
      const mine = map.get(k);
      // Modules that decide by position already accept the delegate (the resolver adds them); others are open-only.
      // Already theirs: only a position-based item may be there because of the delegation.
      if (mine) { if (providerOf(it.kind)?.byPosition) map.set(k, { ...mine, onBehalfOf: p.name }); }
      else map.set(k, { ...it, onBehalfOf: p.name, actions: providerOf(it.kind)?.byPosition ? it.actions : [], note: it.note || `Waiting for ${p.name}; this module takes the decision only from them, so open it to see it.` });
    }
  }
  const w = await whoIs(user as never);
  const st = w ? await settingsOf(w.chairmanId) : new Map<string, Setting>();
  const items = Array.from(map.values()).map((i) => {
    const p = providerOf(i.kind);
    const age = daysSince(i.since);
    const overdue = (i.due ? new Date(i.due) < new Date() : false) || age >= settingFor(st, i.kind).escalateAfterDays;
    return { ...i, label: p?.label || i.kind, bulk: !!p?.bulk, age, overdue, priority: overdue ? "high" as const : i.priority };
  }).sort((a, b) => (a.priority === b.priority ? new Date(a.since).getTime() - new Date(b.since).getTime() : a.priority === "high" ? -1 : 1));
  return { items, acting, failed: own.failed };
}

// A short-lived count for the sidebar badge, so the inbox is not rebuilt on every page.
const cache = new Map<string, { n: number; at: number; running?: Promise<number> }>();
export function forgetCount(userId: string) { cache.delete(userId); }
export async function badgeCount(raw: Parameters<typeof toSession>[0], waitMs = 700): Promise<number> {
  const c = cache.get(raw.id);
  if (c && Date.now() - c.at < 3 * 60_000) return c.n;
  const running = c?.running || inboxFor(raw).then((x) => { const n = x.items.length; cache.set(raw.id, { n, at: Date.now() }); return n; }).catch(() => 0);
  cache.set(raw.id, { n: c?.n ?? 0, at: c?.at ?? 0, running });
  return Promise.race([running, new Promise<number>((r) => setTimeout(() => r(c?.n ?? 0), waitMs))]);
}

/** Approve or return one item through its module. Returned items always need a reason. */
export async function act(raw: Parameters<typeof toSession>[0], kind: string, id: string, action: Action, reason: string, req: Request) {
  const user = toSession(raw);
  const p = providerOf(kind);
  if (!p?.act) return { ok: false, error: "Open this item in its module to decide it." };
  if (action === "return" && !reason.trim()) return { ok: false, error: "Give the reason for returning it." };
  const w = await whoIs(user as never);
  if (!w) return { ok: false, error: "Not signed in to an institute." };
  // Only items that are in this person's inbox right now can be decided from here.
  const box = await inboxFor(raw);
  const it = box.items.find((x) => x.kind === kind && x.id === id);
  if (!it) return { ok: false, error: "This item is no longer waiting for you (someone may have decided it already)." };
  if (!it.actions.includes(action)) return { ok: false, error: "Open this item in its module to decide it." };
  const r = await p.act({ user, w }, id, action, reason.trim(), req);
  if (r.ok) {
    forgetCount(user.id);
    await writeAuditLog({ actorUserId: user.id, action: action === "approve" ? "INBOX_APPROVED" : "INBOX_RETURNED", entityType: kind, entityId: id, metadata: { onBehalfOf: it.onBehalfOf || null, reason: reason.slice(0, 200) || null } }).catch(() => {});
  }
  return r;
}

// ---- Daily job: reminders, escalation to the position above, and the digest ----

/** The position above the person who is sitting on an item. */
function nextPosition(role: string): PositionKey {
  if (role === "HEAD_OF_DEPARTMENT") return "DEAN";
  if (role === "DEAN" || role === "OMC" || role === "FINANCE_OFFICER" || role === "STUDENT_AFFAIRS" || role === "LIBRARIAN") return "INSTITUTE_HEAD";
  if (role === "PROGRAM_COORDINATOR" || role === "DEPARTMENT_COORDINATOR") return "HEAD_OF_DEPARTMENT";
  return "HEAD_OF_DEPARTMENT";
}

async function nudged(itemKey: string, userId: string, level: "REMIND" | "ESCALATE") {
  try { await adb.approvalNudge.create({ data: { id: randomUUID(), itemKey, userId, level } }); return true; } catch { return false; } // unique → already sent
}

/** For every staff member with something waiting: a daily digest (in the app, and by email when set up), a reminder
 * once an item is older than the kind's reminder days, and a notice to the position above once it is older than the
 * escalation days. Each reminder and escalation is sent once per item. */
export async function runApprovalJobs(now = new Date()) {
  try { await adb.approvalNudge.count(); } catch { return { digests: 0, reminders: 0, escalations: 0, skipped: "run migration_approvals_inbox.sql" }; }
  // People who decide things by position, plus teachers who have something of their own waiting (advisees on hold,
  // out-of-batch requests, meeting or QAA actions). Lab manuals have their own reminder (lib/labTheory).
  const extra = new Set<string>();
  const add = async (f: () => Promise<{ id: string | null }[]>) => { try { for (const r of await f()) if (r.id) extra.add(r.id); } catch { /* table missing */ } };
  await add(async () => ((await adb.registrationHold.findMany({ where: { status: "PENDING" }, select: { advisorId: true } })) as { advisorId: string | null }[]).map((r) => ({ id: r.advisorId })));
  await add(async () => ((await adb.meetingAction.findMany({ where: { status: "OPEN" }, select: { ownerId: true } })) as { ownerId: string | null }[]).map((r) => ({ id: r.ownerId })));
  await add(async () => ((await adb.qaaAction.findMany({ where: { status: { not: "DONE" } }, select: { ownerId: true } })) as { ownerId: string | null }[]).map((r) => ({ id: r.ownerId })));
  await add(async () => ((await adb.outOfBatchRequest.findMany({ where: { status: "PENDING" }, select: { course: { select: { coordinatorId: true } } } })) as { course: { coordinatorId: string | null } }[]).map((r) => ({ id: r.course.coordinatorId })));
  const staff = await prisma.user.findMany({ where: { isActive: true, OR: [{ role: { in: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "OMC", "FINANCE_OFFICER", "STUDENT_AFFAIRS"] } }, { id: { in: Array.from(extra).concat(["none"]) } }] }, take: 2000 });
  let digests = 0, reminders = 0, escalations = 0;
  const dayAgo = new Date(now.getTime() - 20 * 3600_000);
  for (const u of staff) {
    let box: Inbox;
    try { box = await inboxFor(u as never); } catch { continue; }
    if (!box.items.length) continue;
    const w = await whoIs(u as never);
    if (!w) continue;
    const st = await settingsOf(w.chairmanId);
    // Digest: one a day.
    const had = await adb.notification.count({ where: { userId: u.id, kind: "APPROVALS_DIGEST", createdAt: { gte: dayAgo } } }).catch(() => 1);
    if (!had) {
      const kinds = new Map<string, number>();
      for (const i of box.items) kinds.set(i.label, (kinds.get(i.label) || 0) + 1);
      const late = box.items.filter((i) => i.overdue).length;
      await notifyUsers([u.id], { kind: "APPROVALS_DIGEST", title: `${box.items.length} item(s) waiting for your approval${late ? ` — ${late} overdue` : ""}`, body: Array.from(kinds.entries()).map(([k, n]) => `${k}: ${n}`).join("; "), href: "/approvals" });
      digests++;
    }
    // Collect first, then send one reminder and one escalation notice per person (not one per item).
    const esc: typeof box.items = [], rem: typeof box.items = [];
    for (const i of box.items) {
      if (i.onBehalfOf) continue;
      const s = settingFor(st, i.kind);
      const key = `${i.kind}:${i.id}`;
      if (i.age >= s.escalateAfterDays) { if (await nudged(key, u.id, "ESCALATE")) esc.push(i); }
      else if (i.age >= s.remindAfterDays && (await nudged(key, u.id, "REMIND"))) rem.push(i);
    }
    const list = (xs: typeof box.items) => `${xs.slice(0, 5).map((i) => `${i.title} (${i.age} days)`).join("; ")}${xs.length > 5 ? ` and ${xs.length - 5} more` : ""}.`;
    if (esc.length) {
      const above = await approverFor(w.chairmanId, nextPosition(u.role), { departmentId: u.departmentId }).catch(() => null);
      const ids = (above?.ids || []).filter((x) => x !== u.id);
      if (ids.length) await notifyUsers(ids, { kind: "APPROVAL_ESCALATION", title: `${esc.length} item(s) overdue with ${u.name}`, body: `Waiting longer than the institute's limit for ${u.name}'s decision: ${list(esc)} Please follow them up.`, href: esc.length === 1 ? esc[0].href : "/approvals" });
      await notifyUsers([u.id], { kind: "APPROVAL_REMINDER", title: `${esc.length} item(s) overdue — the position above you has been told`, body: list(esc), href: "/approvals" });
      escalations += esc.length;
    }
    if (rem.length) {
      await notifyUsers([u.id], { kind: "APPROVAL_REMINDER", title: `Reminder: ${rem.length} item(s) waiting for your decision`, body: list(rem), href: "/approvals" });
      reminders += rem.length;
    }
  }
  return { digests, reminders, escalations };
}
