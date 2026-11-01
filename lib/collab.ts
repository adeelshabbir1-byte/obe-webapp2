import { randomUUID } from "crypto";
import { prisma } from "./db";
import { subjectKey } from "./courseHomeCore";

// Dual / Double / Joint degree programmes and ODL (Adeel prompt §34), every rule with its clause from the uploaded HEC
// policies (sources/HEC-DDJD-policy-2026.md, sources/HEC-ODL-policy.md, sources/HEC-ODL-toolkit.md). A programme carries
// its partners, Credit Equivalency Matrix, the MoC checklist (Annexure-I vii a–r and the other conditions), approvals,
// the NOC, KPIs; an ODL programme / course its eligibility, mode and credit-hour checks and its compliance items.
const db = prisma as unknown as Record<string, any>;
export const KINDS: Record<string, string> = { DUAL: "Dual degree", DOUBLE: "Double degree", JOINT: "Joint degree", ODL_PROGRAM: "ODL programme", ODL_COURSE: "Single ODL course" };
export const isDdjd = (k: string) => ["DUAL", "DOUBLE", "JOINT"].includes(k);
export const TYPE_RULE: Record<string, string> = {
  DUAL: "Two degrees in distinct or related fields; both degrees' contents covered in full, except that common courses aren't repeated (DDJD, Types and Protocols).",
  DOUBLE: "Two degrees in the same discipline, one by each partner, from one joint curriculum; each accepts the courses the other teaches (DDJD, Types and Protocols).",
  JOINT: "One degree jointly awarded and signed by all partners, from one joint curriculum; courses taught by any partner are accepted by the others (DDJD, Types and Protocols).",
};
// Annexure-I vii (a–r): the matters the MoC must address.
export const MOC_ITEMS: [string, string][] = [["a", "Name and description of the degree programme(s)"], ["b", "Academic structure: courses / modules, progression, specialisations"], ["c", "Intended learning outcomes and their relevance"], ["d", "Language(s) of instruction and teaching methods"], ["e", "Admission requirements"], ["f", "Assessment procedures and grading scales at the partners"], ["g", "Place(s) of study for each part of the programme"], ["h", "Student and faculty mobility"], ["i", "Residency requirements"], ["j", "Financial arrangements: fees, funding schedule, scholarships"], ["k", "Exit pathways for students who can't complete"], ["l", "Quality assurance through the partners' QECs"], ["m", "Validity — at least one full programme cycle"], ["n", "Dispute resolution, amendment, suspension, termination"], ["o", "Teach-Out Plan"], ["p", "Intellectual property rights"], ["q", "Data protection for shared student records"], ["r", "Diploma Supplement in the prescribed format"]];
export const DDJD_CHECKS: [string, string][] = [
  ["recognised", "Every partner is recognised / chartered (DDJD 2.ii); a foreign partner is in WHED or recognised in its country (Definitions)"],
  ["statutory", "Each partner's statutory bodies approved the scheme, credit transfer and rules (DDJD 1.iii, Annexure-I iii)"],
  ["cem", "HEC Credit Equivalency Matrix completed: learning outcomes, contact hours, assessment (DDJD 1.v.c, Annexure-II)"],
  ["moc5", "MoC valid for at least 5 years (DDJD 2.iii), signed by the heads, focal person per partner (Annexure-I vi)"],
  ["teachout", "Teach-Out Plan: completion, or full refund plus credit transfer (DDJD 4.i)"],
  ["exit", "Individual exit pathways defined (DDJD 4.iii)"],
  ["notice", "Withdrawal needs 12 months' notice; no new enrolment after notice (DDJD 4.ii)"],
  ["fees", "Full fee structure for the whole duration disclosed; increase capped as agreed (DDJD 5.i–ii)"],
  ["refund", "Refund policy for discontinuation / withdrawal (DDJD 5.iii)"],
  ["finance", "Financial sustainability assessment (DDJD 5.iv)"],
  ["language", "Language competency assured and supported (DDJD 6)"],
  ["calendar", "Joint academic calendar alignment plan (Annexure-II)"],
  ["moderation", "Rubric harmonisation and joint moderation of assessments (Annexure-II)"],
  ["students", "Student representation in programme decisions (DDJD 7)"],
  ["grievance", "Grievance route explained at admission: the institution, then HEC (DDJD 9)"],
  ["website", "Programme information published before enrolment: arrangement, partners, degrees, credits, mobility, fees, language (DDJD 2.iv)"],
];
export const KPI: [string, string, number][] = [["enrolment", "Enrolment (% of intake)", 80], ["graduation", "Graduation rate (%)", 70], ["satisfaction", "Student satisfaction (%)", 80], ["employability", "Employability (%)", 75]];
export const ODL_CHECKS: [string, string][] = [
  ["twoBatches", "At least two batches of the same programme completed face-to-face (ODL 2.2)"],
  ["statutory", "Statutory bodies approved offering in ODL mode (ODL 2.3)"],
  ["faculty", "Full-time faculty designated for ODL (ODL 2.5)"],
  ["plan", "ODL programme / course plan approved (ODL 2.6)"],
  ["ict", "ICT readiness and planned enrolment shown (ODL 2.7)"],
  ["council", "Accreditation council's NOC, where relevant (ODL 2.12)"],
  ["noc", "HEC recognition / NOC granted (up to 3 years, with seats and intake) — admit only after it (ODL 2.10–2.11)"],
  ["risk", "Programme proposal with a risk assessment, approved (ODL 5)"],
  ["lms", "LMS with the required features: outline, announcements, forum, learning objects, assignments, quizzes, grades, attendance, feedback, tickets (ODL 10)"],
  ["sis", "Student Information System linked to the portal and the LMS (ODL 17.1)"],
  ["grievanceEportal", "Grievance e-portal with tracking (ODL 18)"],
  ["roles", "ODL Programme Coordinator, Instructional Designer, LMS administrator and QA specialist named (ODL 13)"],
  ["review", "Course content reviewed at least every 3 years (ODL 7)"],
  ["centres", "HEC-approved examination centres with CCTV, biometric attendance and faculty invigilation (ODL 11.vi, 11.xi)"],
  ["cctv", "CCTV recordings kept at least 3 years after the programme ends (ODL 11.xi.b)"],
  ["practical", "Practical work done and evaluated face-to-face before the semester exam (ODL 11.x)"],
  ["grading", "Same assessment and grading policy as face-to-face (ODL 11.ix)"],
];
export type Data = { partners?: { name: string; foreign?: boolean; recognised?: boolean; country?: string }[]; sameDiscipline?: boolean; checks?: Record<string, { done: boolean; note?: string }>; moc?: Record<string, string>; cem?: { ours: string; oursTitle: string; theirs: string; theirsTitle: string; ch: number; contactHours: number; assessment: string; ok: boolean }[]; nocNo?: string; nocDate?: string; nocUntil?: string; seats?: number; published?: string; withdrawalNotice?: string; mocFrom?: string; mocUntil?: string; kpis?: Record<string, number>; moderationPct?: number; currency?: string; fees?: string; feeCapPct?: number; timezone?: string; gradeScale?: string;
  courses?: { code: string; mode: "SYNC" | "ASYNC" | "BLENDED"; ch: number; f2fPct?: number; recordedMin?: number; moderatedH?: number; gradedH?: number; labH?: number; teacher?: string }[] };
const J = <T>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
export type Prog = { id: string; chairmanId: string; kind: string; title: string; dataJson: string; status: string; createdAt: Date; updatedAt: Date };
export const dataOf = (p: Prog) => J<Data>(p.dataJson, {});

export async function listFor(chairmanId: string) { return ((await db.collabProgramme?.findMany({ where: { chairmanId }, orderBy: { updatedAt: "desc" } }).catch(() => [])) || []) as Prog[]; }
export async function createProg(user: { id: string }, chairmanId: string, kind: string, title: string) {
  if (!db.collabProgramme) throw new Error("Run prisma/migration_adeel_p9.sql in Supabase first.");
  if (!KINDS[kind]) throw new Error("Choose the type.");
  const id = randomUUID();
  await db.collabProgramme.create({ data: { id, chairmanId, kind, title: title.slice(0, 200), createdById: user.id } });
  return id;
}
export async function saveData(p: Prog, patch: Data, status?: string) {
  const d = { ...dataOf(p), ...patch };
  await db.collabProgramme.update({ where: { id: p.id }, data: { dataJson: JSON.stringify(d), ...(status ? { status } : {}), updatedAt: new Date() } });
}

/** The Credit Equivalency Matrix drafted from two master curricula in OBEHUB (same HEC catalog course = equivalent). */
export async function draftCem(ourCurriculumId: string, theirCurriculumId: string) {
  const [a, b] = await Promise.all([prisma.masterCourse.findMany({ where: { masterCurriculumId: ourCurriculumId }, select: { code: true, title: true, creditHours: true } }), prisma.masterCourse.findMany({ where: { masterCurriculumId: theirCurriculumId }, select: { code: true, title: true, creditHours: true } })]);
  return a.map((x) => { const m = b.find((y) => subjectKey(y.title) === subjectKey(x.title)); return { ours: x.code, oursTitle: x.title, theirs: m?.code || "", theirsTitle: m?.title || "", ch: x.creditHours, contactHours: x.creditHours * 16, assessment: "", ok: !!m && m.creditHours === x.creditHours }; });
}

/** Compliance: every check with its status, ready / missing, and the lock on enrolment. */
export function compliance(p: Prog) {
  const d = dataOf(p);
  const items = (isDdjd(p.kind) ? DDJD_CHECKS : ODL_CHECKS).map(([k, label]) => ({ key: k, label, done: !!d.checks?.[k]?.done, note: d.checks?.[k]?.note || "" }));
  const moc = isDdjd(p.kind) ? MOC_ITEMS.map(([k, label]) => ({ key: k, label: `(${k}) ${label}`, done: !!(d.moc?.[k] || "").trim() })) : [];
  const problems: string[] = [];
  if (p.kind === "DOUBLE" && d.sameDiscipline === false) problems.push("A double degree must be in the same discipline.");
  if (isDdjd(p.kind) && d.mocFrom && d.mocUntil && (new Date(d.mocUntil).getTime() - new Date(d.mocFrom).getTime()) / (365.25 * 864e5) < 5) problems.push("The MoC must be valid for at least 5 years (DDJD 2.iii).");
  if (isDdjd(p.kind) && (d.cem || []).some((r) => !r.ok)) problems.push(`${(d.cem || []).filter((r) => !r.ok).length} CEM line(s) not equivalent yet.`);
  for (const c of d.courses || []) {
    if (c.mode === "BLENDED" && (c.f2fPct ?? 0) < 100 / 3) problems.push(`${c.code}: blended needs at least 1/3 face-to-face or synchronous (ODL 8.2.3) — now ${c.f2fPct ?? 0}%.`);
    if (c.mode === "ASYNC" && ((c.recordedMin ?? 0) < 425 * c.ch || (c.moderatedH ?? 0) < 5 * c.ch || (c.gradedH ?? 0) < 4 * c.ch)) problems.push(`${c.code}: asynchronous needs per CH 7 h recorded (425 min), 5 h moderated and 4 h graded contact (ODL 8.1).`);
    if ((c.labH ?? 0) > 0 && (c.labH ?? 0) < 45) problems.push(`${c.code}: lab work needs 45–48 hours per CH, face-to-face (ODL 8.1.d).`);
  }
  const teachers = new Map<string, number>(); for (const c of d.courses || []) if (c.teacher) teachers.set(c.teacher, (teachers.get(c.teacher) || 0) + 1);
  for (const [t, n] of Array.from(teachers.entries())) if (n > 2) problems.push(`${t} has ${n} ODL courses — at most two per semester (ODL 13.1.2).`);
  const kpis = isDdjd(p.kind) ? KPI.map(([k, label, bench]) => ({ key: k, label, bench, value: d.kpis?.[k] ?? null, ok: d.kpis?.[k] == null ? null : k === "enrolment" ? d.kpis[k] >= bench : d.kpis[k] > bench })) : [];
  const ready = items.every((i) => i.done) && moc.every((m) => m.done) && !problems.length;
  if (isDdjd(p.kind) && d.published && !(d.fees || "").trim()) problems.push("The full fee structure must be published before enrolment (DDJD 2.iv, 5.i).");
  const enrolmentOpen = isDdjd(p.kind) ? !!d.nocNo && !!d.published && !d.withdrawalNotice : !!d.nocNo;
  return { items, moc, problems, kpis, ready, enrolmentOpen, lockReason: enrolmentOpen ? null : d.withdrawalNotice ? "Withdrawal notice given — no new enrolment (DDJD 4.ii)." : !d.nocNo ? "No HEC NOC recorded yet." : "Programme information not published yet (DDJD 2.iv)." };
}
