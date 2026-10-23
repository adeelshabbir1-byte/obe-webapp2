import { prisma } from "./db";
import { rdb, parseJ } from "./registers";

// NBEAC Standard 4: each teacher is academically qualified (AQ), professionally qualified (PQ) or neither, from their
// own profile; their full-time equivalent (FTE); and per program the ratios the standard asks for, against limits the
// institute can change to match the current manual.
//   AQ: a doctorate (PhD / DBA) in the field, kept current by at least one publication in the last five years (or a
//       doctorate finished in the last five years).
//   PQ: a master's degree (16–18 years) and at least five years of relevant professional (industry) experience.
//   FTE: a full-time teacher counts 1; a visiting / part-time teacher counts their credit hours ÷ the full load.

export const FS_HINT = "AQ / PQ overrides and the institute's limits need prisma/migration_faculty_sufficiency.sql — run it in Supabase.";
export type Rules = { studentsPerFte: number; qualifiedPct: number; aqPct: number; fullTimePct: number; fullLoad: number; pqIndustryYears: number; aqPubYears: number };
export const DEFAULT_RULES: Rules = { studentsPerFte: 25, qualifiedPct: 90, aqPct: 50, fullTimePct: 60, fullLoad: 12, pqIndustryYears: 5, aqPubYears: 5 };
export const RULE_LABELS: [keyof Rules, string][] = [["studentsPerFte", "Most students per full-time-equivalent teacher"], ["qualifiedPct", "Least share of credit hours taught by AQ + PQ teachers (%)"], ["aqPct", "Least share of credit hours taught by AQ teachers (%)"], ["fullTimePct", "Least share of credit hours taught by full-time teachers (%)"], ["fullLoad", "Full teaching load (credit hours a term)"], ["pqIndustryYears", "Years of professional experience for PQ"], ["aqPubYears", "Years in which an AQ teacher must have published"]];

export async function rulesFor(chairmanId: string): Promise<Rules> {
  const r = await rdb.facultySufficiencyRule.findUnique({ where: { chairmanId } }).catch(() => null);
  return { ...DEFAULT_RULES, ...parseJ<Partial<Rules>>(r?.rulesJson, {}) };
}

type Rec = { userId: string; kind: string; title: string; category: string | null; startYear: number | null; startMonth: number | null; endYear: number | null; endMonth: number | null };
export type Status = "AQ" | "PQ" | "OTHER";
/** The classification a teacher's own profile supports, with the reasons. */
export function classify(recs: Rec[], rules: Rules, now = new Date()) {
  const edu = recs.filter((r) => r.kind === "EDUCATION");
  const doctor = edu.find((e) => /ph\.?\s?d|doctor|d\.?b\.?a\b/i.test(e.title));
  const master = edu.find((e) => /\b(ms|m\.s|mphil|m\.phil|mba|msc|m\.sc|ma|mcom|m\.com|master|mcs|llm)\b/i.test(e.title));
  const year = now.getFullYear();
  const pubs = recs.filter((r) => r.kind === "PUBLICATION" && (r.startYear || 0) >= year - rules.aqPubYears).length;
  const months = recs.filter((r) => r.kind === "EXPERIENCE" && /industry/i.test(r.category || "")).reduce((t, r) => { const s = (r.startYear || 0) * 12 + (r.startMonth || 1); const e = (r.endYear || year) * 12 + (r.endMonth || (r.endYear ? 12 : now.getMonth() + 1)); return t + Math.max(0, e - s); }, 0);
  const industryYears = Math.round(months / 12 * 10) / 10;
  const recentDoctor = !!doctor && (doctor.endYear || 0) >= year - rules.aqPubYears;
  let status: Status = "OTHER", reason = "";
  if (doctor && (pubs > 0 || recentDoctor)) { status = "AQ"; reason = `${doctor.title}; ${pubs} publication(s) in the last ${rules.aqPubYears} years${recentDoctor && !pubs ? " (doctorate within the last five years)" : ""}`; }
  else if ((master || doctor) && industryYears >= rules.pqIndustryYears) { status = "PQ"; reason = `${(master || doctor)!.title}; ${industryYears} years of professional experience`; }
  else reason = doctor ? `${doctor.title}, but no publication in the last ${rules.aqPubYears} years (not kept current)` : master ? `${master.title}; ${industryYears} years of professional experience (needs ${rules.pqIndustryYears})` : "no master's degree or doctorate recorded";
  return { status, reason, pubs, industryYears, degree: (doctor || master || edu[0])?.title || "—" };
}

/** Teachers of a program this term, their classification and FTE, and the program's ratios against the limits. */
export async function sufficiency(chairmanId: string, program: string) {
  const rules = await rulesFor(chairmanId);
  const batches = await prisma.batch.findMany({ where: { degreeProgram: program, coordinator: { managedById: chairmanId } }, select: { id: true } });
  const courses = await prisma.course.findMany({ where: { batchId: { in: batches.map((b) => b.id).concat(["none"]) }, isOffered: true, isNonCredit: false }, select: { id: true, code: true, creditHours: true, instructorId: true } });
  const students = await prisma.student.count({ where: { batchId: { in: batches.map((b) => b.id).concat(["none"]) }, status: { in: ["ACTIVE", "FROZEN", "PROBATION"] } } as never });
  const ids = Array.from(new Set(courses.map((c) => c.instructorId).filter((x): x is string => !!x)));
  const [users, profiles, recs, overrides, allLoads] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids.concat(["none"]) } }, select: { id: true, name: true } }),
    prisma.facultyProfile.findMany({ where: { userId: { in: ids.concat(["none"]) } }, select: { userId: true, designation: true, employmentType: true } }),
    prisma.facultyRecord.findMany({ where: { userId: { in: ids.concat(["none"]) }, kind: { in: ["EDUCATION", "EXPERIENCE", "PUBLICATION"] } }, select: { userId: true, kind: true, title: true, category: true, startYear: true, startMonth: true, endYear: true, endMonth: true } }),
    rdb.facultyQualification.findMany({ where: { userId: { in: ids.concat(["none"]) } } }).catch(() => []) as Promise<{ userId: string; status: Status; note: string | null }[]>,
    prisma.course.groupBy({ by: ["instructorId"], where: { instructorId: { in: ids.concat(["none"]) }, isOffered: true, isNonCredit: false }, _sum: { creditHours: true } }),
  ]);
  const teachers = ids.map((id) => {
    const p = profiles.find((x) => x.userId === id);
    const c = classify(recs.filter((r) => r.userId === id), rules);
    const o = overrides.find((x) => x.userId === id);
    const fullTime = !/visit|part|adjunct/i.test(p?.employmentType || "");
    const loadAll = allLoads.find((l) => l.instructorId === id)?._sum.creditHours || 0;
    const inProgram = courses.filter((k) => k.instructorId === id).reduce((t, k) => t + k.creditHours, 0);
    // FTE given to this program: a full-time teacher's share of their whole load spent here; a visiting teacher's hours ÷ full load.
    const fte = fullTime ? (loadAll ? inProgram / loadAll : 1) : Math.min(1, inProgram / rules.fullLoad);
    return { id, name: users.find((u) => u.id === id)?.name || "—", designation: p?.designation || "—", employment: p?.employmentType || "—", fullTime, ...c, auto: c.status, status: (o?.status || c.status) as Status, overridden: !!o, note: o?.note || null, credits: inProgram, fte: Math.round(fte * 100) / 100 };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const total = teachers.reduce((t, x) => t + x.credits, 0) || 0;
  const share = (f: (t: (typeof teachers)[number]) => boolean) => (total ? Math.round((100 * teachers.filter(f).reduce((t, x) => t + x.credits, 0)) / total) : 0);
  const fte = Math.round(teachers.reduce((t, x) => t + x.fte, 0) * 100) / 100;
  const ratio = fte ? Math.round((students / fte) * 10) / 10 : null;
  const checks = [
    { label: "Students per full-time-equivalent teacher", value: ratio === null ? "—" : `${ratio} : 1`, ok: ratio !== null && ratio <= rules.studentsPerFte, limit: `at most ${rules.studentsPerFte} : 1` },
    { label: "Credit hours taught by AQ + PQ teachers", value: `${share((t) => t.status !== "OTHER")}%`, ok: share((t) => t.status !== "OTHER") >= rules.qualifiedPct, limit: `at least ${rules.qualifiedPct}%` },
    { label: "Credit hours taught by AQ teachers", value: `${share((t) => t.status === "AQ")}%`, ok: share((t) => t.status === "AQ") >= rules.aqPct, limit: `at least ${rules.aqPct}%` },
    { label: "Credit hours taught by full-time teachers", value: `${share((t) => t.fullTime)}%`, ok: share((t) => t.fullTime) >= rules.fullTimePct, limit: `at least ${rules.fullTimePct}%` },
  ];
  return { program, rules, students, teachers, fte, totalCredits: total, checks, ok: checks.every((c) => c.ok) };
}
