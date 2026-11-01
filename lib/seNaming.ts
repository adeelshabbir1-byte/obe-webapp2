import { prisma } from "./db";
import { subjectKey } from "./courseHomeCore";
import { chainFor, numberSetting } from "./scopedSettings";

// Who names the Subject Expert of a course, by its approved home (Adeel prompt §11), and each person's live SE load (§35).
//  PROGRAM home → that program's Program Lead · DEPARTMENT / SERVICE / GE home → the HOD of that department (or his
//  delegate, once the delegation engine names one) · follower copies → nobody (they use the base's SE).
// No approved homes yet (the BOS hasn't approved codes) → the old rule: the course's own Program Lead.
const db = prisma as unknown as Record<string, any>;
export const SE_MAX_KEY = "se.maxCourses";

type HomeRow = { key: string; level: "GE" | "SERVICE" | "DEPARTMENT" | "PROGRAM"; departmentId: string | null; program: string | null; chain: number | null };
const homesCache = new Map<string, { at: number; rows: HomeRow[]; merges: Map<string, string> }>();
async function homes(chairmanId: string) {
  const c = homesCache.get(chairmanId);
  if (c && Date.now() - c.at < 60_000) return c;
  const [rows, merges] = await Promise.all([
    (db.courseHome?.findMany({ where: { chairmanId }, select: { key: true, level: true, departmentId: true, program: true, chain: true } }).catch(() => []) || []) as Promise<HomeRow[]>,
    (db.courseKeyMerge?.findMany({ where: { chairmanId } }).catch(() => []) || []) as Promise<{ fromKey: string; toKey: string }[]>,
  ]);
  const v = { at: Date.now(), rows: rows || [], merges: new Map((merges || []).map((m) => [m.fromKey, m.toKey])) };
  homesCache.set(chairmanId, v);
  return v;
}
/** The approved home of a course (by its subject), or null when none is approved yet. */
export async function homeOf(chairmanId: string, title: string): Promise<HomeRow | null> {
  const h = await homes(chairmanId);
  let k = subjectKey(title);
  for (let i = 0; i < 5 && h.merges.has(k); i++) k = h.merges.get(k)!;
  return h.rows.find((r) => r.key === k) || null;
}

export type Namer = { kind: "PL" | "HOD" | "NONE"; departmentId: string | null; label: string };
/** Who names the SE of this course. */
export async function namerOf(chairmanId: string, course: { title: string; isFollower?: boolean }): Promise<Namer> {
  if (course.isFollower) return { kind: "NONE", departmentId: null, label: "Follows its base course" };
  const home = await homeOf(chairmanId, course.title);
  if (!home || home.level === "PROGRAM") return { kind: "PL", departmentId: null, label: "Program Lead" };
  const dept = home.departmentId ? await prisma.department.findUnique({ where: { id: home.departmentId }, select: { name: true } }).catch(() => null) : null;
  return { kind: "HOD", departmentId: home.departmentId, label: `HOD${dept ? ` of ${dept.name}` : ""}` };
}

/** May this person name the SE of this course? Returns an error message when not. */
export async function namingBlock(user: { id: string; role: string; departmentId?: string | null }, chairmanId: string, course: { title: string; code: string }) {
  const n = await namerOf(chairmanId, course);
  if (n.kind === "PL" && user.role === "PROGRAM_COORDINATOR") return null;
  if (n.kind === "HOD" && user.role === "HEAD_OF_DEPARTMENT" && n.departmentId && n.departmentId === user.departmentId) return null;
  // An HOD Delegate holding "Name SEs" for that department (and chain, when the delegation is limited to chains).
  if (n.kind === "HOD") {
    const home = await homeOf(chairmanId, course.title);
    const { canDo } = await import("./delegation");
    const via = await canDo(user, "hod.nameSE", { departmentId: n.departmentId, chain: home?.chain ?? null });
    if (via.ok && !via.own) return null;
  }
  if (n.kind === "HOD" && user.role === "PROGRAM_COORDINATOR") return `${course.code} is a department-common / service course: its Subject Expert is named by the ${n.label}. Use “Request SE”.`;
  return `Only the ${n.label} names the Subject Expert of ${course.code}.`;
}

/** Live SE load: base courses (or courses with no sync group) this term or later, per Subject Expert, institute-wide. */
export async function seLoads(chairmanId: string) {
  const rows = await prisma.course.findMany({
    where: { subjectExpertId: { not: null }, coordinator: { managedById: chairmanId }, OR: [{ contentSyncMember: { is: null } }, { contentSyncMember: { is: { isBase: true } } }] },
    select: { subjectExpertId: true, code: true, isOffered: true, templateStatus: true, batch: { select: { degreeProgram: true } } },
  });
  const out: Record<string, { total: number; byProgram: Record<string, number>; codes: string[] }> = {};
  for (const r of rows) {
    if (!r.isOffered && r.templateStatus === "approved") continue; // finished offerings no longer count
    const k = r.subjectExpertId!;
    const o = out[k] || { total: 0, byProgram: {}, codes: [] };
    if (o.codes.includes(r.code)) continue; // one course, several base copies (e.g. two programs) counts once
    o.total += 1; o.codes.push(r.code);
    const p = r.batch?.degreeProgram || "Other";
    o.byProgram[p] = (o.byProgram[p] || 0) + 1;
    out[k] = o;
  }
  return out;
}
/** The SE limit for this person's scope (OMC department default, Program Lead's program value final). */
export async function seLimitFor(user: { id: string; role: string; managedById: string | null; departmentId?: string | null }) {
  return numberSetting(await chainFor(user), SE_MAX_KEY, 3);
}
