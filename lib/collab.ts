import { randomUUID } from "crypto";
import { prisma } from "./db";
import { subjectKey } from "./courseHomeCore";
import { ODL_STEPS, odlMissing, autoMet } from "./odlWizard";

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
export type Data = { ownerId?: string; ownerName?: string; focal?: string; partners?: { name: string; foreign?: boolean; recognised?: boolean; country?: string }[]; sameDiscipline?: boolean; checks?: Record<string, { done: boolean; note?: string }>; moc?: Record<string, string>; cem?: { ours: string; oursTitle: string; theirs: string; theirsTitle: string; ch: number; contactHours: number; assessment: string; ok: boolean }[]; nocNo?: string; nocDate?: string; nocUntil?: string; seats?: number; published?: string; withdrawalNotice?: string; mocFrom?: string; mocUntil?: string; kpis?: Record<string, number>; moderationPct?: number; currency?: string; fees?: string; feeCapPct?: number; timezone?: string; gradeScale?: string;
  courses?: { code: string; mode: "SYNC" | "ASYNC" | "BLENDED"; ch: number; f2fPct?: number; recordedMin?: number; moderatedH?: number; gradedH?: number; labH?: number; labCh?: number; teacher?: string }[];
  // ODL wizard (lib/odlWizard.ts)
  degreeProgram?: string; odlFaculty?: { id: string; name: string }[]; readiness?: Record<string, { yes: boolean; evidence?: string }>; roles?: Record<string, { id: string; name: string }>;
  manualStudents?: string; manualFaculty?: string; activitiesPerCh?: boolean; auto?: Record<string, unknown> };
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
  const cur = dataOf(p);
  // checks and MoC items merge key by key, so two steps saved one after the other never undo each other.
  const d = { ...cur, ...patch, ...(patch.checks ? { checks: { ...(cur.checks || {}), ...patch.checks } } : {}), ...(patch.moc ? { moc: { ...(cur.moc || {}), ...patch.moc } } : {}), ...(patch.readiness ? { readiness: { ...(cur.readiness || {}), ...patch.readiness } } : {}), ...(patch.roles ? { roles: { ...(cur.roles || {}), ...patch.roles } } : {}) };
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
  const items = (isDdjd(p.kind) ? DDJD_CHECKS : ODL_CHECKS).map(([k, label]) => ({ key: k, label, done: !!d.checks?.[k]?.done || autoMet(d as Record<string, any>, k), note: d.checks?.[k]?.note || "" }));
  const autoDelivery = (d.auto?.delivery || {}) as Record<string, { failing: string[] }>;
  const moc = isDdjd(p.kind) ? MOC_ITEMS.map(([k, label]) => ({ key: k, label: `(${k}) ${label}`, done: !!(d.moc?.[k] || "").trim() })) : [];
  const problems: string[] = [];
  if (p.kind === "DOUBLE" && d.sameDiscipline === false) problems.push("A double degree must be in the same discipline.");
  if (isDdjd(p.kind) && d.mocFrom && d.mocUntil && (new Date(d.mocUntil).getTime() - new Date(d.mocFrom).getTime()) / (365.25 * 864e5) < 5) problems.push("The MoC must be valid for at least 5 years (DDJD 2.iii).");
  if (isDdjd(p.kind) && (d.cem || []).some((r) => !r.ok)) problems.push(`${(d.cem || []).filter((r) => !r.ok).length} CEM line(s) not equivalent yet.`);
  for (const c of d.courses || []) {
    if (autoDelivery[c.code]) { for (const f of autoDelivery[c.code].failing) problems.push(`${c.code}: ${f}`); continue; }
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

// ---- Step-by-step wizard (one job per step, plain words plus the HEC clause; "What's missing" per step).
export type Step = { key: string; title: string; intro: string; checks: string[]; moc: string[]; fields: [string, string, "text" | "date" | "number" | "long"][]; widgets: ("partners" | "cem" | "courses" | "kpis" | "docs" | "moc-all" | "same" | "odl-auto" | "readiness" | "roles" | "content" | "delivery" | "lms" | "running")[] };
export const DDJD_STEPS: Step[] = [
  { key: "type", title: "Type and partners", intro: "Choose the partners. Each must be recognised or chartered (DDJD 2.ii); a foreign partner must be in WHED or recognised at home.", checks: ["recognised"], moc: [], fields: [], widgets: ["partners", "same"] },
  { key: "cem", title: "Course mapping", intro: "Map both curricula into the HEC Credit Equivalency Matrix (DDJD 1.v.c, Annexure-II): learning outcomes, contact hours (1 CH ≥ 16 lecture or 48 lab hours) and assessment.", checks: ["cem"], moc: [], fields: [], widgets: ["cem"] },
  { key: "structure", title: "Structure", intro: "Who teaches what and where, mobility, residency and language (Annexure-I vii b–d, g–i), and the joint calendar (Annexure-II).", checks: ["calendar", "language"], moc: ["a", "b", "c", "d", "g", "h", "i"], fields: [], widgets: [] },
  { key: "assessment", title: "Assessment", intro: "One grading picture for all partners: rubric harmonisation, joint moderation of a share of exams, and the grade conversion (Annexure-II).", checks: ["moderation"], moc: ["e", "f"], fields: [["moderationPct", "Share of exams co-evaluated (%) — the policy's example is 20", "number"], ["gradeScale", "Partner's grade scale and conversion", "long"]], widgets: [] },
  { key: "protect", title: "Student protections", intro: "Teach-out, exit pathways, the 12-month withdrawal notice and the full fee structure with an agreed cap (DDJD 4–5).", checks: ["teachout", "exit", "notice", "fees", "refund", "finance"], moc: ["j", "k", "o"], fields: [["fees", "Full fee structure for the whole duration", "long"], ["feeCapPct", "Cap on yearly fee increase (%)", "number"]], widgets: [] },
  { key: "governance", title: "Governance", intro: "Student representation, the grievance route (institution, then HEC), data protection, IP and a focal person per partner (DDJD 7, 9; Annexure-I vi).", checks: ["students", "grievance"], moc: ["l", "n", "p", "q", "r"], fields: [["focal", "Focal person of each partner (name — institution)", "long"]], widgets: [] },
  { key: "moc", title: "Memorandum of Commitment", intro: "The MoC covers every item of Annexure-I vii (a–r), is valid for at least 5 years (DDJD 2.iii) and is approved by each partner's statutory bodies.", checks: ["moc5", "statutory"], moc: ["m"], fields: [["mocFrom", "MoC valid from", "date"], ["mocUntil", "MoC valid until", "date"]], widgets: ["moc-all"] },
  { key: "noc", title: "HEC NOC and publishing", intro: "Download the NOC file, record the NOC, then publish the programme page (DDJD 2.iv). Enrolment opens only after both.", checks: ["website"], moc: [], fields: [["nocNo", "HEC NOC number", "text"], ["nocDate", "NOC date", "date"], ["nocUntil", "NOC valid until", "date"], ["seats", "Seats", "number"], ["published", "Programme page published (date)", "date"], ["withdrawalNotice", "Withdrawal notice given (date — blank if none)", "date"]], widgets: ["docs", "kpis"] },
];
export { ODL_STEPS };
export const stepsOf = (kind: string) => (isDdjd(kind) ? DDJD_STEPS : ODL_STEPS);
/** What is still missing in one step (empty = the step is done). */
export function missingIn(p: Prog, st: Step) {
  const d = dataOf(p) as Record<string, any>;
  const lab = new Map((isDdjd(p.kind) ? DDJD_CHECKS : ODL_CHECKS));
  const out: string[] = [];
  for (const c of st.checks) if (!d.checks?.[c]?.done && !autoMet(d, c)) out.push(lab.get(c) || c);
  for (const m of st.moc) if (!String(d.moc?.[m] || "").trim()) out.push(`MoC (${m}) ${MOC_ITEMS.find((x) => x[0] === m)?.[1] || ""}`);
  for (const [k, label, t] of st.fields) if (k !== "withdrawalNotice" && k !== "gradeScale" && (d[k] == null || String(d[k]).trim() === "") && t !== "long") out.push(label);
  if (st.widgets.includes("partners") && !(d.partners || []).length) out.push("At least one partner");
  if (st.widgets.includes("cem") && (!(d.cem || []).length || (d.cem || []).some((r: { ok: boolean }) => !r.ok))) out.push((d.cem || []).length ? "Every matrix line checked as equivalent" : "Draft the Credit Equivalency Matrix");
  if (st.widgets.includes("courses")) { if (!(d.courses || []).length) out.push("Add the ODL courses"); out.push(...compliance(p).problems.filter((x) => /ODL|blended|asynchronous|lab work/i.test(x))); }
  if (st.key === "moc") out.push(...compliance(p).problems.filter((x) => /5 years/.test(x)));
  if (!isDdjd(p.kind)) out.push(...odlMissing(st, d));
  return Array.from(new Set(out));
}
/** Dean / Institute Head assign the programme to one person, who then works on it (and only it) like a lead. */
export const ASSIGNERS = ["CHAIRMAN", "DEAN"];
export async function assignOwner(by: { id: string; name: string }, p: Prog, userId: string, name: string) {
  const sf = await import("./scopedSettings");
  const old = dataOf(p).ownerId;
  if (old && old !== userId) await sf.setFlag(old, `duty:collab:${p.id}`, null);
  if (userId) await sf.setFlag(userId, `duty:collab:${p.id}`, p.title.slice(0, 120));
  await saveData(p, { ownerId: userId || undefined, ownerName: userId ? name : undefined });
  if (userId) await (await import("./notifications")).notifyUsers([userId], { kind: "ASSIGNMENT", title: `${by.name} assigned you: ${p.title}`, body: "You lead this programme's HEC work, step by step.", href: `/collab?id=${p.id}` }).catch(() => null);
}
export async function canWork(user: { id: string; role: string }, p: Prog) {
  if (["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"].includes(user.role)) return true;
  return dataOf(p).ownerId === user.id;
}

// ---- ODL delivery mode per lecture (ODL 8.2.3): each lecture of the plan is tagged face-to-face, live online or
// recorded; a blended course needs at least 1/3 face-to-face or live. Kept beside the plan (ScopedSetting odl.modes.<courseId>).
export const MODES: Record<string, string> = { F2F: "Face-to-face", LIVE: "Live online", REC: "Recorded" };
export async function lectureModes(chairmanId: string, codes: string[]) {
  if (!codes.length) return [];
  const courses = await prisma.course.findMany({ where: { code: { in: codes }, coordinator: { managedById: chairmanId } }, select: { id: true, code: true, isOffered: true }, orderBy: { isOffered: "desc" } });
  const { allStored } = await import("./scopedSettings");
  const stored = await allStored(chairmanId).catch(() => []);
  const out: { code: string; courseId: string; lectures: { n: number; topic: string; mode: string }[]; pct: number | null }[] = [];
  for (const code of codes) {
    const c = courses.find((x) => x.code === code); if (!c) continue;
    const rows = await prisma.lectureRow.findMany({ where: { courseId: c.id, source: "SE" }, select: { lectureNumber: true, topic: true }, orderBy: { lectureNumber: "asc" } });
    const m = J<Record<string, string>>(stored.find((r) => r.key === `odl.modes.${c.id}`)?.value || "{}", {});
    const lectures = rows.map((r) => ({ n: r.lectureNumber, topic: r.topic, mode: m[String(r.lectureNumber)] || "" }));
    const tagged = lectures.filter((l) => l.mode);
    out.push({ code, courseId: c.id, lectures, pct: tagged.length ? Math.round((100 * tagged.filter((l) => l.mode !== "REC").length) / lectures.length) : null });
  }
  return out;
}
export async function saveModes(p: Prog, byId: string, courseId: string, code: string, modes: Record<string, string>) {
  const clean = Object.fromEntries(Object.entries(modes).filter(([, v]) => MODES[v]));
  const { saveSetting } = await import("./scopedSettings");
  await saveSetting(p.chairmanId, "INSTITUTE", p.chairmanId, `odl.modes.${courseId}`, JSON.stringify(clean), byId);
  const total = await prisma.lectureRow.count({ where: { courseId, source: "SE" } });
  const pct = total ? Math.round((100 * Object.values(clean).filter((v) => v !== "REC").length) / total) : 0;
  const d = dataOf(p);
  await saveData(p, { courses: (d.courses || []).map((c) => (c.code === code ? { ...c, f2fPct: pct } : c)) });
  return pct;
}
