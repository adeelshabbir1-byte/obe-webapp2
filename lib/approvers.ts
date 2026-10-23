import { prisma } from "./db";
import { titlesFor, type TitleKey, type Titles } from "./titles";

// Who approves for a position: approverFor(institute, positionKey, scope). Used by every approval flow (leave, results,
// student status changes, degree-plan requests, assessment-rule exceptions, accreditation tasks), so when a position is
// vacant, switched off or someone is acting in it, the approvals and notifications follow by themselves — and move back
// when the position is filled.
//
//  • An acting holder (set on the organisation chart, from–to dates) takes the position's approvals while it lasts.
//  • A position nobody holds, one switched off on the chart, or one the institute has switched off under Position titles,
//    passes its powers on:  Dean → the department's Chairman/HoD → Institute Head;  Chairman/HoD → Dean → Institute Head;
//    Program Lead → Chairman/HoD → Dean → Institute Head;  Controller of Examinations / QEC In-charge → whoever their chart
//    position sits under → Institute Head.

const adb = prisma as unknown as Record<string, any>;
export type PositionKey = Exclude<TitleKey, "OMC" | "COURSE_ASSIGNER" | "BATCH_ADVISOR">;
export type Scope = { departmentId?: string | null; program?: string | null; leadId?: string | null; facultyId?: string | null };
export type Approver = { ids: string[]; key: PositionKey; requested: PositionKey; covering: boolean; acting: boolean; reason: "" | "vacant" | "off"; note: string };

const CHAIN: Record<PositionKey, PositionKey[]> = {
  INSTITUTE_HEAD: ["INSTITUTE_HEAD"],
  DEAN: ["DEAN", "HEAD_OF_DEPARTMENT", "INSTITUTE_HEAD"],
  HEAD_OF_DEPARTMENT: ["HEAD_OF_DEPARTMENT", "DEAN", "INSTITUTE_HEAD"],
  PROGRAM_LEAD: ["PROGRAM_LEAD", "HEAD_OF_DEPARTMENT", "DEAN", "INSTITUTE_HEAD"],
  DEPARTMENT_COORDINATOR: ["DEPARTMENT_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN", "INSTITUTE_HEAD"],
  EXAM_CONTROLLER: ["EXAM_CONTROLLER", "INSTITUTE_HEAD"],
  QEC_INCHARGE: ["QEC_INCHARGE", "INSTITUTE_HEAD"],
};
/** The chart role a position carries for each key. */
const CHART_ROLE: Record<PositionKey, string> = { INSTITUTE_HEAD: "ROOT", DEAN: "DEAN", HEAD_OF_DEPARTMENT: "HEAD_OF_DEPARTMENT", PROGRAM_LEAD: "PROGRAM_LEAD", DEPARTMENT_COORDINATOR: "DEPARTMENT_COORDINATOR", EXAM_CONTROLLER: "EXAM_CONTROLLER", QEC_INCHARGE: "QEC_INCHARGE" };
export const DUTY_HAT: Partial<Record<PositionKey, string>> = { EXAM_CONTROLLER: "EXAM_CONTROLLER", QEC_INCHARGE: "QEC_INCHARGE" };

type Pos = { id: string; parentId: string | null; role: string; covers: string[]; facultyId: string | null; departmentId: string | null; program: string | null; holderId: string | null; offAt: Date | null };
type Chart = { positions: Pos[]; acting: Map<string, string[]> };

async function chartOf(chairmanId: string): Promise<Chart> {
  try {
    const rows = (await adb.orgPosition.findMany({ where: { chairmanId } })) as (Omit<Pos, "covers"> & { coversJson: string })[];
    const now = new Date();
    const act = (await adb.orgActing.findMany({ where: { chairmanId, endedAt: null, fromDate: { lte: now }, toDate: { gte: now } } }).catch(() => [])) as { positionId: string; userId: string }[];
    const acting = new Map<string, string[]>();
    for (const a of act) acting.set(a.positionId, [...(acting.get(a.positionId) || []), a.userId]);
    return { positions: rows.map(({ coversJson, ...p }) => { let covers: string[] = []; try { covers = JSON.parse(coversJson); } catch { covers = []; } return { ...p, offAt: p.offAt ?? null, covers }; }), acting };
  } catch { return { positions: [], acting: new Map() }; }
}

const staffOf = (chairmanId: string) => ({ isActive: true, OR: [{ managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] });
const hatWhere = (role: string) => ({ OR: [{ role }, { secondaryRole: role }, { tertiaryRole: role }, { extraRoles: { has: role } }] });

async function facultyOf(scope: Scope) {
  if (scope.facultyId) return scope.facultyId;
  if (!scope.departmentId) return null;
  return (await prisma.department.findUnique({ where: { id: scope.departmentId }, select: { facultyId: true } }))?.facultyId || null;
}

/** People who hold the position by their roles (or duty hats). */
async function holders(chairmanId: string, key: PositionKey, scope: Scope): Promise<string[]> {
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  if (key === "INSTITUTE_HEAD") return [chairmanId];
  if (key === "DEAN") {
    const f = await facultyOf(scope);
    if (!f) return [];
    return ids(await prisma.user.findMany({ where: { AND: [staffOf(chairmanId), hatWhere("DEAN") as never, { facultyId: f }] }, select: { id: true } }));
  }
  if (key === "HEAD_OF_DEPARTMENT" || key === "DEPARTMENT_COORDINATOR") {
    if (!scope.departmentId) return [];
    return ids(await prisma.user.findMany({ where: { AND: [staffOf(chairmanId), hatWhere(key) as never, { departmentId: scope.departmentId }] }, select: { id: true } }));
  }
  if (key === "PROGRAM_LEAD") {
    if (scope.leadId) return ids(await prisma.user.findMany({ where: { id: scope.leadId, isActive: true }, select: { id: true } }));
    if (!scope.program) return [];
    return ids(await prisma.user.findMany({ where: { AND: [staffOf(chairmanId), hatWhere("PROGRAM_COORDINATOR") as never, { leadProgram: scope.program }] }, select: { id: true } }));
  }
  const hat = DUTY_HAT[key];
  return hat ? ids(await prisma.user.findMany({ where: { AND: [staffOf(chairmanId), { extraRoles: { has: hat } }] }, select: { id: true } })) : [];
}

/** The chart position standing for this key and scope, if the chart has one. */
function positionFor(chart: Chart, key: PositionKey, scope: Scope, facultyId: string | null): Pos | null {
  const role = CHART_ROLE[key];
  const has = (p: Pos) => (role === "ROOT" ? !p.parentId : p.role === role || p.covers.includes(role));
  const fits = (p: Pos) =>
    key === "DEAN" ? !!facultyId && p.facultyId === facultyId
      : key === "HEAD_OF_DEPARTMENT" || key === "DEPARTMENT_COORDINATOR" ? !!scope.departmentId && p.departmentId === scope.departmentId
        : key === "PROGRAM_LEAD" ? (!!scope.program && p.program === scope.program) || (!!scope.leadId && p.holderId === scope.leadId)
          : true;
  return chart.positions.find((p) => has(p) && fits(p)) || null;
}

/** Holders of a position's parent chain, nearest first (for duties that pass to "whoever it sits under"). */
function aboveHolders(chart: Chart, p: Pos | null): string[] {
  let x = p?.parentId ? chart.positions.find((y) => y.id === p.parentId) : undefined;
  for (let i = 0; i < 10 && x; i++) {
    if (!x.offAt) { const a = chart.acting.get(x.id); if (a?.length) return a; if (x.holderId) return [x.holderId]; }
    x = x.parentId ? chart.positions.find((y) => y.id === x!.parentId) : undefined;
  }
  return [];
}

export async function approverFor(chairmanId: string, requested: PositionKey, scope: Scope = {}, ctx?: { titles?: Titles; chart?: Chart }): Promise<Approver> {
  const titles = ctx?.titles || (await titlesFor(chairmanId));
  const chart = ctx?.chart || (await chartOf(chairmanId));
  const facultyId = await facultyOf(scope);
  let reason: Approver["reason"] = "";
  for (const key of CHAIN[requested]) {
    const pos = positionFor(chart, key, scope, facultyId);
    const off = !titles[key].enabled || !!pos?.offAt;
    if (!off) {
      const acting = pos ? chart.acting.get(pos.id) : undefined;
      if (acting?.length) return done(key, acting, true);
      const ids = await holders(chairmanId, key, { ...scope, facultyId });
      if (ids.length) return done(key, ids, false);
    }
    if (key === requested) reason = off ? "off" : "vacant";
    // A duty with no holder goes to whoever its chart position sits under.
    if (DUTY_HAT[key] && pos) { const up = aboveHolders(chart, pos); if (up.length) return done(key, up, false, true); }
  }
  return done("INSTITUTE_HEAD", [chairmanId], false);

  function done(key: PositionKey, ids: string[], acting: boolean, viaParent = false): Approver {
    const covering = key !== requested || viaParent;
    const t = (k: PositionKey) => titles[k].title;
    const why = reason === "off" ? `the institute has no ${t(requested)}` : `no ${t(requested)}`;
    const note = !covering ? (acting ? `${t(requested)} (acting)` : t(requested))
      : viaParent ? `${t(requested)}'s approvals → the position it sits under (${why})`
        : `${t(requested)}'s approvals → ${t(key)} (${why})`;
    return { ids: Array.from(new Set(ids)), key, requested, covering, acting, reason, note };
  }
}

/** Shortcut: just the people. */
export async function approverIds(chairmanId: string, requested: PositionKey, scope: Scope = {}): Promise<string[]> {
  return (await approverFor(chairmanId, requested, scope)).ids;
}

/** For the organisation chart: who covers each vacant or switched-off position. */
export async function coverageNotes(chairmanId: string): Promise<Record<string, string>> {
  const [titles, chart] = await Promise.all([titlesFor(chairmanId), chartOf(chairmanId)]);
  const out: Record<string, string> = {};
  const keyOf: Record<string, PositionKey> = { DEAN: "DEAN", HEAD_OF_DEPARTMENT: "HEAD_OF_DEPARTMENT", PROGRAM_LEAD: "PROGRAM_LEAD", DEPARTMENT_COORDINATOR: "DEPARTMENT_COORDINATOR", EXAM_CONTROLLER: "EXAM_CONTROLLER", QEC_INCHARGE: "QEC_INCHARGE" };
  const names = new Map((await prisma.user.findMany({ where: { id: { in: chart.positions.map((p) => p.holderId).filter((x): x is string => !!x).concat(Array.from(chart.acting.values()).flat(), [chairmanId]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  for (const p of chart.positions) {
    const key = keyOf[p.role];
    if (!key) continue;
    const acting = chart.acting.get(p.id);
    if (!p.offAt && titles[key].enabled && (p.holderId || acting?.length)) continue;
    const a = await approverFor(chairmanId, key, { departmentId: p.departmentId, program: p.program, facultyId: p.facultyId }, { titles, chart });
    if (a.covering) out[p.id] = `${a.note}: ${a.ids.map((i) => names.get(i) || "—").join(", ")}`;
  }
  return out;
}
