import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { reviewBatchWhere, REVIEW_ROLES } from "./reviewScope";
import { GE_RULE_DEFAULTS, GE_RULE_LABELS } from "./ugPolicy";

// Accreditation gaps closed in one place: PEO attainment, faculty survey, HEC Undergraduate Education Policy check,
// grade distribution across sections, NBEAC Assurance of Learning, QEC proformas, IPE and internationalisation.
// Wording follows the councils' manuals as we know them; each page says to check against the current manual.

export const qdb = prisma as unknown as Record<string, any>;
export const QUALITY_HINT = "Not set up yet — the Super User needs to run prisma/migration_quality_gaps.sql.";
export { REVIEW_ROLES };
const parse = <T,>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

type U = { id: string; role: string; managedById: string | null };

/** Programs the person can see: [{ coordinatorId, degreeProgram, lead }]. */
export async function programsFor(user: U) {
  const where = await reviewBatchWhere(user);
  if (!where) return [];
  const bs = await prisma.batch.findMany({ where, select: { coordinatorId: true, degreeProgram: true, coordinator: { select: { name: true } } }, orderBy: { degreeProgram: "asc" } });
  const m = new Map<string, { coordinatorId: string; degreeProgram: string; lead: string; key: string }>();
  for (const b of bs) { const key = `${b.coordinatorId}|${b.degreeProgram}`; if (!m.has(key)) m.set(key, { coordinatorId: b.coordinatorId, degreeProgram: b.degreeProgram, lead: b.coordinator?.name || "", key }); }
  return Array.from(m.values());
}
export const canEditProgram = (user: U, coordinatorId: string) => user.id === coordinatorId || ["CHAIRMAN", "HEAD_OF_DEPARTMENT", "OMC", "DEPARTMENT_COORDINATOR", "DEAN"].includes(user.role);

/* ---------------- PEO attainment ---------------- */

/** PEO attainment from alumni and employer survey questions mapped to PEOs: share of answers rated 3 or more, and the average. */
export async function peoAttainment(coordinatorId: string, degreeProgram: string) {
  const prof = await prisma.programProfile.findFirst({ where: { coordinatorId, degreeProgram }, select: { peos: true } }).catch(() => null);
  let peos: string[] = []; try { peos = prof?.peos ? JSON.parse(prof.peos) : []; } catch { peos = prof?.peos ? [prof.peos] : []; }
  const answers = await prisma.surveyAnswer.findMany({
    where: { question: { mappedPeoLabel: { not: null }, surveyTemplate: { coordinatorId, title: { contains: degreeProgram } } }, surveyResponse: { submittedAt: { not: null } } },
    select: { ratingValue: true, question: { select: { mappedPeoLabel: true, surveyTemplate: { select: { stakeholderType: true } } } } },
  });
  const targets = ((await qdb.peoTarget.findMany({ where: { coordinatorId, degreeProgram } }).catch(() => null)) as { peoLabel: string; target: number; actionTaken: string | null }[] | null);
  const rows = peos.map((text, i) => {
    const label = `PEO-${i + 1}`;
    const by = (type?: string) => answers.filter((a) => a.question.mappedPeoLabel === label && (!type || a.question.surveyTemplate.stakeholderType === type));
    const stat = (xs: typeof answers) => xs.length ? { n: xs.length, pct: Math.round((1000 * xs.filter((x) => x.ratingValue >= 3).length) / xs.length) / 10, avg: Math.round((100 * xs.reduce((s, x) => s + x.ratingValue, 0)) / xs.length) / 100 } : null;
    const t = targets?.find((x) => x.peoLabel === label);
    const all = stat(by());
    const target = t?.target ?? 70;
    return { label, text, alumni: stat(by("ALUMNI")), employer: stat(by("EMPLOYER")), all, target, met: all ? all.pct >= target : null, actionTaken: t?.actionTaken || null };
  });
  return { peos, rows, ready: targets !== null };
}

/* ---------------- Faculty survey (QEC Proforma 5) ---------------- */

export const FACULTY_SURVEY: { group: string; items: [string, string][] }[] = [
  { group: "Teaching and workload", items: [["load", "My teaching load is reasonable"], ["courses", "I teach courses that match my expertise"], ["time", "I have enough time for course preparation and student consultation"]] },
  { group: "Resources and facilities", items: [["office", "My office space and equipment are adequate"], ["labs", "Labs and computing facilities support my courses"], ["library", "Library and online resources meet my needs"]] },
  { group: "Professional development", items: [["develop", "The institute supports my professional development (training, conferences)"], ["research", "I get support and time for research"], ["mentor", "New faculty are mentored well"]] },
  { group: "Environment and governance", items: [["voice", "I have a say in curriculum and program decisions"], ["fair", "Promotion and evaluation are fair and transparent"], ["respect", "The work environment is collegial and respectful"], ["leaders", "Leadership communicates clearly"]] },
  { group: "Overall", items: [["salary", "Pay and benefits are satisfactory"], ["overall", "Overall, I am satisfied working here"]] },
];
export const FACULTY_ITEMS = FACULTY_SURVEY.flatMap((g) => g.items);
export const FACULTY_ROLES = ["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "OMC", "DEAN", "LAB_MANAGER"];
export const MIN_FACULTY_ANSWERS = 3; // smaller groups are not broken out, to keep answers anonymous

export function facultySummary(answers: { answersJson: string; departmentId: string | null }[]) {
  const avg: Record<string, number | null> = {};
  for (const [k] of FACULTY_ITEMS) {
    const v = answers.map((a) => Number(parse<Record<string, number>>(a.answersJson, {})[k])).filter((x) => x > 0);
    avg[k] = v.length ? Math.round((100 * v.reduce((a, b) => a + b, 0)) / v.length) / 100 : null;
  }
  const vals = Object.values(avg).filter((x): x is number => x !== null);
  return { n: answers.length, avg, overall: vals.length ? Math.round((100 * vals.reduce((a, b) => a + b, 0)) / vals.length) / 100 : null };
}

/* ---------------- HEC Undergraduate Education Policy check ---------------- */

// Plus the credit hours of each named General Education requirement (lib/ugPolicy.ts), keys ge*.
export type PolicyRules = { minTotal: number; maxTotal: number; minGenEd: number; minIds: number; minMajor: number; capstone: number; internship: number; maxSemester: number; pecMinTotal: number; pecFydp: number } & Record<string, number>;
// Defaults from the HEC Undergraduate Education Policy (2023) and PEC's usual engineering limits, as we know them.
// The Institute Head can change them to match the current policy.
export const POLICY_DEFAULTS: PolicyRules = { minTotal: 120, maxTotal: 144, minGenEd: 30, minIds: 12, minMajor: 72, capstone: 3, internship: 3, maxSemester: 21, pecMinTotal: 130, pecFydp: 6, ...GE_RULE_DEFAULTS };
export const POLICY_LABELS: [string, string][] = [["minTotal", "Minimum total credit hours (BS)"], ["maxTotal", "Maximum total credit hours (BS)"], ["minGenEd", "Minimum General Education credits"], ["minIds", "Minimum interdisciplinary (IDS) credits"], ["minMajor", "Minimum major (Core + Elective) credits"], ["capstone", "Capstone project credits"], ["internship", "Internship / field experience credits"], ["maxSemester", "Maximum credits in one semester"], ["pecMinTotal", "Minimum total credit hours (PEC engineering)"], ["pecFydp", "Final year design project credits (PEC)"], ...GE_RULE_LABELS];

export async function policyRules(chairmanId: string): Promise<PolicyRules> {
  const r = await qdb.policyRuleSet.findUnique({ where: { chairmanId } }).catch(() => null);
  return { ...POLICY_DEFAULTS, ...parse<Record<string, number>>(r?.rulesJson, {}) } as PolicyRules;
}

export type PolicyLine = { label: string; value: string; ok: boolean | null; note?: string };
/** Check one program's scheme of studies (the latest batch's courses) against the policy. */
export function checkScheme(courses: { code: string; title: string; creditHours: number; courseType: string; semesterNumber: number | null; isNonCredit: boolean; trackName: string | null }[], rules: PolicyRules, body: string) {
  const cs = courses.filter((c) => !c.isNonCredit && !c.trackName && !/^domain (elective|ids)$/i.test((c.courseType || "").trim()));
  const sum = (f: (c: (typeof cs)[number]) => boolean) => cs.filter(f).reduce((s, c) => s + (c.creditHours || 0), 0);
  const type = (t: string) => (c: (typeof cs)[number]) => (c.courseType || "").toLowerCase() === t.toLowerCase();
  const total = sum(() => true), gen = sum(type("General Education")), ids = sum(type("IDS")), major = sum((c) => ["core", "elective", "lab", "capstone project"].includes((c.courseType || "").toLowerCase()));
  const cap = sum(type("Capstone Project")), intern = sum(type("Field Experience"));
  const pec = body === "PEC";
  const out: PolicyLine[] = [];
  const min = pec ? rules.pecMinTotal : rules.minTotal;
  out.push({ label: "Total credit hours", value: `${total}`, ok: total >= min && (pec || total <= rules.maxTotal), note: pec ? `at least ${min}` : `${rules.minTotal}–${rules.maxTotal}` });
  if (!pec) {
    out.push({ label: "General Education", value: `${gen}`, ok: gen >= rules.minGenEd, note: `at least ${rules.minGenEd}` });
    out.push({ label: "Interdisciplinary (IDS)", value: `${ids}`, ok: ids >= rules.minIds, note: `at least ${rules.minIds}` });
    out.push({ label: "Major (Core, Elective, Lab, Capstone)", value: `${major}`, ok: major >= rules.minMajor, note: `at least ${rules.minMajor}` });
  }
  out.push({ label: pec ? "Final year design project" : "Capstone project", value: `${cap}`, ok: cap >= (pec ? rules.pecFydp : rules.capstone), note: `${pec ? rules.pecFydp : rules.capstone} credits, course type "Capstone Project"` });
  out.push({ label: "Internship / field experience", value: intern ? `${intern}` : "none", ok: pec ? null : intern >= rules.internship, note: pec ? "PEC: a compulsory internship, usually non-credit — record it under Internships & Placements" : `${rules.internship} credits, course type "Field Experience"` });
  const sems = new Map<number, number>();
  for (const c of cs) if (c.semesterNumber) sems.set(c.semesterNumber, (sems.get(c.semesterNumber) || 0) + c.creditHours);
  const heavy = Array.from(sems.entries()).filter(([, v]) => v > rules.maxSemester);
  out.push({ label: "Semester load", value: Array.from(sems.entries()).sort((a, b) => a[0] - b[0]).map(([s, v]) => `S${s}:${v}`).join(" "), ok: sems.size ? heavy.length === 0 : null, note: heavy.length ? `over ${rules.maxSemester} in ${heavy.map(([s]) => `semester ${s}`).join(", ")}` : `at most ${rules.maxSemester} a semester` });
  const unplaced = cs.filter((c) => !c.semesterNumber).length;
  if (unplaced) out.push({ label: "Courses without a semester", value: `${unplaced}`, ok: false, note: "set the semester so loads can be checked" });
  return out;
}

/* ---------------- Grade distribution across sections ---------------- */

export type GradeRow = { courseId: string; code: string; title: string; teacher: string; batch: string; term: string; n: number; mean: number | null; passRate: number; aShare: number; fShare: number; dist: Record<string, number>; status: string; flags: string[] };

/** Grade spread of submitted / approved results, flagged against the program's own averages and against other sections of the same course. */
export async function gradeDistribution(courseWhere: Record<string, unknown>) {
  const courses = await prisma.course.findMany({ where: courseWhere, select: { id: true, code: true, title: true, instructor: { select: { name: true } }, batch: { select: { batchName: true, degreeProgram: true } } }, take: 1500 });
  const res = (await qdb.courseResult.findMany({ where: { courseId: { in: courses.map((c) => c.id) }, status: { in: ["SUBMITTED", "APPROVED"] } }, select: { courseId: true, status: true, termName: true, termYear: true, summaryJson: true } })) as { courseId: string; status: string; termName: string | null; termYear: number | null; summaryJson: string | null }[];
  const cOf = new Map(courses.map((c) => [c.id, c]));
  const rows: GradeRow[] = [];
  for (const r of res) {
    const c = cOf.get(r.courseId); if (!c) continue;
    const s = parse<{ students?: number; mean?: number; passRate?: number; distribution?: Record<string, number> }>(r.summaryJson, {});
    const n = s.students || 0; if (!n) continue;
    const dist = s.distribution || {};
    const a = Object.entries(dist).filter(([g]) => /^A/.test(g)).reduce((t, [, v]) => t + v, 0);
    rows.push({ courseId: c.id, code: c.code, title: c.title, teacher: c.instructor?.name || "—", batch: `${c.batch?.degreeProgram || ""} ${c.batch?.batchName || ""}`.trim(), term: r.termName ? `${r.termName} ${r.termYear || ""}`.trim() : "—", n, mean: s.mean ?? null, passRate: s.passRate ?? 0, aShare: Math.round((1000 * a) / n) / 10, fShare: Math.round((1000 * (dist.F || 0)) / n) / 10, dist, status: r.status, flags: [] });
  }
  const stat = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / (xs.length || 1); const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length || 1)); return { m, sd }; };
  const A = stat(rows.map((r) => r.aShare)), F = stat(rows.map((r) => r.fShare));
  for (const r of rows) {
    if (rows.length >= 5 && A.sd > 0 && r.aShare > A.m + 1.5 * A.sd) r.flags.push(`Many A grades (${r.aShare}% vs ${Math.round(A.m)}% usual)`);
    if (rows.length >= 5 && F.sd > 0 && r.fShare > F.m + 1.5 * F.sd) r.flags.push(`Many fails (${r.fShare}% vs ${Math.round(F.m)}% usual)`);
    const same = rows.filter((x) => x.code === r.code && x.term === r.term && x.courseId !== r.courseId && x.mean != null);
    if (same.length && r.mean != null) { const o = same.reduce((t, x) => t + (x.mean as number), 0) / same.length; if (Math.abs(r.mean - o) >= 10) r.flags.push(`Mean ${Math.round(r.mean)}% vs ${Math.round(o)}% in other sections`); }
  }
  return { rows: rows.sort((a, b) => a.code.localeCompare(b.code)), avgA: Math.round(10 * A.m) / 10, avgF: Math.round(10 * F.m) / 10 };
}

/* ---------------- QEC proformas ---------------- */

export const PROFORMAS: { no: number; title: string; where: string; href: string; note?: string }[] = [
  { no: 1, title: "Student Course Evaluation", where: "Course & Teacher Evaluations (students fill it in their portal)", href: "/evaluations" },
  { no: 2, title: "Faculty Course Review Report", where: "Teacher end-of-course review", href: "/coordinator/course-folders" },
  { no: 3, title: "Survey of Department Offering PhD Programs", where: "Only for departments with a PhD program", href: "/ipe", note: "Answer in the IPE / SAR narrative if you run a PhD program." },
  { no: 4, title: "Research Student Progress Review", where: "Only for MS/PhD research students", href: "/ipe", note: "Not tracked in OBEHUB; keep the forms on file if you run research degrees." },
  { no: 5, title: "Faculty Survey", where: "Faculty Survey", href: "/faculty-survey" },
  { no: 6, title: "Survey of Graduating Students", where: "Graduating Student Exit Survey (program surveys)", href: "/coordinator/surveys" },
  { no: 7, title: "Alumni Survey", where: "Alumni Survey (program surveys)", href: "/coordinator/surveys" },
  { no: 8, title: "Employer Survey", where: "Employer Survey (program surveys)", href: "/coordinator/surveys" },
  { no: 9, title: "Teacher Evaluation Form", where: "Course & Teacher Evaluations", href: "/evaluations" },
  { no: 10, title: "Faculty Resume", where: "Faculty profiles (each teacher keeps their own)", href: "/faculty/profile" },
];

/* ---------------- IPE ---------------- */

export const IPE_STANDARDS: [number, string, string][] = [
  [1, "Mission Statement and Goals", "Mission and goals are clear, approved, published and used in planning."],
  [2, "Planning and Evaluation", "A strategic plan with targets; progress is measured and used to improve."],
  [3, "Organization and Governance", "Statutory bodies meet; roles, delegation and decisions are documented."],
  [4, "Integrity", "Honest dealings with students, staff and the public; policies on plagiarism, harassment, conflict of interest."],
  [5, "Faculty", "Enough qualified faculty; fair recruitment, workload, evaluation and development."],
  [6, "Students", "Fair admissions; student records, discipline, grievances and outcomes tracked."],
  [7, "Institutional Resources", "Financial, physical, library and IT resources match the programs offered."],
  [8, "Academic Programs and Curricula", "Programs approved and reviewed; outcomes measured; curricula follow HEC policy."],
  [9, "Public Disclosure and Transparency", "Accurate information on programs, fees, results and accreditation is published."],
  [10, "Assessment and Quality Assurance", "A working QEC; self-assessments, surveys and follow-up actions."],
  [11, "Student Support Services", "Advising, counselling, career services, health, financial aid and activities."],
];
export const IPE_SCORES: [number, string][] = [[4, "Fully met"], [3, "Mostly met"], [2, "Partly met"], [1, "Not met"]];

/** Facts the system already holds, offered as evidence beside each IPE standard. */
export async function ipeFacts(chairmanId: string) {
  const leads = (await prisma.user.findMany({ where: { managedById: chairmanId, role: "PROGRAM_COORDINATOR" }, select: { id: true } })).map((u) => u.id).concat(["none"]);
  const count = (m: string, where: Record<string, unknown>) => (qdb[m]?.count({ where }) as Promise<number> | undefined)?.catch(() => 0) ?? Promise.resolve(0);
  const [faculty, students, programs, meetings, cqi, evals, complaints, placements, surveys] = await Promise.all([
    prisma.user.count({ where: { managedById: chairmanId, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] } } as never }).catch(() => 0),
    prisma.student.count({ where: { batch: { coordinatorId: { in: leads } } } }).catch(() => 0),
    prisma.batch.findMany({ where: { coordinatorId: { in: leads } }, select: { degreeProgram: true }, distinct: ["degreeProgram"] }).then((x) => x.length).catch(() => 0),
    count("meetingMinutes", { chairmanId }), count("cqiRecord", { batch: { coordinatorId: { in: leads } } }), count("courseEvaluation", {}), count("complaint", { chairmanId }), count("placement", {}), count("surveyResponse", { submittedAt: { not: null }, surveyTemplate: { coordinatorId: { in: leads } } }),
  ]);
  return {
    5: `${faculty} teaching staff on the system; workload and faculty survey pages hold the detail.`,
    6: `${students} students across ${programs} programs; complaints logged: ${complaints}.`,
    8: `${programs} programs with CLO/GA attainment; ${cqi} improvement actions recorded.`,
    10: `${meetings} meeting minutes, ${evals} course/teacher evaluations and ${surveys} completed stakeholder surveys on record.`,
    11: `${placements} internship / placement records; advising and remediation are tracked per student.`,
  } as Record<number, string>;
}

/* ---------------- Internationalisation ---------------- */

export const INTL_KINDS: [string, string][] = [["MOU", "International MoU / partnership"], ["EXCHANGE_OUT", "Our students abroad (exchange)"], ["EXCHANGE_IN", "Exchange students hosted"], ["FOREIGN_STUDENTS", "Foreign students enrolled"], ["FOREIGN_FACULTY", "Foreign / visiting faculty"], ["JOINT", "Joint or dual degree program"], ["VISIT", "International visit / conference / delegation"], ["RESEARCH", "International research collaboration or grant"], ["ACCREDITATION", "International accreditation / ranking"]];

export async function instituteOf(user: U) { return chairmanIdFor(user); }
