// Queue item 23: faculty requirements per accreditation body, as data. NCEAC values and wording are from the NCEAC
// Accreditation Manual 2023 (regulations-seed/NCEAC-Accreditation-Manual-2023.pdf), section 3.2.5 "Criterion 5 –
// Faculty"; each carries its clause. The Super Admin team can add a newer version that applies from a term onwards.

export type RuleField = { key: string; label: string; clause: string; def: number };
export const NCEAC_FIELDS: RuleField[] = [
  { key: "minDedicated", label: "Dedicated full-time core computing faculty, at least (four batches of at most 50)", clause: "NCEAC 2023 §3.2.5.2(a)", def: 7 },
  { key: "maxDemonstrators", label: "Of them, Demonstrators / Teaching Fellows / TAs / Junior Lecturers, at most", clause: "NCEAC 2023 §3.2.5.2(a)", def: 2 },
  { key: "maxBatchSize", label: "Students per batch, at most", clause: "NCEAC 2023 §3.2.5.2(a)", def: 50 },
  { key: "minPhd", label: "Dedicated faculty with a PhD, at least", clause: "NCEAC 2023 §3.2.5.2(b)", def: 1 },
  { key: "restYears", label: "Years of education for the rest (except demonstrators)", clause: "NCEAC 2023 §3.2.5.2(b)", def: 18 },
  { key: "demonstratorYears", label: "Years of education for demonstrators, at least", clause: "NCEAC 2023 §3.2.5.2(b)", def: 16 },
  { key: "year1", label: "New program, 1st year only: faculty at least", clause: "NCEAC 2023 §3.2.5.2(d)", def: 3 },
  { key: "year2", label: "New program, 1st and 2nd year: faculty at least", clause: "NCEAC 2023 §3.2.5.2(d)", def: 4 },
  { key: "year3", label: "New program, 1st to 3rd year: faculty at least", clause: "NCEAC 2023 §3.2.5.2(d)", def: 6 },
  { key: "visitingEach", label: "Each visiting teacher counts as (full-time equivalent)", clause: "NCEAC 2023 §3.2.5.2(f)", def: 0.25 },
  { key: "visitingCap", label: "All visiting teachers together count at most", clause: "NCEAC 2023 §3.2.5.2(f)", def: 1 },
  { key: "visitingIndustryYears", label: "Visiting practitioner: years of industry experience, at least (16-year computing degree)", clause: "NCEAC 2023 §3.2.5.2(g)", def: 3 },
  { key: "maxLoadTerm", label: "Course load per semester, at most (credit hours)", clause: "NCEAC 2023 §3.2.5.3", def: 9 },
  { key: "minLoadYear", label: "Course load per year for full-time faculty, at least (credit hours)", clause: "NCEAC 2023 §3.2.5.4", def: 9 },
  { key: "minLoadYearAdmin", label: "Course load per year for administrative posts (VC, Rector, Dean, Chairperson, Director), at least", clause: "NCEAC 2023 §3.2.5.4", def: 6 },
];
export const NCEAC_DEFAULT: Record<string, number> = Object.fromEntries(NCEAC_FIELDS.map((f) => [f.key, f.def]));
export const BODIES: Record<string, RuleField[]> = { NCEAC: NCEAC_FIELDS };

export type Version = { id: string; body: string; label: string; fromTerm: string; fromYear: number; rules: Record<string, number> };
const termNo = (term: string, year: number) => year * 2 + (/fall/i.test(term) ? 1 : 0);
/** The version in force for a term: the newest whose start is not after it; else the manual's own values. */
export function versionFor(body: string, versions: Version[], term: string, year: number): Version {
  const base: Version = { id: "default", body, label: body === "NCEAC" ? "NCEAC Accreditation Manual 2023" : body, fromTerm: "Fall", fromYear: 2023, rules: body === "NCEAC" ? NCEAC_DEFAULT : {} };
  const ok = versions.filter((v) => v.body === body && termNo(v.fromTerm, v.fromYear) <= termNo(term, year)).sort((a, b) => termNo(b.fromTerm, b.fromYear) - termNo(a.fromTerm, a.fromYear));
  return ok[0] ? { ...ok[0], rules: { ...base.rules, ...ok[0].rules } } : base;
}

// ---- Highest degree and class, with the defaults asked for: "Dr" in the name means a PhD, a lab engineer a
// bachelor's (a demonstrator), everyone else a master's (MS / MPhil, 18 years). All editable.
export type Degree = "PHD" | "MS" | "BS" | "OTHER";
export const YEARS: Record<Degree, number> = { PHD: 20, MS: 18, BS: 16, OTHER: 14 };
export function parseDegree(s: string | null | undefined): Degree | null {
  const v = String(s || "").trim().toLowerCase(); if (!v) return null;
  if (/ph\.?\s?d|doctor|dba|d\.?sc/.test(v)) return "PHD";
  if (/\bms\b|m\.s|mphil|m\.phil|master|\bme\b|mcs|msc|m\.sc|mba|meng|m\.eng|18/.test(v)) return "MS";
  if (/\bbs\b|b\.s|bachelor|\bbe\b|bsc|b\.sc|bcs|beng|b\.eng|16/.test(v)) return "BS";
  return "OTHER";
}
export function defaultDegree(name: string, role: string): Degree {
  if (/^\s*(prof\.?\s+)?dr\.?\s/i.test(name)) return "PHD";
  if (role === "LAB_ENGINEER") return "BS";
  return "MS";
}
export function parseEmployment(s: string | null | undefined, role: string): string {
  const v = String(s || "").toLowerCase();
  if (role === "LAB_ENGINEER" || /lab/.test(v)) return "LAB_ENGINEER";
  if (/visit|part|adjunct/.test(v)) return "VISITING";
  if (/contract/.test(v)) return "CONTRACT";
  return "PERMANENT";
}

// ---- NCEAC Criterion 5 for one program.
export type Person = { id: string; name: string; degree: Degree; employment: string; cls?: string | null; admin: boolean;
  /** credit hours this person teaches in the program, this term and over the year */
  inProgTerm: number; inProgYear: number; /** all their courses, every program and department */ allTerm: number; allYear: number; yearKnown: boolean };
export type Row = Person & { klass: "DEDICATED" | "SHARED" | "VISITING" | "DEMONSTRATOR"; fte: number; overLoad: boolean; underLoad: boolean; why: string };
/** Dedicated = full-time and carries the minimum load in this program; Shared = full-time without it (or employed in
 * another program); Visiting = not employed full-time; Demonstrator = 16-year faculty (lab engineers by default). */
export function classify(p: Person, r: Record<string, number>): Row {
  const minYear = p.admin ? r.minLoadYearAdmin : r.minLoadYear;
  const inYear = p.yearKnown ? p.inProgYear : p.inProgTerm * 2; // one term known: judged against half the year's minimum
  const allYear = p.yearKnown ? p.allYear : p.allTerm * 2;
  let klass: Row["klass"];
  if (p.cls === "DEDICATED" || p.cls === "SHARED" || p.cls === "VISITING" || p.cls === "DEMONSTRATOR") klass = p.cls;
  else if (p.employment === "VISITING") klass = "VISITING";
  else if (p.degree === "BS" || p.employment === "LAB_ENGINEER") klass = "DEMONSTRATOR";
  else klass = inYear >= minYear ? "DEDICATED" : "SHARED";
  const fte = klass === "VISITING" ? r.visitingEach : allYear ? Math.min(1, inYear / allYear) : 0;
  const why = p.cls ? "set by the institute" : klass === "VISITING" ? "visiting" : klass === "DEMONSTRATOR" ? "16-year degree / lab engineer" : `${inYear} of at least ${minYear} credit hours a year here${p.yearKnown ? "" : " (one term known, doubled)"}`;
  return { ...p, klass, fte: Math.round(fte * 100) / 100, overLoad: p.allTerm > r.maxLoadTerm, underLoad: klass !== "VISITING" && allYear < minYear, why };
}
export type Check = { label: string; have: string; need: string; ok: boolean; clause: string };
export function nceacChecks(rows: Row[], r: Record<string, number>, yearsRunning: number, maxBatch: number) {
  const ded = rows.filter((x) => x.klass === "DEDICATED");
  const dem = rows.filter((x) => x.klass === "DEMONSTRATOR");
  const counted = ded.length + Math.min(dem.length, r.maxDemonstrators);
  const need = yearsRunning >= 4 ? r.minDedicated : yearsRunning === 3 ? r.year3 : yearsRunning === 2 ? r.year2 : r.year1;
  const visiting = Math.min(r.visitingCap, rows.filter((x) => x.klass === "VISITING").length * r.visitingEach);
  const phd = ded.filter((x) => x.degree === "PHD").length;
  const below18 = ded.filter((x) => YEARS[x.degree] < r.restYears);
  const over = rows.filter((x) => x.overLoad), under = rows.filter((x) => x.underLoad);
  const checks: Check[] = [
    { label: `Dedicated full-time core faculty (${yearsRunning >= 4 ? "four batches" : `${yearsRunning} year${yearsRunning === 1 ? "" : "s"} running`})`, have: `${ded.length} + ${Math.min(dem.length, r.maxDemonstrators)} demonstrator${dem.length === 1 ? "" : "s"} = ${counted}`, need: `at least ${need}`, ok: counted >= need, clause: yearsRunning >= 4 ? "NCEAC 2023 §3.2.5.2(a)" : "NCEAC 2023 §3.2.5.2(d)" },
    { label: "Demonstrators / TAs counted", have: String(dem.length), need: `at most ${r.maxDemonstrators} count`, ok: dem.length <= r.maxDemonstrators, clause: "NCEAC 2023 §3.2.5.2(a)" },
    { label: "Dedicated faculty with a PhD", have: String(phd), need: `at least ${r.minPhd}`, ok: phd >= r.minPhd, clause: "NCEAC 2023 §3.2.5.2(b)" },
    { label: `Dedicated faculty (not demonstrators) with ${r.restYears} years of education`, have: `${ded.length - below18.length} of ${ded.length}`, need: "all", ok: !below18.length, clause: "NCEAC 2023 §3.2.5.2(b)" },
    { label: "Visiting faculty, full-time equivalent", have: visiting.toFixed(2), need: `each ${r.visitingEach}, together at most ${r.visitingCap}`, ok: true, clause: "NCEAC 2023 §3.2.5.2(f)" },
    { label: `Largest batch`, have: String(maxBatch), need: `at most ${r.maxBatchSize}`, ok: maxBatch <= r.maxBatchSize, clause: "NCEAC 2023 §3.2.5.2(a)" },
    { label: `Nobody over ${r.maxLoadTerm} credit hours this semester`, have: over.length ? over.map((x) => `${x.name} ${x.allTerm}`).join(", ") : "none over", need: `at most ${r.maxLoadTerm}`, ok: !over.length, clause: "NCEAC 2023 §3.2.5.3" },
    { label: "Full-time faculty with the minimum yearly load", have: under.length ? under.map((x) => x.name).join(", ") : "all", need: `${r.minLoadYear} a year (${r.minLoadYearAdmin} for administrative posts)`, ok: !under.length, clause: "NCEAC 2023 §3.2.5.4" },
  ];
  return { checks, counted, need, visiting, fte: Math.round((ded.reduce((a, x) => a + x.fte, 0) + Math.min(dem.length, r.maxDemonstrators) + visiting) * 100) / 100 };
}
