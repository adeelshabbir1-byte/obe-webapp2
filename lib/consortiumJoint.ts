import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { cdb, rulesOn, memberOf, residencyOf, hasValidNoc, type Rules } from "./consortium";
import { loadAgreement, institutionOf, type Agreement, type Equivalence, type Approvals } from "./consortiumAgreements";
import { countsTowardDegree } from "./courseTypes";

// Consortium phase 8: joint degree programmes.
//  - Launch: the agreement must be active with an MoU of the required length, each university's share set, the
//    Credit Equivalency Matrix complete (every degree course paired and approved by both), and HEC's programme NOC.
//  - The lead university admits the students (its batches are linked to the programme).
//  - Plan: for each course of the programme the student chooses where to take it — at the lead, or at a partner
//    where an approved equivalence exists. Every rule is checked by validatePlan (pure, tested): total credits,
//    semester load, the lead's residency share and capstone, majors at home, each partner's agreed share.
//  - Graduation: a degree audit from the transcript (transferred results included), approval by each university,
//    then the jointly awarded record.

const j = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };
export const sharesOf = (a: { sharesJson?: string | null }) => j<Record<string, number>>(a.sharesJson || "{}", {});

// ------------------------------------------------------------------ The rules engine (pure)
export type PlanCourse = { id: string; code: string; title: string; ch: number; semester: number | null; capstone: boolean; major: boolean; internship: boolean; options: { chairmanId: string; label: string; offered: string | null }[] };
export type PlanCheck = { rule: string; ok: boolean; why: string };
export function validatePlan(p: { courses: PlanCourse[]; choice: Record<string, string>; home: string; partners: string[]; names: Record<string, string>; rules: Rules; residency: { minHomeResidencyPct: number | null; capstoneAtHome: boolean; majorsAtHome: boolean }; shares: Record<string, number> }) {
  const at = (c: PlanCourse) => p.choice[c.id] || p.home;
  const total = p.courses.reduce((t, c) => t + c.ch, 0);
  const byUni: Record<string, number> = {}; for (const c of p.courses) byUni[at(c)] = (byUni[at(c)] || 0) + c.ch;
  const sems = new Map<number, number>(); for (const c of p.courses) if (c.semester) sems.set(c.semester, (sems.get(c.semester) || 0) + c.ch);
  const checks: PlanCheck[] = [];
  const minCh = Number(p.rules.minCreditsMajor);
  checks.push({ rule: "Total credit hours", ok: total >= minCh, why: `${total} CH; at least ${minCh} needed` });
  const over = Array.from(sems.entries()).filter(([, ch]) => ch > Number(p.rules.maxSemesterLoad));
  checks.push({ rule: "Semester load", ok: !over.length, why: over.length ? `semester ${over.map(([s, ch]) => `${s} (${ch} CH)`).join(", ")} over ${p.rules.maxSemesterLoad} CH` : `every semester ≤ ${p.rules.maxSemesterLoad} CH` });
  const homePct = total ? Math.round((100 * (byUni[p.home] || 0)) / total) : 0;
  const needHome = Math.max(Number(p.rules.minHomeResidencyPct), p.residency.minHomeResidencyPct || 0);
  checks.push({ rule: `Taken at ${p.names[p.home] || "the lead university"}`, ok: homePct >= needHome, why: `${homePct}% of credit hours; at least ${needHome}%` });
  if (p.rules.capstoneAtHome || p.residency.capstoneAtHome) { const off = p.courses.filter((c) => c.capstone && at(c) !== p.home); checks.push({ rule: "Capstone at the lead university", ok: !off.length, why: off.length ? `${off.map((c) => c.code).join(", ")} chosen elsewhere` : "yes" }); }
  if (p.residency.majorsAtHome) { const off = p.courses.filter((c) => c.major && at(c) !== p.home); checks.push({ rule: "Major core at the lead university", ok: !off.length, why: off.length ? `${off.map((c) => c.code).join(", ")} chosen elsewhere` : "yes" }); }
  if (p.rules.internshipRequired) checks.push({ rule: "Internship / field experience", ok: p.courses.some((c) => c.internship), why: p.courses.some((c) => c.internship) ? "in the programme" : "no internship course in the programme" });
  for (const u of p.partners) {
    const pct = total ? Math.round((100 * (byUni[u] || 0)) / total) : 0;
    const need = Math.max(p.shares[u] || 0, Number(p.rules.minPartnerSharePct));
    checks.push({ rule: `Taken at ${p.names[u] || "partner"}`, ok: pct >= need, why: `${pct}% of credit hours; the agreement asks for at least ${need}%` });
  }
  const bad = p.courses.filter((c) => at(c) !== p.home && !c.options.some((o) => o.chairmanId === at(c)));
  checks.push({ rule: "Every course elsewhere is an approved equivalent", ok: !bad.length, why: bad.length ? bad.map((c) => c.code).join(", ") : "yes" });
  return { checks, ok: checks.every((c) => c.ok), total, byUni, perSemester: Array.from(sems.entries()).sort((a, b) => a[0] - b[0]) };
}

// ------------------------------------------------------------------ Launch
export async function launchChecks(agreementId: string) {
  const a = await loadAgreement(agreementId);
  if (!a || a.kind !== "JOINT_DEGREE") return null;
  const { rules } = await rulesOn();
  const lead = a.parties.find((p) => p.role === "LEAD")!;
  const shares = sharesOf(a as Agreement & { sharesJson?: string });
  const sum = Object.values(shares).reduce((t, x) => t + x, 0);
  const out: { label: string; ok: boolean; detail: string }[] = [];
  out.push({ label: "Both universities accepted the agreement", ok: a.status === "ACTIVE", detail: a.status.toLowerCase() });
  const yrs = a.mouStart && a.mouEnd ? (a.mouEnd.getTime() - a.mouStart.getTime()) / (365.25 * 86400000) : 0;
  out.push({ label: `Agreement of at least ${rules.mouMinYears} years, in force`, ok: yrs + 0.01 >= Number(rules.mouMinYears) && !!a.mouEnd && a.mouEnd > new Date(), detail: a.mouStart && a.mouEnd ? `${a.mouStart.toISOString().slice(0, 10)} to ${a.mouEnd.toISOString().slice(0, 10)}` : "dates missing" });
  out.push({ label: "Each university's share of credit hours set (total 100%)", ok: Math.round(sum) === 100 && a.parties.every((p) => (shares[p.chairmanId] || 0) >= (p.role === "LEAD" ? Number(rules.minHomeResidencyPct) : Number(rules.minPartnerSharePct))), detail: sum ? a.parties.map((p) => `${shares[p.chairmanId] || 0}%`).join(" + ") + ` = ${sum}%` : "not set" });
  if (rules.matrixRequired) {
    const courses = lead.curriculumId ? await prisma.masterCourse.findMany({ where: { masterCurriculumId: lead.curriculumId }, select: { id: true, category: true } }) : [];
    const deg = courses.filter((c) => countsTowardDegree(c.category));
    const eqs = (await cdb.consortiumEquivalence.findMany({ where: { agreementId, status: "APPROVED" }, select: { courseA: true } })) as { courseA: string }[];
    const done = new Set(eqs.map((e) => e.courseA));
    const n = deg.filter((c) => done.has(c.id)).length;
    out.push({ label: "Credit Equivalency Matrix complete (every degree course approved by both)", ok: deg.length > 0 && n === deg.length, detail: `${n} of ${deg.length} courses` });
  }
  if (rules.jointNocRequired) out.push({ label: "HEC NOC for this joint programme", ok: await hasValidNoc(lead.chairmanId, "JOINT_PROGRAMME", a.programme || undefined), detail: `on ${a.programme || a.title} — add it on the lead's Consortium page` });
  for (const p of a.parties) out.push({ label: `Statutory approval — ${p.role === "LEAD" ? "lead" : "partner"} (recommended)`, ok: await hasValidNoc(p.chairmanId, "STATUTORY"), detail: "academic council / syndicate approval recorded as a NOC" });
  return { agreement: a, checks: out, ready: out.filter((c) => !c.label.includes("recommended")).every((c) => c.ok) };
}
export async function saveShares(user: { id: string; role: string }, agreementId: string, v: Record<string, unknown>) {
  const a = await loadAgreement(agreementId);
  const me = await institutionOf(user);
  if (!a || user.role !== "CHAIRMAN" || a.parties.find((p) => p.role === "LEAD")?.chairmanId !== me) throw new Error("The lead university's Chairman sets the shares.");
  if (a.kind !== "JOINT_DEGREE") throw new Error("Shares are for joint degrees.");
  const shares: Record<string, number> = {};
  for (const p of a.parties) { const n = Number(v[`share_${p.chairmanId}`]); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Give each share as a percentage."); shares[p.chairmanId] = Math.round(n); }
  await cdb.consortiumAgreement.update({ where: { id: agreementId }, data: { sharesJson: JSON.stringify(shares) } });
  return "Shares saved.";
}
export async function launch(user: { id: string; role: string }, agreementId: string) {
  const r = await launchChecks(agreementId);
  const me = await institutionOf(user);
  if (!r || user.role !== "CHAIRMAN" || r.agreement.parties.find((p) => p.role === "LEAD")?.chairmanId !== me) throw new Error("The lead university's Chairman launches the programme.");
  if (!r.ready) throw new Error(`Not ready: ${r.checks.filter((c) => !c.ok && !c.label.includes("recommended")).map((c) => c.label).join("; ")}.`);
  await cdb.consortiumAgreement.update({ where: { id: agreementId }, data: { launchedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: "JOINT_PROGRAMME_LAUNCHED", entityType: "ConsortiumAgreement", entityId: agreementId, metadata: {} });
  return "Launched — the programme shows on the public catalog; link the batches you admit to it.";
}
export async function linkBatch(user: { id: string; role: string }, agreementId: string, batchId: string, on: boolean) {
  const a = await loadAgreement(agreementId);
  const me = await institutionOf(user);
  if (!a || !["CHAIRMAN", "PROGRAM_COORDINATOR", "PROGRAM_LEAD", "HEAD_OF_DEPARTMENT"].includes(user.role) || a.parties.find((p) => p.role === "LEAD")?.chairmanId !== me) throw new Error("The lead university links its batches.");
  if (!(a as Agreement & { launchedAt?: Date | null }).launchedAt) throw new Error("Launch the programme first.");
  if (on) await cdb.consortiumJointBatch.upsert({ where: { batchId }, create: { batchId, agreementId, createdById: user.id }, update: { agreementId } });
  else await cdb.consortiumJointBatch.deleteMany({ where: { batchId, agreementId } });
  return on ? "Batch linked — its students see their joint plan." : "Unlinked.";
}

// ------------------------------------------------------------------ A student's plan
export async function planFor(studentId: string) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, batchId: true, name: true } });
  if (!st) return null;
  const jb = (await cdb.consortiumJointBatch.findUnique({ where: { batchId: st.batchId } }).catch(() => null)) as { agreementId: string } | null;
  if (!jb) return null;
  const a = (await loadAgreement(jb.agreementId))!;
  const lead = a.parties.find((p) => p.role === "LEAD")!, partners = a.parties.filter((p) => p.role !== "LEAD").map((p) => p.chairmanId);
  const heads = await prisma.user.findMany({ where: { id: { in: a.parties.map((p) => p.chairmanId) } }, select: { id: true, instituteName: true, name: true } });
  const names = Object.fromEntries(heads.map((h) => [h.id, h.instituteName || h.name]));
  const courses = await prisma.course.findMany({ where: { batchId: st.batchId, isNonCredit: false }, select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true, courseType: true, masterCourseId: true }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] });
  const eqs = (await cdb.consortiumEquivalence.findMany({ where: { agreementId: a.id, status: "APPROVED", courseA: { in: courses.map((c) => c.masterCourseId).filter((x): x is string => !!x) } } })) as Equivalence[];
  const pm = await prisma.masterCourse.findMany({ where: { id: { in: eqs.map((e) => e.courseB) } }, select: { id: true, code: true, title: true } });
  // Is the partner's equivalent open on the catalog this year?
  const pCourses = await prisma.course.findMany({ where: { masterCourseId: { in: pm.map((x) => x.id) } }, select: { id: true, masterCourseId: true } });
  const offs = (await cdb.consortiumOffering.findMany({ where: { courseId: { in: pCourses.map((x) => x.id) }, status: "OPEN" } })) as { courseId: string; term: string; id: string }[];
  const plan: PlanCourse[] = courses.map((c) => ({ id: c.id, code: c.code, title: c.title, ch: c.creditHours, semester: c.semesterNumber, capstone: /capstone|final year project|fyp/i.test(`${c.courseType} ${c.title}`), major: /core|major/i.test(c.courseType), internship: /internship|field experience/i.test(`${c.courseType} ${c.title}`),
    options: eqs.filter((e) => e.courseA === c.masterCourseId).map((e) => { const m = pm.find((x) => x.id === e.courseB); const o = offs.find((x) => pCourses.find((y) => y.id === x.courseId)?.masterCourseId === e.courseB); return { chairmanId: e.chairmanB, label: `${names[e.chairmanB]}: ${m?.code || ""} ${m?.title || ""}`.trim(), offered: o ? o.term : null }; }) }));
  const choice = Object.fromEntries(((await cdb.consortiumPlanChoice.findMany({ where: { studentId } })) as { courseId: string; chairmanId: string }[]).map((x) => [x.courseId, x.chairmanId]));
  const { rules } = await rulesOn();
  const residency = residencyOf(await memberOf(lead.chairmanId));
  return { agreement: a, lead: lead.chairmanId, partners, names, courses: plan, choice, rules, residency, shares: sharesOf(a as Agreement & { sharesJson?: string }) };
}
export async function choose(studentId: string, courseId: string, chairmanId: string) {
  const p = await planFor(studentId);
  if (!p) throw new Error("You are not in a joint programme.");
  const c = p.courses.find((x) => x.id === courseId);
  if (!c) throw new Error("Not a course of your programme.");
  if (chairmanId !== p.lead && !c.options.some((o) => o.chairmanId === chairmanId)) throw new Error("That university has no approved equivalent of this course.");
  if (chairmanId === p.lead) await cdb.consortiumPlanChoice.deleteMany({ where: { studentId, courseId } });
  else await cdb.consortiumPlanChoice.upsert({ where: { studentId_courseId: { studentId, courseId } }, create: { studentId, courseId, chairmanId }, update: { chairmanId, updatedAt: new Date() } });
  const v = validatePlan({ ...p, home: p.lead, choice: { ...p.choice, [courseId]: chairmanId } });
  return v.ok ? "Saved — your plan meets every rule." : `Saved. Still to fix: ${v.checks.filter((x) => !x.ok).map((x) => x.rule).join("; ")}.`;
}

// ------------------------------------------------------------------ Degree audit and joint graduation
const PASS = (g: string) => !/^(F|W|I|IT|X|AB|FA)$/i.test(g.trim());
export async function audit(studentId: string) {
  const p = await planFor(studentId);
  if (!p) return null;
  const recs = await prisma.studentTranscriptRecord.findMany({ where: { studentId }, orderBy: [{ termYear: "asc" }, { snapshotAt: "asc" }] });
  // Latest attempt per course code.
  const last = new Map<string, (typeof recs)[number]>(); for (const r of recs) last.set(r.courseCode, r);
  const rows = Array.from(last.values()).filter((r) => r.creditHours > 0);
  const passed = rows.filter((r) => PASS(r.grade));
  const earned = passed.reduce((t, r) => t + r.creditHours, 0);
  const graded = rows.filter((r) => r.gpaPoints != null);
  const cgpa = graded.length ? Math.round((graded.reduce((t, r) => t + (r.gpaPoints || 0) * r.creditHours, 0) / Math.max(1, graded.reduce((t, r) => t + r.creditHours, 0))) * 100) / 100 : 0;
  const elsewhere = passed.filter((r) => /— taken at /.test(r.courseTitle));
  const atLead = earned - elsewhere.reduce((t, r) => t + r.creditHours, 0);
  const required = p.courses.reduce((t, c) => t + c.ch, 0);
  const missing = p.courses.filter((c) => !passed.some((r) => r.courseCode === c.code)).map((c) => c.code);
  const needHome = Math.max(Number(p.rules.minHomeResidencyPct), p.residency.minHomeResidencyPct || 0);
  const checks: PlanCheck[] = [
    { rule: "Credit hours earned", ok: earned >= Math.max(required, Number(p.rules.minCreditsMajor)), why: `${earned} of ${Math.max(required, Number(p.rules.minCreditsMajor))}` },
    { rule: "Every course of the programme passed", ok: !missing.length, why: missing.length ? `missing ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}` : "yes" },
    { rule: "CGPA", ok: cgpa >= Number(p.rules.minCgpaGraduate), why: `${cgpa.toFixed(2)}; at least ${Number(p.rules.minCgpaGraduate).toFixed(2)}` },
    { rule: `Earned at ${p.names[p.lead]}`, ok: earned > 0 && (100 * atLead) / earned >= needHome, why: `${earned ? Math.round((100 * atLead) / earned) : 0}%; at least ${needHome}%` },
  ];
  return { plan: p, earned, cgpa, atLead, elsewhere: elsewhere.length, checks, ok: checks.every((c) => c.ok) };
}
export type Graduation = { id: string; studentId: string; agreementId: string; auditJson: string; approvalsJson: string; status: string; serial: string | null; issuedAt: Date | null; createdAt: Date };
export async function startGraduation(user: { id: string; role: string }, studentId: string) {
  const a = await audit(studentId);
  if (!a) throw new Error("Not a joint-programme student.");
  if ((await institutionOf(user)) !== a.plan.lead) throw new Error("The lead university starts the degree audit.");
  const prev = (await cdb.consortiumGraduation.findFirst({ where: { studentId, agreementId: a.plan.agreement.id } })) as Graduation | null;
  if (prev?.status === "ISSUED") throw new Error("The degree record has been issued.");
  const data = { auditJson: JSON.stringify({ earned: a.earned, cgpa: a.cgpa, atLead: a.atLead, elsewhere: a.elsewhere, checks: a.checks, at: new Date().toISOString() }), approvalsJson: "{}", status: "AUDITED" };
  if (prev) await cdb.consortiumGraduation.update({ where: { id: prev.id }, data });
  else await cdb.consortiumGraduation.create({ data: { id: randomUUID(), studentId, agreementId: a.plan.agreement.id, ...data } });
  return a.ok ? "Degree audit passed — each university now approves." : `Audit recorded; not yet met: ${a.checks.filter((c) => !c.ok).map((c) => c.rule).join("; ")}.`;
}
export async function approveGraduation(user: { id: string; role: string; name: string }, gradId: string) {
  const g = (await cdb.consortiumGraduation.findUnique({ where: { id: gradId } })) as Graduation | null;
  if (!g) throw new Error("Not found.");
  const ag = (await loadAgreement(g.agreementId))!;
  const me = await institutionOf(user);
  if (user.role !== "CHAIRMAN" || !ag.parties.some((p) => p.chairmanId === me)) throw new Error("Each university's Chairman approves.");
  const au = j<{ checks: PlanCheck[] }>(g.auditJson, { checks: [] });
  if (!au.checks.length || !au.checks.every((c) => c.ok)) throw new Error("The degree audit has not passed.");
  const ap = j<Approvals>(g.approvalsJson, {});
  ap[me!] = { chair: { by: user.id, name: user.name, at: new Date().toISOString(), ok: true } };
  const all = ag.parties.every((p) => ap[p.chairmanId]?.chair?.ok);
  await cdb.consortiumGraduation.update({ where: { id: gradId }, data: { approvalsJson: JSON.stringify(ap), status: all ? "APPROVED" : "AUDITED" } });
  await writeAuditLog({ actorUserId: user.id, action: "JOINT_GRADUATION_APPROVED", entityType: "ConsortiumGraduation", entityId: gradId, metadata: {} });
  return all ? "Approved by every university — the lead can issue the record." : "Your approval is recorded.";
}
export async function issue(user: { id: string; role: string }, gradId: string) {
  const g = (await cdb.consortiumGraduation.findUnique({ where: { id: gradId } })) as Graduation | null;
  if (!g || g.status !== "APPROVED") throw new Error("Every university must approve first.");
  const ag = (await loadAgreement(g.agreementId))!;
  if (user.role !== "CHAIRMAN" || (await institutionOf(user)) !== ag.parties.find((p) => p.role === "LEAD")?.chairmanId) throw new Error("The lead university issues the record.");
  const n = ((await cdb.consortiumGraduation.count({ where: { status: "ISSUED" } })) as number) + 1;
  const serial = `JD-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
  await cdb.consortiumGraduation.update({ where: { id: gradId }, data: { status: "ISSUED", serial, issuedAt: new Date() } });
  await prisma.student.update({ where: { id: g.studentId }, data: { status: "GRADUATED", statusDate: new Date(), statusReason: `Joint degree ${serial}` } });
  await writeAuditLog({ actorUserId: user.id, action: "JOINT_DEGREE_ISSUED", entityType: "ConsortiumGraduation", entityId: gradId, metadata: { serial } });
  return `Issued: ${serial}.`;
}
