import { prisma } from "../db";
import { chairmanIdFor, roleLabel } from "../reportScope";
import { bodyOfProgram, programBindings, type BodyKey } from "./bodies";
import { ASSIGNABLE_ROLES, CATALOGUE, taskDef, type TaskDef } from "./catalogue";
import { SourceLoader, dataScore, sourcesForTask, type Gap, type SourceResult } from "./sources";

// Accreditation visits, their delegated tasks, and who may do what with them.
//   Institute Head: every program. Dean: the programs of their faculty's departments. Chairman: their department.
//   They plan visits, assign, reassign, revoke and override tasks, and approve or return the work.
//   Program Coordinator and Program Lead: see their department's / program's visits. Assignees: their own tasks.

export const MANAGERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"];
export const VIEWERS = [...MANAGERS, "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR", "OMC"];
type Who = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null };

export type GovScope = { chairmanId: string; departmentIds: string[] | null; leadId: string | null; canManage: boolean; canBind: boolean; canSetStandards: boolean };

/** What this person may see and manage (null: nothing). departmentIds null = every department. */
export async function govScope(user: Who): Promise<GovScope | null> {
  if (!VIEWERS.includes(user.role)) return null;
  const chairmanId = user.role === "CHAIRMAN" ? user.id : (await chairmanIdFor(user)) || "";
  if (!chairmanId) return null;
  let departmentIds: string[] | null = null, leadId: string | null = null;
  if (user.role === "DEAN") departmentIds = (await prisma.department.findMany({ where: { chairmanId, facultyId: user.facultyId || "none" }, select: { id: true } })).map((d) => d.id);
  else if (user.role === "HEAD_OF_DEPARTMENT" || user.role === "DEPARTMENT_COORDINATOR") departmentIds = user.departmentId ? [user.departmentId] : [];
  else if (user.role === "PROGRAM_COORDINATOR") { leadId = user.id; departmentIds = user.departmentId ? [user.departmentId] : []; }
  return { chairmanId, departmentIds, leadId, canManage: MANAGERS.includes(user.role), canBind: user.role === "CHAIRMAN", canSetStandards: user.role === "CHAIRMAN" || user.role === "OMC" };
}

export const inScope = (s: GovScope, cycle: { chairmanId: string; departmentId: string | null; leadId: string }) =>
  cycle.chairmanId === s.chairmanId && (s.leadId ? cycle.leadId === s.leadId : s.departmentIds === null || (!!cycle.departmentId && s.departmentIds.includes(cycle.departmentId)));

/** The programs (Program Leads) this scope covers, with their council. */
export async function programsInScope(s: GovScope) {
  const leads = await prisma.user.findMany({
    where: { role: "PROGRAM_COORDINATOR", managedById: s.chairmanId, isActive: true, isVisitingPlaceholder: false, leadProgram: { not: null }, ...(s.leadId ? { id: s.leadId } : s.departmentIds ? { departmentId: { in: s.departmentIds.concat("none") } } : {}) },
    select: { id: true, name: true, leadProgram: true, departmentId: true, department_: { select: { name: true } } }, orderBy: [{ departmentId: "asc" }, { leadProgram: "asc" }],
  });
  const bindings = await programBindings(s.chairmanId);
  return leads.map((l) => {
    const program = l.leadProgram || l.name;
    const b = bindings.find((x) => x.program === program);
    return { leadId: l.id, leadName: l.name, program, departmentId: l.departmentId, department: l.department_?.name || "—", body: (b?.body || "HEC") as BodyKey, explicit: !!b?.explicit };
  });
}

export async function cyclesInScope(s: GovScope, opts: { includeClosed?: boolean } = {}) {
  const rows = await prisma.accreditationCycle.findMany({ where: { chairmanId: s.chairmanId, ...(opts.includeClosed ? {} : { status: "OPEN" }) }, orderBy: [{ visitDate: "asc" }, { createdAt: "desc" }] });
  return rows.filter((c) => inScope(s, c));
}

/** Open a visit for a program: one task for every requirement of the program's council. */
export async function openCycle(s: GovScope, by: string, leadId: string, opts: { title?: string; visitDate?: Date | null }) {
  const lead = await prisma.user.findFirst({ where: { id: leadId, role: "PROGRAM_COORDINATOR", managedById: s.chairmanId }, select: { id: true, leadProgram: true, name: true, departmentId: true } });
  if (!lead) return { error: "Choose one of your programs." };
  if (!lead.leadProgram) return { error: "This Program Lead has no program named yet." };
  if (s.departmentIds && !(lead.departmentId && s.departmentIds.includes(lead.departmentId))) return { error: "That program is not in your area." };
  const program = lead.leadProgram;
  const { body } = await bodyOfProgram(s.chairmanId, program);
  const open = await prisma.accreditationCycle.findFirst({ where: { leadId, status: "OPEN", body }, select: { id: true } });
  if (open) return { error: "This program already has an open visit.", id: open.id };
  const cycle = await prisma.accreditationCycle.create({
    data: { chairmanId: s.chairmanId, departmentId: lead.departmentId, leadId, program, body, title: opts.title?.trim() || `${program} — ${body} visit`, visitDate: opts.visitDate || null, createdById: by },
  });
  await prisma.accreditationTask.createMany({ data: CATALOGUE[body].tasks.map((t) => ({ cycleId: cycle.id, code: t.code })) });
  return { id: cycle.id, body };
}

// ---------------------------------------------------------------------------------------------------- tasks

export type TaskRow = Awaited<ReturnType<typeof prisma.accreditationTask.findMany>>[number];
export type TaskData = { checked?: Record<string, boolean>; fields?: Record<string, string>; verifiedProfiles?: string[] };
export const parseData = (t: { dataJson: string }): TaskData => { try { const d = JSON.parse(t.dataJson); return d && typeof d === "object" ? d : {}; } catch { return {}; } };

/** Whether the assignee may still change the task: theirs, open, the visit open and the access not run out. */
export function canWorkOn(userId: string, t: Pick<TaskRow, "assigneeId" | "status" | "accessUntil">, cycle: { status: string }) {
  return t.assigneeId === userId && (t.status === "ASSIGNED" || t.status === "RETURNED") && cycle.status === "OPEN" && (!t.accessUntil || t.accessUntil > new Date());
}

/**
 * How far a task has come (0–100): 70% from how complete the data behind it is (the checks its sources settle, or the
 * assignee's checklist where nothing is checkable) and 30% from verification — signed off by the assignee (half) and
 * approved by the Chairman or Dean (all).
 */
export function taskProgress(def: TaskDef, t: { status: string; dataJson: string }, data: number | null) {
  const d = parseData(t);
  const ticked = def.checklist.filter((c) => d.checked?.[c]).length;
  const list = def.checklist.length ? ticked / def.checklist.length : 0;
  const dataPart = data === null ? list : data / 100;
  const verify = t.status === "APPROVED" ? 1 : t.status === "SUBMITTED" ? 0.5 : 0;
  return t.status === "APPROVED" ? 100 : Math.round(70 * dataPart + 30 * verify);
}

/** Default access window: a week after the due date, else the visit date, else 60 days. */
export function accessWindow(due: Date | null, visit: Date | null) {
  if (due) return new Date(due.getTime() + 7 * 864e5);
  if (visit && visit.getTime() > Date.now()) return new Date(visit.getTime() + 864e5);
  return new Date(Date.now() + 60 * 864e5);
}

/** People a manager may give tasks to: Program Leads, teachers and administrative staff of the institute, in their area. */
export async function assignablePeople(s: GovScope) {
  const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: s.chairmanId }, select: { id: true, departmentId: true } });
  const people = await prisma.user.findMany({
    where: { isActive: true, isVisitingPlaceholder: false, OR: [{ managedById: s.chairmanId }, { managedById: { in: leads.map((l) => l.id).concat("none") } }] },
    select: { id: true, name: true, role: true, secondaryRole: true, tertiaryRole: true, extraRoles: true, departmentId: true, managedById: true },
  });
  const deptOfLead = new Map(leads.map((l) => [l.id, l.departmentId]));
  const STAFF = ["LIBRARIAN", "FINANCE_OFFICER", "LAB_MANAGER", "FACILITIES_MANAGER", "STUDENT_AFFAIRS", "OMC"];
  return people
    .map((p) => {
      const roles = [p.role, p.secondaryRole, p.tertiaryRole, ...(p.extraRoles || [])].filter((r): r is string => !!r && ASSIGNABLE_ROLES.includes(r));
      const dept = p.departmentId || (p.managedById ? deptOfLead.get(p.managedById) || null : null);
      return { id: p.id, name: p.name, roles, label: roles.map(roleLabel).join(", "), departmentId: dept, staff: roles.some((r) => STAFF.includes(r)) };
    })
    .filter((p) => p.roles.length && (s.departmentIds === null || p.staff || (p.departmentId && s.departmentIds.includes(p.departmentId))))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------------- readiness of a visit

export type TaskView = { id: string; code: string; title: string; group: string; status: string; assigneeId: string | null; dueDate: Date | null; accessUntil: Date | null; progress: number; data: number | null; gaps: Gap[] };
export type CycleView = {
  cycle: Awaited<ReturnType<typeof prisma.accreditationCycle.findUnique>> & {};
  tasks: TaskView[]; groups: { key: string; title: string; pct: number; tasks: number }[]; overall: number; gaps: Gap[]; unassigned: number; overdue: number;
};

/** A visit's tasks with their progress, the readiness of each form / criterion, and every gap found. */
export async function cycleView(cycleId: string, opts: { withSources?: boolean } = {}): Promise<(CycleView & { sources: Map<string, SourceResult[]> }) | null> {
  const cycle = await prisma.accreditationCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return null;
  const body = cycle.body as BodyKey;
  const tasks = await prisma.accreditationTask.findMany({ where: { cycleId } });
  const loader = await new SourceLoader({ chairmanId: cycle.chairmanId, leadId: cycle.leadId, program: cycle.program, departmentId: cycle.departmentId, body }).init();
  const sources = new Map<string, SourceResult[]>();
  const views: TaskView[] = [];
  for (const def of CATALOGUE[body].tasks) {
    const t = tasks.find((x) => x.code === def.code);
    if (!t) continue;
    const res = await sourcesForTask(loader, def);
    if (opts.withSources) sources.set(t.id, res);
    const data = dataScore(res);
    views.push({ id: t.id, code: def.code, title: def.title, group: def.group, status: t.status, assigneeId: t.assigneeId, dueDate: t.dueDate, accessUntil: t.accessUntil, progress: taskProgress(def, t, data), data, gaps: res.flatMap((r) => r.gaps) });
  }
  const groups = CATALOGUE[body].groups.map((g) => {
    const mine = views.filter((v) => v.group === g.key);
    return { key: g.key, title: g.title, tasks: mine.length, pct: mine.length ? Math.round(mine.reduce((n, v) => n + v.progress, 0) / mine.length) : 0 };
  });
  const overall = views.length ? Math.round(views.reduce((n, v) => n + v.progress, 0) / views.length) : 0;
  // Gaps are listed once per kind of problem (the same missing folder can come up under two tasks).
  const seen = new Set<string>();
  const gaps = views.flatMap((v) => v.gaps).filter((g) => (seen.has(g.kind + g.text) ? false : (seen.add(g.kind + g.text), true)));
  const unassigned = views.filter((v) => v.status === "OPEN").length;
  const overdue = views.filter((v) => v.dueDate && v.dueDate < new Date() && v.status !== "APPROVED" && v.status !== "SUBMITTED").length;
  return { cycle, tasks: views, groups, overall, gaps, unassigned, overdue, sources };
}

export const def = (body: string, code: string) => taskDef(body as BodyKey, code);
