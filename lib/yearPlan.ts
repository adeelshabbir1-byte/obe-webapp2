import { randomUUID } from "crypto";
import { prisma } from "./db";
import { yearAllocation } from "./yearAllocation";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";
import type { MatrixUser } from "./assignerMatrix";

// The one-year allocation plan (Adeel prompt §25.1, 11, 13): Fall + Spring (+ tentative Summer) from the forecast.
// The assigner edits teachers per row or marks "Visiting needed"; submitting is blocked until every Fall and Spring
// section has a teacher or is marked Visiting; the HOD (or his delegate) approves the whole year. After approval every
// change is logged with a reason and the teacher is told. Draft A and Draft B can be kept and compared by their score.
const db = prisma as unknown as Record<string, any>;
export type PRow = { key: string; term: string; summer: boolean; code: string; title: string; batch: string; sections: number; teachers: { id: string; name: string; n: number }[]; visiting: number };
export type Plan = { id: string; chairmanId: string; scopeKey: string; yearLabel: string; draft: string; status: string; rowsJson: string; deadline: Date | null; submittedById: string | null; approvedById: string | null; approvedAt: Date | null; changesJson: string; updatedAt: Date };
const J = <T>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
export const rowsOf = (p: Plan) => J<PRow[]>(p.rowsJson, []);
export const scopeKeyOf = (u: MatrixUser) => (u.role === "COURSE_ASSIGNER" ? `dept:${u.departmentId || "all"}` : u.role === "PROGRAM_COORDINATOR" ? `pl:${u.id}` : `inst`);
export const yearLabelNow = (d = new Date()) => (d.getUTCMonth() >= 6 ? `${d.getUTCFullYear()}-${String(d.getUTCFullYear() + 1).slice(2)}` : `${d.getUTCFullYear() - 1}-${String(d.getUTCFullYear()).slice(2)}`);

export function completeness(rows: PRow[]) {
  const by = new Map<string, { term: string; summer: boolean; need: number; done: number }>();
  for (const r of rows) {
    const o = by.get(r.term) || { term: r.term, summer: r.summer, need: 0, done: 0 };
    o.need += r.sections; o.done += Math.min(r.sections, r.teachers.reduce((a, t) => a + t.n, 0) + r.visiting);
    by.set(r.term, o);
  }
  return Array.from(by.values()).map((x) => ({ ...x, pct: x.need ? Math.round((100 * x.done) / x.need) : 100 }));
}
/** Score of a draft: preferences met %, load balance, visiting share. */
export async function scoreOf(rows: PRow[]) {
  const prefs = await prisma.facultyCoursePreference.findMany({ where: { facultyId: { in: Array.from(new Set(rows.flatMap((r) => r.teachers.map((t) => t.id)))).concat("none") } }, select: { facultyId: true, courseCode: true } });
  const want = new Set(prefs.map((p) => `${p.facultyId}|${p.courseCode.toUpperCase()}`));
  let given = 0, met = 0; const load = new Map<string, number>();
  for (const r of rows.filter((x) => !x.summer)) for (const t of r.teachers) { given += t.n; if (want.has(`${t.id}|${r.code.toUpperCase()}`)) met += t.n; load.set(t.id, (load.get(t.id) || 0) + t.n); }
  const loads = Array.from(load.values()); const mean = loads.reduce((a, b) => a + b, 0) / Math.max(1, loads.length);
  const sd = Math.sqrt(loads.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, loads.length));
  const visiting = rows.filter((x) => !x.summer).reduce((a, r) => a + r.visiting, 0);
  const prefPct = given ? Math.round((100 * met) / given) : 0;
  return { prefPct, balance: Math.max(0, Math.round(100 - sd * 25)), visiting, score: Math.round(prefPct * 0.6 + Math.max(0, 100 - sd * 25) * 0.4 - visiting) };
}

export async function getPlan(user: MatrixUser, chairmanId: string, draft = "A") {
  return ((await db.allocationPlan?.findUnique({ where: { chairmanId_scopeKey_yearLabel_draft: { chairmanId, scopeKey: scopeKeyOf(user), yearLabel: yearLabelNow(), draft } } }).catch(() => null)) || null) as Plan | null;
}
/** Start (or restart) a draft from the forecast. */
export async function startFromForecast(user: MatrixUser & { name?: string }, chairmanId: string, draft = "A") {
  if (!db.allocationPlan) throw new Error("Run prisma/migration_adeel_p8.sql in Supabase first.");
  const f = await yearAllocation(user);
  const rows: PRow[] = f.terms.flatMap((t) => t.rows.map((r, i) => ({ key: `${t.label}|${r.code}|${r.batch}|${i}`, term: t.label, summer: t.summer, code: r.code, title: r.title, batch: r.batch, sections: r.sections, teachers: r.teachers.filter((x) => x.id).map((x) => ({ id: x.id!, name: x.name, n: x.n })), visiting: 0 })));
  const where = { chairmanId_scopeKey_yearLabel_draft: { chairmanId, scopeKey: scopeKeyOf(user), yearLabel: yearLabelNow(), draft } };
  const had = await db.allocationPlan.findUnique({ where });
  if (had && had.status === "APPROVED") throw new Error("The approved plan can't be restarted; change rows with a reason.");
  await db.allocationPlan.upsert({ where, create: { id: randomUUID(), chairmanId, scopeKey: scopeKeyOf(user), yearLabel: yearLabelNow(), draft, rowsJson: JSON.stringify(rows), createdById: user.id }, update: { rowsJson: JSON.stringify(rows), status: "DRAFT", updatedAt: new Date() } });
  return rows.length;
}
/** Change one row: teachers [{id, n}] and visiting count. After approval, a reason is required and the teachers are told. */
export async function editRow(user: MatrixUser & { name?: string }, plan: Plan, key: string, teachers: { id: string; name: string; n: number }[], visiting: number, reason?: string) {
  const rows = rowsOf(plan); const r = rows.find((x) => x.key === key);
  if (!r) throw new Error("Row not found.");
  if (plan.status === "SUBMITTED") throw new Error("Waiting for the HOD's approval — withdraw it to change.");
  const approved = plan.status === "APPROVED";
  if (approved && (!reason || reason.trim().length < 5)) throw new Error("The plan is approved: give a reason for the change.");
  if (approved) { const lock = await termLocked(plan.chairmanId, r.term); if (lock) throw new Error(`${r.term} has started — it is locked.`); }
  const before = r.teachers.map((t) => t.id);
  r.teachers = teachers.filter((t) => t.n > 0); r.visiting = Math.max(0, visiting);
  const changes = J<unknown[]>(plan.changesJson, []);
  if (approved) changes.push({ at: new Date().toISOString(), by: user.name || user.id, key, reason, from: before, to: r.teachers.map((t) => t.id) });
  await db.allocationPlan.update({ where: { id: plan.id }, data: { rowsJson: JSON.stringify(rows), changesJson: JSON.stringify(changes), updatedAt: new Date() } });
  if (approved) {
    const told = Array.from(new Set([...before, ...r.teachers.map((t) => t.id)]));
    await notifyUsers(told, { kind: "ASSIGNMENT", title: `Allocation changed: ${r.code} (${r.term})`, body: reason, href: "/allocation/year-card" }).catch(() => null);
    await writeAuditLog({ actorUserId: user.id, action: "ALLOCATION_CHANGED", entityType: "AllocationPlan", entityId: plan.id, metadata: { key, reason: reason || "" } }).catch(() => null);
  }
}
/** A term locks when it has started (its first teaching day in the academic calendar). */
export async function termLocked(chairmanId: string, term: string) {
  const [name, year] = term.split(" ");
  const start = await (await import("./midFeedback")).termStart(chairmanId, name, Number(year)).catch(() => null);
  return !!start && start <= new Date();
}
export async function submit(user: MatrixUser & { name?: string }, plan: Plan, markVisiting: boolean) {
  const rows = rowsOf(plan);
  if (markVisiting) for (const r of rows.filter((x) => !x.summer)) { const have = r.teachers.reduce((a, t) => a + t.n, 0) + r.visiting; if (have < r.sections) r.visiting += r.sections - have; }
  const open = completeness(rows).filter((c) => !c.summer && c.done < c.need);
  if (open.length) throw new Error(`Every Fall and Spring section needs a teacher or "Visiting needed": ${open.map((c) => `${c.term} ${c.need - c.done} open`).join(", ")}.`);
  await db.allocationPlan.update({ where: { id: plan.id }, data: { rowsJson: JSON.stringify(rows), status: "SUBMITTED", submittedById: user.id, submittedAt: new Date(), updatedAt: new Date() } });
  const hods = await prisma.user.findMany({ where: { role: "HEAD_OF_DEPARTMENT", managedById: plan.chairmanId, isActive: true, ...(user.departmentId ? { departmentId: user.departmentId } : {}) }, select: { id: true } });
  await notifyUsers(hods.map((h) => h.id), { kind: "APPROVAL", title: `Year allocation plan ${plan.yearLabel} waits for your approval`, href: "/allocation/year-plan" }).catch(() => null);
}
export async function decide(user: { id: string; role: string; name: string }, plan: Plan, approve: boolean) {
  const { canDo } = await import("./delegation");
  if (user.role !== "HEAD_OF_DEPARTMENT" && user.role !== "CHAIRMAN" && !(await canDo(user, "hod.allocate")).ok) throw new Error("Only the HOD (or his delegate) approves the year plan.");
  if (plan.submittedById === user.id) throw new Error("You can't approve your own plan.");
  if (plan.status !== "SUBMITTED") throw new Error("Not submitted.");
  await db.allocationPlan.update({ where: { id: plan.id }, data: { status: approve ? "APPROVED" : "DRAFT", approvedById: approve ? user.id : null, approvedAt: approve ? new Date() : null, updatedAt: new Date() } });
  if (approve) {
    const ids = Array.from(new Set(rowsOf(plan).flatMap((r) => r.teachers.map((t) => t.id))));
    await notifyUsers(ids, { kind: "ASSIGNMENT", title: `Your teaching for ${plan.yearLabel} is ready`, body: "See your year card; accept it or raise a concern within 3 working days.", href: "/allocation/year-card" }).catch(() => null);
  }
  if (plan.submittedById) await notifyUsers([plan.submittedById], { kind: "APPROVAL", title: approve ? "Year plan approved" : "Year plan returned for changes", href: "/allocation/year-plan" }).catch(() => null);
}
/** The approved plans that include this teacher, and his rows. */
export async function yearCardOf(userId: string, chairmanId: string) {
  const plans = ((await db.allocationPlan?.findMany({ where: { chairmanId, status: "APPROVED", yearLabel: yearLabelNow() } }).catch(() => [])) || []) as Plan[];
  return plans.map((p) => ({ plan: p, rows: rowsOf(p).filter((r) => r.teachers.some((t) => t.id === userId)).map((r) => ({ ...r, mine: r.teachers.find((t) => t.id === userId)!.n })) })).filter((x) => x.rows.length);
}
