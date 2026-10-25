import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";

// Academic standing rules — set by the Controller of Examinations (a duty the Institute Head gives to one person) or
// the Dean; the Institute Head can always change them. Who sets which rule across OBEHUB is listed in RULE_OWNERS.

const adb = prisma as unknown as Record<string, any>;
export const RULES_HINT = "Academic rules need prisma/migration_academic_rules.sql — run it in Supabase.";
export const EXAM_CONTROLLER = "EXAM_CONTROLLER";
export type AcademicRules = { warningCgpa: number; probationCgpa: number; holdCgpa: number; dismissCgpa: number; dismissAfterProbations: number; minAttendanceForExam: number };
export const DEFAULT_RULES: AcademicRules = { warningCgpa: 2.5, probationCgpa: 2.0, holdCgpa: 2.0, dismissCgpa: 1.5, dismissAfterProbations: 2, minAttendanceForExam: 75 };
export const RULE_LABELS: [keyof AcademicRules, string, string][] = [
  ["warningCgpa", "Academic warning below CGPA", "Student and advisor see a warning; registration changes need the advisor."],
  ["probationCgpa", "Probation below CGPA", "Student is on probation; reduced load (see Registration Rules)."],
  ["holdCgpa", "Hold automatic registration below CGPA", "Students below this are not registered in their batch's courses until the advisor decides (unless the advisor has locked a plan for them)."],
  ["dismissCgpa", "Dismissal review below CGPA", "Flagged for dismissal review when also on probation the number of times below."],
  ["dismissAfterProbations", "…after this many probation semesters", ""],
  ["minAttendanceForExam", "Minimum attendance to sit the final exam (%)", "Shown to students and teachers; used by the attendance shortage list."],
];

/** Who sets which rule — shown on the Academic Rules page so everyone knows whom to ask. */
export const RULE_OWNERS: [string, string, string][] = [
  ["CGPA limits: warning, probation, registration hold, dismissal", "Controller of Examinations (or Dean)", "/academic-rules"],
  ["Minimum attendance to sit the final exam", "Controller of Examinations (or Dean)", "/academic-rules"],
  ["Exam sessions, date sheets, invigilation, result approval", "Controller of Examinations / Institute Head", "/exams"],
  ["Registration load: credit hours per semester, new courses at low CGPA, FYP credits", "OMC", "/registration-rules"],
  ["Assessment limits per type (quiz, mid, final %)", "OMC (exceptions: OMC or HOD)", "/omc/assessment-rules"],
  ["Grade cut-offs of a course", "Course teacher (bell curve suggested)", "/instructor/courses"],
  ["Leave types, days and carry-forward", "Institute Head", "/leave-approvals"],
  ["Faculty development hours target", "Institute Head / HOD", "/fdp"],
  ["Summer load above 9 credit hours", "Program Lead (on advisor's request)", "/plan-requests"],
  ["Minimum class size to offer a course", "Institute Head", "/plan-insights"],
];

export async function academicRules(chairmanId: string | null | undefined): Promise<AcademicRules> {
  if (!chairmanId) return DEFAULT_RULES;
  try { const r = await adb.academicRule.findUnique({ where: { chairmanId } }); return r ? { ...DEFAULT_RULES, ...Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, r[k] ?? (DEFAULT_RULES as never)[k]])) } : DEFAULT_RULES; } catch { return DEFAULT_RULES; }
}
export async function saveRules(chairmanId: string, r: AcademicRules, by: string) {
  await adb.academicRule.upsert({ where: { chairmanId }, create: { id: randomUUID(), chairmanId, ...r, updatedById: by, updatedAt: new Date() }, update: { ...r, updatedById: by, updatedAt: new Date() } });
}

/** Standing with the institute's limits. */
export function standingWith(cgpa: number | null, r: AcademicRules): "GOOD_STANDING" | "WARNING" | "PROBATION" {
  if (cgpa === null) return "GOOD_STANDING";
  if (cgpa < r.probationCgpa) return "PROBATION";
  if (cgpa < r.warningCgpa) return "WARNING";
  return "GOOD_STANDING";
}

/** Who may set the rules: whoever holds the Controller of Examinations duty — or, while no Controller is named, the Dean
 *  acting as Controller. The Institute Head and other Deans only see them. */
export function canSetRules(u: { role: string; extraRoles?: string[] | null }) {
  return (u.extraRoles || []).includes(EXAM_CONTROLLER);
}
export async function canSetRulesNow(u: { id: string; role: string; extraRoles?: string[] | null }, chairmanId: string) {
  if (canSetRules(u)) return true;
  return u.role === "DEAN" && (await actingControllerDean(chairmanId)) === u.id;
}

/** While no Controller of Examinations is named, the Dean who acts as Controller: the Dean whose box the Controller's
 *  position sits under on the organisation chart (the Institute Head chooses by moving it), else the first Dean named. */
export async function actingControllerDean(chairmanId: string): Promise<string | null> {
  if (await examController(chairmanId)) return null;
  const ps = ((await adb.orgPosition.findMany({ where: { chairmanId, role: { in: ["EXAM_CONTROLLER", "DEAN"] } }, select: { id: true, role: true, parentId: true, holderId: true, offAt: true } }).catch(() => [])) as { id: string; role: string; parentId: string | null; holderId: string | null; offAt: Date | null }[]);
  const ctrl = ps.find((p) => p.role === "EXAM_CONTROLLER");
  const under = ctrl?.parentId ? ps.find((p) => p.id === ctrl.parentId && p.role === "DEAN" && p.holderId && !p.offAt) : null;
  if (under?.holderId) return under.holderId;
  const dean = await prisma.user.findFirst({ where: { isActive: true, managedById: chairmanId, OR: [{ role: "DEAN" }, { secondaryRole: "DEAN" }, { tertiaryRole: "DEAN" }] }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return dean?.id || null;
}

export async function examController(chairmanId: string) {
  const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } });
  return prisma.user.findFirst({ where: { extraRoles: { has: EXAM_CONTROLLER }, OR: [{ managedById: chairmanId }, { managedById: { in: leads.map((l) => l.id).concat("none") } }] }, select: { id: true, name: true } });
}
export async function setExamController(chairmanId: string, userId: string | null) {
  const cur = await examController(chairmanId);
  if (cur) { const u = await prisma.user.findUnique({ where: { id: cur.id }, select: { extraRoles: true } }); await prisma.user.update({ where: { id: cur.id }, data: { extraRoles: (u?.extraRoles || []).filter((x) => x !== EXAM_CONTROLLER) } }); }
  if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { extraRoles: true } });
    await prisma.user.update({ where: { id: userId }, data: { extraRoles: Array.from(new Set([...(u?.extraRoles || []), EXAM_CONTROLLER])) } });
    await notifyUsers([userId], { kind: "ROLE", title: "You are the Controller of Examinations", body: "You set the CGPA limits and the minimum attendance for exams.", href: "/academic-rules" });
  }
}
