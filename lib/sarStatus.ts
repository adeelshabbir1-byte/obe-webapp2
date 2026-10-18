import { createHash, randomUUID } from "crypto";
import { prisma } from "./db";
import { CATALOGUE } from "./accreditation/catalogue";
import type { SarDoc, Item } from "./nbeacSar";

// Where each table of a council SAR stands, for the colour on its tab:
//   none      grey   — nobody has been given it yet and nothing is in it
//   progress  amber  — assigned (an accreditation task covers it), data not in yet
//   entered   blue   — data is in, waiting for review
//   ready     green  — approved (its task approved, or marked ready here) and unchanged since
//   changed   red    — was ready, but the data under it has changed since; look again
//   restricted       — confidential to this viewer
// Who has a table comes from the open accreditation tasks of the department's programs (each task names the SAR
// items it covers). The approved copy of each table is kept as a fingerprint so a later change shows up.

export type ItemState = "none" | "progress" | "entered" | "ready" | "changed" | "restricted";
export type ItemStatus = {
  key: string; state: ItemState;
  owner?: string; ownerId?: string; due?: string; taskId?: string; taskCode?: string; taskStatus?: string; cycleId?: string;
  readyBy?: string; readyAt?: string;
};

const sdb = prisma as unknown as Record<string, any>;
export const SAR_STATUS_HINT = "Ready marks need prisma/migration_council_tools.sql — run it in Supabase.";

/** A stable key per item (codes are unique within a SAR; a repeat gets #2, #3). */
export function itemKeys(doc: SarDoc): Map<Item, string> {
  const seen = new Map<string, number>(), out = new Map<Item, string>();
  for (const f of doc.forms) for (const it of f.items) {
    const n = (seen.get(it.code) || 0) + 1; seen.set(it.code, n);
    out.set(it, n > 1 ? `${it.code}#${n}` : it.code);
  }
  return out;
}

export function itemHash(it: Item) {
  const body = JSON.stringify([it.rows || null, (it.text || "").trim(), (it.files || []).map((f) => [f.id, f.fileName, f.date])]);
  return createHash("sha1").update(body).digest("hex").slice(0, 20);
}

const TASK_RANK: Record<string, number> = { APPROVED: 4, SUBMITTED: 3, RETURNED: 2, ASSIGNED: 2, OPEN: 1 };

export async function sarItemStatuses(chairmanId: string, departmentId: string, doc: SarDoc, body = "NBEAC"): Promise<Record<string, ItemStatus>> {
  const keys = itemKeys(doc);
  const cycles = await prisma.accreditationCycle.findMany({ where: { chairmanId, departmentId, body, status: "OPEN" }, select: { id: true } }).catch(() => []);
  const tasks = cycles.length ? await prisma.accreditationTask.findMany({ where: { cycleId: { in: cycles.map((c) => c.id) } }, select: { id: true, code: true, status: true, assigneeId: true, dueDate: true, cycleId: true, reviewedAt: true } }).catch(() => []) : [];
  const users = await prisma.user.findMany({ where: { id: { in: tasks.map((t) => t.assigneeId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }).catch(() => []);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  let saved: { itemKey: string; hash: string; readyAt: Date; readyByName: string | null }[] = [];
  try { saved = await sdb.sarItemState.findMany({ where: { scopeKey: departmentId, body } }); } catch { /* table not there yet */ }
  const savedOf = new Map(saved.map((s) => [s.itemKey, s]));
  const defs = CATALOGUE[body as keyof typeof CATALOGUE]?.tasks || [];
  const out: Record<string, ItemStatus> = {};
  const autoReady: { itemKey: string; hash: string }[] = [];

  for (const f of doc.forms) for (const it of f.items) {
    const key = keys.get(it)!;
    if (it.status === "restricted") { out[key] = { key, state: "restricted" }; continue; }
    const covering = defs.filter((d) => d.sarForm === f.key && d.sarCodes?.test(it.code)).map((d) => d.code);
    const task = tasks.filter((t) => covering.includes(t.code)).sort((a, b) => (TASK_RANK[b.status] || 0) - (TASK_RANK[a.status] || 0))[0];
    const st: ItemStatus = { key, state: "none" };
    if (task) {
      Object.assign(st, { taskId: task.id, taskCode: task.code, taskStatus: task.status, cycleId: task.cycleId, ownerId: task.assigneeId || undefined, owner: task.assigneeId ? nameOf.get(task.assigneeId) || "" : undefined, due: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : undefined });
    }
    const hash = itemHash(it);
    const mark = savedOf.get(key);
    const filled = it.status === "filled";
    if (mark) {
      st.state = mark.hash === hash ? "ready" : "changed";
      st.readyBy = mark.readyByName || undefined; st.readyAt = new Date(mark.readyAt).toISOString().slice(0, 10);
    } else if (task?.status === "APPROVED" && filled) {
      st.state = "ready"; autoReady.push({ itemKey: key, hash }); // first time seen approved: keep its fingerprint
    } else if (filled) st.state = "entered";
    else if (task && task.status !== "OPEN" && task.assigneeId) st.state = "progress";
    out[key] = st;
  }
  if (autoReady.length) {
    try {
      for (const a of autoReady) await sdb.sarItemState.create({ data: { id: randomUUID(), scopeKey: departmentId, body, itemKey: a.itemKey, hash: a.hash, readyAt: new Date(), readyByName: "Task approved", updatedAt: new Date() } });
    } catch { /* table missing or a parallel request saved it first */ }
  }
  return out;
}

/** Mark one table ready (keeps its fingerprint) or open it again. */
export async function setItemReady(departmentId: string, body: string, itemKey: string, hash: string | null, by: { id: string; name: string }) {
  if (!hash) { await sdb.sarItemState.deleteMany({ where: { scopeKey: departmentId, body, itemKey } }); return; }
  await sdb.sarItemState.upsert({
    where: { scopeKey_body_itemKey: { scopeKey: departmentId, body, itemKey } },
    create: { id: randomUUID(), scopeKey: departmentId, body, itemKey, hash, readyAt: new Date(), readyById: by.id, readyByName: by.name, updatedAt: new Date() },
    update: { hash, readyAt: new Date(), readyById: by.id, readyByName: by.name, updatedAt: new Date() },
  });
}

export function statusCounts(st: Record<string, ItemStatus>) {
  const c: Record<ItemState, number> = { none: 0, progress: 0, entered: 0, ready: 0, changed: 0, restricted: 0 };
  for (const s of Object.values(st)) c[s.state]++;
  return c;
}

/* ---------------- Chapter-based SAR (NCEAC / PEC / HEC visit cycles) ---------------- */

const CH_GROUP: Record<string, string> = { profile: "1", outcomes: "2", curriculum: "3", students: "4", faculty: "5", facilities: "6", support: "7", cqi: "8", industry: "9" };

export function chapterHash(narrative: string, gaps: string[]) {
  return createHash("sha1").update(JSON.stringify([narrative.trim(), gaps])).digest("hex").slice(0, 20);
}

/** Where each chapter of a visit cycle's SAR stands: owner from the cycle's tasks of that criterion, gaps and narrative. */
export async function chapterStatuses(cycleId: string, body: string, chs: { key: string }[], narr: Map<string, string>, gaps: { ch: string; text: string }[]): Promise<Record<string, ItemStatus & { dataGaps: number }>> {
  const tasks = await prisma.accreditationTask.findMany({ where: { cycleId }, select: { id: true, code: true, status: true, assigneeId: true, dueDate: true } }).catch(() => []);
  const users = await prisma.user.findMany({ where: { id: { in: tasks.map((t) => t.assigneeId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }).catch(() => []);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  let saved: { itemKey: string; hash: string; readyAt: Date; readyByName: string | null }[] = [];
  try { saved = await sdb.sarItemState.findMany({ where: { scopeKey: cycleId, body } }); } catch { /* not migrated */ }
  const defs = CATALOGUE[body as keyof typeof CATALOGUE]?.tasks || [];
  const withGroups = body === "NCEAC" || body === "PEC";
  const out: Record<string, ItemStatus & { dataGaps: number }> = {};
  for (const ch of chs) {
    const text = narr.get(ch.key) || "";
    const mine = gaps.filter((g) => g.ch === ch.key && !g.text.startsWith("Narrative")).map((g) => g.text);
    const group = withGroups ? CH_GROUP[ch.key] : undefined;
    const codes = group ? defs.filter((d) => d.group === group).map((d) => d.code) : [];
    const task = tasks.filter((t) => codes.includes(t.code)).sort((a, b) => (TASK_RANK[b.status] || 0) - (TASK_RANK[a.status] || 0))[0];
    const st: ItemStatus & { dataGaps: number } = { key: ch.key, state: "none", dataGaps: mine.length };
    if (task) Object.assign(st, { taskId: task.id, taskCode: task.code, taskStatus: task.status, cycleId, ownerId: task.assigneeId || undefined, owner: task.assigneeId ? nameOf.get(task.assigneeId) || "" : undefined, due: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : undefined });
    const mark = saved.find((s) => s.itemKey === ch.key);
    if (mark) { st.state = mark.hash === chapterHash(text, mine) ? "ready" : "changed"; st.readyBy = mark.readyByName || undefined; st.readyAt = new Date(mark.readyAt).toISOString().slice(0, 10); }
    else if (text.trim() && !mine.length) st.state = "entered";
    else if (text.trim() || (task && task.assigneeId && task.status !== "OPEN")) st.state = "progress";
    out[ch.key] = st;
  }
  return out;
}
