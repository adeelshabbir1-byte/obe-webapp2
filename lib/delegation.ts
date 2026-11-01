import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";

// One delegation engine for every role (Adeel prompt §13). Three kinds:
//  ACTING    — the whole position (all its delegable tasks) for a period, e.g. while the holder is on leave;
//  APPROVALS — the approvals inbox (the existing ApprovalDelegation keeps doing this; listed here too);
//  TASKS     — chosen tasks with a scope and a period — the "HOD Delegate", "Dean Delegate", "IH Delegate".
// Pages and APIs ask canDo(user, taskKey, target). Rules: no re-delegation unless "may pass on"; never self-approval;
// one active delegate per task and scope unless "shared"; never-delegable tasks are refused (unless the institute allows).
// Every delegated action is logged as "by <delegate> for <role>".

const db = prisma as unknown as Record<string, any>;
export type Task = { key: string; label: string; role: string; delegable: boolean; scopeType: "department" | "chain" | "program" | "faculty" | "institute" | "none" };

export const TASKS: Task[] = [
  // HOD (the first catalogue)
  { key: "hod.nameSE", label: "Name Subject Experts for department-common and service courses", role: "HEAD_OF_DEPARTMENT", delegable: true, scopeType: "chain" },
  { key: "hod.allocate", label: "Assign teachers to courses and sections (load-plan draft)", role: "HEAD_OF_DEPARTMENT", delegable: true, scopeType: "department" },
  { key: "hod.qbankReview", label: "First review of question-bank questions", role: "HEAD_OF_DEPARTMENT", delegable: true, scopeType: "department" },
  { key: "hod.planCheck", label: "Check SE plans before they go to the OMC", role: "HEAD_OF_DEPARTMENT", delegable: true, scopeType: "department" },
  { key: "hod.followUp", label: "Follow up overdue marks and early warnings", role: "HEAD_OF_DEPARTMENT", delegable: true, scopeType: "department" },
  { key: "hod.leave", label: "Approve leave up to N days", role: "HEAD_OF_DEPARTMENT", delegable: true, scopeType: "department" },
  { key: "hod.evidence", label: "Collect course files and accreditation evidence", role: "HEAD_OF_DEPARTMENT", delegable: true, scopeType: "department" },
  { key: "hod.timetableInputs", label: "Timetable inputs (teacher availability, rooms)", role: "HEAD_OF_DEPARTMENT", delegable: true, scopeType: "department" },
  // Dean
  { key: "dean.readiness", label: "Readiness checks and forwarding", role: "DEAN", delegable: true, scopeType: "faculty" },
  { key: "dean.reports", label: "Faculty reports", role: "DEAN", delegable: true, scopeType: "faculty" },
  { key: "dean.leave", label: "Approve leave up to N days", role: "DEAN", delegable: true, scopeType: "faculty" },
  // Institute Head
  { key: "ih.readiness", label: "Institute readiness checks and reports", role: "CHAIRMAN", delegable: true, scopeType: "institute" },
  { key: "ih.leave", label: "Approve leave up to N days", role: "CHAIRMAN", delegable: true, scopeType: "institute" },
  // Program Lead
  { key: "pl.nameSE", label: "Name Subject Experts of the program's own courses", role: "PROGRAM_COORDINATOR", delegable: true, scopeType: "program" },
  { key: "pl.review", label: "Review differences in the floor register", role: "PROGRAM_COORDINATOR", delegable: true, scopeType: "program" },
  // Never delegable (shown as "needs the holder")
  { key: "x.finalResult", label: "Final result approval", role: "*", delegable: false, scopeType: "none" },
  { key: "x.evaluation", label: "Faculty performance evaluations", role: "*", delegable: false, scopeType: "none" },
  { key: "x.hiring", label: "Hiring and visiting-faculty pay approval", role: "*", delegable: false, scopeType: "none" },
  { key: "x.discipline", label: "Disciplinary cases", role: "*", delegable: false, scopeType: "none" },
  { key: "x.statute", label: "Anything a statute says the holder signs personally", role: "*", delegable: false, scopeType: "none" },
];
export const ROLE_LABEL: Record<string, string> = { HEAD_OF_DEPARTMENT: "HOD", DEAN: "Dean", CHAIRMAN: "IH", PROGRAM_COORDINATOR: "Program Lead", OMC: "OMC Convener", DEPARTMENT_COORDINATOR: "Department Coordinator" };
export const tasksOf = (role: string) => TASKS.filter((t) => t.role === role);
export const taskByKey = (k: string) => TASKS.find((t) => t.key === k);

export type Row = { id: string; chairmanId: string; kind: string; fromUserId: string; toUserId: string; roleLabel: string; tasksJson: string; scopeJson: string; maxLeaveDays: number | null; startAt: Date; endAt: Date; mayPassOn: boolean; shared: boolean; parentId: string | null; note: string | null; revokedAt: Date | null; createdAt: Date };
export type Scope = { chains?: number[]; departmentId?: string | null; term?: string | null };
const J = <T>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
const live = (now = new Date()) => ({ revokedAt: null, startAt: { lte: now }, endAt: { gte: now } });

/** Active delegations a person holds (received). */
export async function heldBy(userId: string, now = new Date()): Promise<Row[]> {
  return ((await db.taskDelegation?.findMany({ where: { toUserId: userId, ...live(now) } }).catch(() => [])) || []) as Row[];
}
export async function given(userId: string): Promise<Row[]> {
  return ((await db.taskDelegation?.findMany({ where: { fromUserId: userId }, orderBy: { createdAt: "desc" }, take: 50 }).catch(() => [])) || []) as Row[];
}

export type Target = { chain?: number | null; departmentId?: string | null; leaveDays?: number; requesterId?: string };
/**
 * May this person do this task (on this target)? Their own right comes from their role (ownRole), else a live delegation
 * whose tasks (or ACTING) cover it and whose scope contains the target. Returns who they act for.
 */
export async function canDo(user: { id: string; role: string }, taskKey: string, target: Target = {}, now = new Date()): Promise<{ ok: boolean; own?: boolean; forUserId?: string; forLabel?: string; why?: string }> {
  const t = taskByKey(taskKey);
  if (!t) return { ok: false, why: "Unknown task." };
  if (target.requesterId && target.requesterId === user.id) return { ok: false, why: "You can't approve your own request." };
  if (t.role === user.role) return { ok: true, own: true };
  if (!t.delegable) return { ok: false, why: "This needs the holder — it can't be delegated." };
  for (const d of await heldBy(user.id, now)) {
    const covers = d.kind === "ACTING" ? t.role !== "*" && (await prisma.user.findUnique({ where: { id: d.fromUserId }, select: { role: true } }))?.role === t.role : J<string[]>(d.tasksJson, []).includes(taskKey);
    if (!covers) continue;
    const sc = J<Scope>(d.scopeJson, {});
    if (sc.chains?.length && target.chain != null && !sc.chains.includes(target.chain)) continue;
    if (sc.departmentId && target.departmentId && sc.departmentId !== target.departmentId) continue;
    if (target.leaveDays != null && d.maxLeaveDays != null && target.leaveDays > d.maxLeaveDays) continue;
    if (target.requesterId && target.requesterId === d.toUserId) continue;
    return { ok: true, forUserId: d.fromUserId, forLabel: d.kind === "ACTING" ? `Acting ${d.roleLabel}` : `for ${d.roleLabel}` };
  }
  return { ok: false, why: "You don't hold this task." };
}

/** Log an action done under a delegation: "by <delegate> for <role>". */
export async function logDelegated(actorId: string, action: string, entityType: string, entityId: string, via: { forUserId?: string; forLabel?: string }) {
  if (!via.forUserId) return;
  await writeAuditLog({ actorUserId: actorId, action, entityType, entityId, metadata: { onBehalfOf: via.forUserId, as: via.forLabel || "" } }).catch(() => null);
}

export type NewDelegation = { kind: "TASKS" | "ACTING"; toUserId: string; tasks: string[]; scope: Scope; maxLeaveDays?: number | null; startAt: Date; endAt: Date; mayPassOn?: boolean; shared?: boolean; note?: string; parentId?: string | null };
/** Create a delegation, with the engine's rules. `from` delegates his own role's tasks (or passes on one he holds). */
export async function delegate(from: { id: string; role: string; name: string }, chairmanId: string, d: NewDelegation, allowNonDelegable = false) {
  if (!db.taskDelegation) throw new Error("Run prisma/migration_adeel_p4.sql in Supabase first.");
  if (d.toUserId === from.id) throw new Error("You can't delegate to yourself.");
  if (!(d.endAt > d.startAt)) throw new Error("The end date must be after the start date.");
  let roleLabel = ROLE_LABEL[from.role] || from.role;
  if (d.parentId) {
    const p = (await db.taskDelegation.findUnique({ where: { id: d.parentId } })) as Row | null;
    if (!p || p.toUserId !== from.id || p.revokedAt || p.endAt < new Date()) throw new Error("That delegation isn't yours to pass on.");
    if (!p.mayPassOn) throw new Error("This delegation can't be passed on — the delegator didn't allow it.");
    const pt = J<string[]>(p.tasksJson, []);
    if (d.tasks.some((k) => !pt.includes(k))) throw new Error("You can only pass on tasks you were given.");
    roleLabel = p.roleLabel;
    if (d.endAt > p.endAt) d.endAt = p.endAt;
  } else if (d.kind === "TASKS") {
    for (const k of d.tasks) {
      const t = taskByKey(k);
      if (!t) throw new Error(`Unknown task ${k}.`);
      if (!t.delegable && !allowNonDelegable) throw new Error(`“${t.label}” needs the holder — it can't be delegated.`);
      if (t.role !== from.role && t.role !== "*") throw new Error(`“${t.label}” isn't a task of your role.`);
    }
  }
  if (!d.tasks.length && d.kind === "TASKS") throw new Error("Choose at least one task.");
  // One active delegate per task and scope, unless shared.
  if (!d.shared) {
    const clash = ((await db.taskDelegation.findMany({ where: { fromUserId: from.id, shared: false, ...live() } })) as Row[]).find((x) => x.kind === d.kind && J<string[]>(x.tasksJson, []).some((k) => d.tasks.includes(k)) && JSON.stringify(J<Scope>(x.scopeJson, {})) === JSON.stringify(d.scope));
    if (clash) throw new Error("Someone already holds one of these tasks for the same scope. Revoke that first, or tick “shared”.");
  }
  const id = randomUUID();
  await db.taskDelegation.create({ data: { id, chairmanId, kind: d.kind, fromUserId: from.id, toUserId: d.toUserId, roleLabel, tasksJson: JSON.stringify(d.tasks), scopeJson: JSON.stringify(d.scope || {}), maxLeaveDays: d.maxLeaveDays ?? null, startAt: d.startAt, endAt: d.endAt, mayPassOn: !!d.mayPassOn, shared: !!d.shared, parentId: d.parentId || null, note: d.note || null } });
  await writeAuditLog({ actorUserId: from.id, action: "DELEGATED", entityType: "TaskDelegation", entityId: id, metadata: { to: d.toUserId, kind: d.kind, tasks: d.tasks.join(",") } }).catch(() => null);
  await notifyUsers([d.toUserId], { kind: "DELEGATION", title: `${from.name} delegated to you (${d.kind === "ACTING" ? `Acting ${roleLabel}` : `${roleLabel} Delegate`})`, body: d.tasks.map((k) => taskByKey(k)?.label || k).join(" · ") + ` — until ${d.endAt.toLocaleDateString("en-GB")}`, href: "/delegations" }).catch(() => null);
  return id;
}

export async function revoke(userId: string, id: string) {
  const r = (await db.taskDelegation?.findUnique({ where: { id } })) as Row | null;
  if (!r || r.fromUserId !== userId) throw new Error("Not yours to revoke.");
  await db.taskDelegation.update({ where: { id }, data: { revokedAt: new Date() } });
  await db.taskDelegation.updateMany({ where: { parentId: id, revokedAt: null }, data: { revokedAt: new Date() } }); // passed-on copies end too
  await writeAuditLog({ actorUserId: userId, action: "DELEGATION_REVOKED", entityType: "TaskDelegation", entityId: id }).catch(() => null);
  await notifyUsers([r.toUserId], { kind: "DELEGATION", title: "A delegation to you was revoked", href: "/delegations" }).catch(() => null);
}

/** Weekly summary for each delegator: what their delegates did in his name (Mondays, from the cron). */
export async function weeklyDelegationSummary(now = new Date()) {
  if (now.getUTCDay() !== 1) return 0;
  const since = new Date(now.getTime() - 7 * 864e5);
  const logs = await prisma.auditLog.findMany({ where: { createdAt: { gte: since }, entityType: { not: "TaskDelegation" } }, select: { actorUserId: true, action: true, metadata: true }, take: 5000 }).catch(() => []);
  const by = new Map<string, number>();
  for (const l of logs) { const f = (l.metadata as { onBehalfOf?: string } | null)?.onBehalfOf; if (f) by.set(f, (by.get(f) || 0) + 1); }
  for (const [fromId, n] of Array.from(by.entries())) await notifyUsers([fromId], { kind: "DELEGATION", title: `Your delegates did ${n} action${n === 1 ? "" : "s"} for you this week`, href: "/delegations" }).catch(() => null);
  return by.size;
}
