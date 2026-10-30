import { randomUUID } from "crypto";
import { prisma } from "./db";
import { directClos } from "./directClo";
import { approverFor } from "./approvers";

// The OMC's limits on assessment types, e.g. "Quiz + Assignment at most 25% of the course" or "of each CLO's marks at
// most 25% from Quiz + Assignment", "Final at least 40%". A plan that breaks a rule can still be saved, but it is marked
// "needs approval" until the OMC or the HOD approves that course's exception. An approval holds for the value approved;
// if the plan changes again, it needs approval again.

const adb = prisma as unknown as Record<string, any>;
export const RULES_HINT = "Assessment rules need prisma/migration_assessment_rules.sql — run it in Supabase.";
export const TYPES = ["Quiz", "Assignment", "Midterm", "Final", "Project", "Lab", "Presentation"];

export type Rule = { id: string; chairmanId: string; label: string; types: string[]; level: "COURSE" | "CLO"; minPct: number | null; maxPct: number | null; courseKind: "ALL" | "THEORY" | "LAB"; program: string | null };
export type Breach = { ruleId: string; rule: string; scope: string; value: number; limit: string; status: "PENDING" | "APPROVED" | "REJECTED"; note?: string | null; decidedBy?: string | null };

export async function rulesOf(chairmanId: string): Promise<Rule[]> {
  try {
    const rows = await adb.assessmentRule.findMany({ where: { chairmanId }, orderBy: { createdAt: "asc" } });
    return rows.map((r: any) => ({ ...r, types: JSON.parse(r.typesJson || "[]") }));
  } catch { return []; }
}

export async function saveRule(chairmanId: string, r: Omit<Rule, "id" | "chairmanId"> & { id?: string }, by: string) {
  const data = { label: r.label, typesJson: JSON.stringify(r.types), level: r.level, minPct: r.minPct, maxPct: r.maxPct, courseKind: r.courseKind, program: r.program || null, updatedById: by, updatedAt: new Date() };
  if (r.id) await adb.assessmentRule.updateMany({ where: { id: r.id, chairmanId }, data });
  else await adb.assessmentRule.create({ data: { id: randomUUID(), chairmanId, ...data, createdAt: new Date() } });
}
export async function deleteRule(chairmanId: string, id: string) { await adb.assessmentRule.deleteMany({ where: { id, chairmanId } }); }

const r1 = (x: number) => Math.round(x * 10) / 10;
const norm = (t: string) => t.trim().toLowerCase();

/** Rule breaches of one course's assessment plan (SE = course expert's template, INSTRUCTOR = the teacher's). */
export async function courseBreaches(courseId: string, source: "SE" | "INSTRUCTOR"): Promise<Breach[]> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { courseType: true, coordinatorId: true, coordinator: { select: { managedById: true } }, batch: { select: { degreeProgram: true } } } });
  if (!course) return [];
  const rules = (await rulesOf(course.coordinator.managedById || "")).filter((r) =>
    (r.courseKind === "ALL" || (r.courseKind === "LAB") === (norm(course.courseType) === "lab")) && (!r.program || r.program === course.batch?.degreeProgram));
  if (!rules.length) return [];
  const items = (await prisma.assessmentInstrument.findMany({ where: { courseId, source }, select: { id: true, type: true, marksPct: true, partOfId: true } })).filter((i) => i.marksPct > 0);
  if (!items.length) return [];
  const total = items.reduce((a, i) => a + i.marksPct, 0);
  // Item -> CLO: a direct CLO (Project / Lab), else the CLO of the first lecture topic it is linked to.
  const toClo = new Map(Array.from((await directClos(courseId)).entries()));
  const links = await prisma.lectureRowInstrument.findMany({ where: { instrumentId: { in: items.map((i) => i.id) } }, select: { instrumentId: true, lectureRow: { select: { cloId: true } } } });
  for (const l of links) if (l.lectureRow.cloId && !toClo.has(l.instrumentId)) toClo.set(l.instrumentId, l.lectureRow.cloId);
  const clos = await prisma.cLO.findMany({ where: { courseId, source }, select: { id: true, code: true } });
  const approvals = await approvalsOf(courseId, source);
  const byMethod = await (async () => {
    const m = await import("./cloMethods"); const core = await import("./cloMethodCore");
    const [{ items: ci }, s] = await Promise.all([m.courseItems(courseId, source), m.courseSettings(courseId)]);
    return { shares: new Map(clos.map((c) => [c.id, core.cloTypeShares(s.method, ci, c.id)])) };
  })().catch(() => null);
  const out: Breach[] = [];
  const check = (r: Rule, scope: string, value: number) => {
    const lo = r.minPct !== null && value < r.minPct - 1e-6, hi = r.maxPct !== null && value > r.maxPct + 1e-6;
    if (!lo && !hi) return;
    const a = approvals.find((x) => x.ruleId === r.id && x.scope === scope);
    const status = a && Math.abs(a.value - r1(value)) < 0.05 ? (a.status as Breach["status"]) : "PENDING";
    out.push({ ruleId: r.id, rule: r.label, scope, value: r1(value), limit: [r.minPct !== null ? `at least ${r.minPct}%` : "", r.maxPct !== null ? `at most ${r.maxPct}%` : ""].filter(Boolean).join(", "), status, note: status !== "PENDING" ? a?.note : null, decidedBy: status !== "PENDING" ? a?.decidedByName : null });
  };
  for (const r of rules) {
    const inGroup = (t: string) => r.types.map(norm).includes(norm(t));
    if (r.level === "COURSE") check(r, "Course total", total ? (100 * items.filter((i) => inGroup(i.type)).reduce((a, i) => a + i.marksPct, 0)) / total : 0);
    else for (const c of clos) {
      // Each item type's share of the CLO under the course's CLO method (weights, grade shares or marks; splits,
      // Not for CLO, excluded and faulty items taken into account).
      const sh = byMethod?.shares.get(c.id);
      if (sh) { if (sh.total) check(r, c.code, Object.entries(sh.byType).filter(([t]) => inGroup(t)).reduce((a, [, x]) => a + x, 0)); continue; }
      const mine = items.filter((i) => toClo.get(i.id) === c.id);
      const w = mine.reduce((a, i) => a + i.marksPct, 0);
      if (!w) continue;
      check(r, c.code, (100 * mine.filter((i) => inGroup(i.type)).reduce((a, i) => a + i.marksPct, 0)) / w);
    }
  }
  return out;
}

async function approvalsOf(courseId: string, source: string): Promise<{ ruleId: string; scope: string; value: number; status: string; note: string | null; decidedByName: string | null }[]> {
  try { return await adb.assessmentRuleApproval.findMany({ where: { courseId, source } }); } catch { return []; }
}

/** OMC or HOD decides one breach (the value as it stands now). */
export async function decideBreach(courseId: string, source: string, ruleId: string, scope: string, value: number, approve: boolean, note: string | null, by: { id: string; name: string }) {
  await adb.assessmentRuleApproval.deleteMany({ where: { courseId, source, ruleId, scope } });
  await adb.assessmentRuleApproval.create({ data: { id: randomUUID(), courseId, source, ruleId, scope, value: r1(value), status: approve ? "APPROVED" : "REJECTED", note, decidedById: by.id, decidedByName: by.name, decidedAt: new Date() } });
}

/** May this person decide breaches of this course? The OMC of the institute, or the HOD of the course's department. */
export async function canDecide(user: { id: string; role: string; managedById: string | null; departmentId?: string | null }, courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { coordinator: { select: { managedById: true, departmentId: true } } } });
  if (!c || c.coordinator.managedById !== user.managedById) return false;
  if (user.role === "OMC") return true;
  if (user.role === "HEAD_OF_DEPARTMENT" && !!user.departmentId && user.departmentId === c.coordinator.departmentId) return true;
  // Acting for the HoD, or covering the position while it is vacant or switched off.
  return !!user.managedById && (await approverFor(user.managedById, "HEAD_OF_DEPARTMENT", { departmentId: c.coordinator.departmentId })).ids.includes(user.id);
}

/** Every offered course of these Program Leads with breaches (for the OMC / HOD list). */
export async function breachesFor(coordinatorIds: string[]) {
  const courses = await prisma.course.findMany({ where: { coordinatorId: { in: coordinatorIds.concat(["none"]) }, isOffered: true }, select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { code: "asc" } });
  const out: { courseId: string; label: string; source: "SE" | "INSTRUCTOR"; breaches: Breach[] }[] = [];
  for (const c of courses) for (const source of ["SE", "INSTRUCTOR"] as const) {
    const b = await courseBreaches(c.id, source);
    if (b.length) out.push({ courseId: c.id, label: `${c.code} ${c.title} · ${c.batch?.degreeProgram || ""} ${c.batch?.batchName || ""}`, source, breaches: b });
  }
  return out;
}
