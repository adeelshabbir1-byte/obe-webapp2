import type { WorkCal } from "./workdays";

const isWorkday = (cal: WorkCal, d: Date) => !cal.weekend.includes(d.getUTCDay()) && !cal.off.has(d.toISOString().slice(0, 10));

// CLO attainment with no database: the four methods the OMC chooses from, absent (blank) vs zero, marks split between
// CLOs, items left out (not for CLO, excluded, faulty), class results against the target and report levels; the OMC's
// limits checked under the chosen method; mapping and coverage rules; faulty-question and early-warning flags; the
// marks deadline in working days; lab / theory grade shares. lib/cloMethods.ts feeds these from the database.

export type Method = "SUM" | "ITEMS" | "WEIGHTS" | "GRADE";
export const METHODS: Record<Method, { n: number; label: string; text: string }> = {
  SUM: { n: 1, label: "Add all marks", text: "The student's marks on all the CLO's items ÷ the total marks of those items." },
  ITEMS: { n: 2, label: "Pass at least half the items", text: "He clears an item at the pass mark; the CLO when he clears at least X% of its items." },
  WEIGHTS: { n: 3, label: "OMC / SE weights", text: "Each item has a weight within the CLO (adding to 100); CLO % = Σ weight × his % on the item." },
  GRADE: { n: 4, label: "Grade weights", text: "Items weighted by their share of the course grade, normalised to 100 within the CLO." },
};
export const asMethod = (s: unknown): Method => (["SUM", "ITEMS", "WEIGHTS", "GRADE"].includes(String(s)) ? (s as Method) : "GRADE");
export type Levels = { excellent: number; good: number; satisfactory: number };
export type MethodSettings = { method: Method; passPct: number; itemsPct: number; targetPct: number; levels: Levels; faultyAvgPct: number };
export const DEFAULT_SETTINGS: MethodSettings = { method: "GRADE", passPct: 50, itemsPct: 50, targetPct: 60, levels: { excellent: 80, good: 60, satisfactory: 50 }, faultyAvgPct: 40 };
export type Level = "EXCELLENT" | "GOOD" | "SATISFACTORY" | "NOT_MET";
export const LEVEL_LABEL: Record<Level, string> = { EXCELLENT: "Excellent", GOOD: "Good", SATISFACTORY: "Satisfactory", NOT_MET: "Not met" };
export const levelOf = (pct: number, l: Levels): Level => (pct >= l.excellent ? "EXCELLENT" : pct >= l.good ? "GOOD" : pct >= l.satisfactory ? "SATISFACTORY" : "NOT_MET");

export type Part = "THEORY" | "LAB";
/** One assessed item: a quiz, assignment, lab, project, or one mid / final question. */
export type CItem = {
  id: string; label: string; type: string; part: Part; maxMarks: number; gradePct: number; isQuestion: boolean;
  clos: { cloId: string; pct: number }[]; // the CLOs it is mapped to, with the share of its marks (adds to 100)
  notForClo?: boolean; excluded?: boolean; faulty?: boolean;
  weights?: Record<string, number>; // method 3: this item's weight inside each CLO
};
/** A student's mark on an item: a number (0 counts), or null / undefined = absent (blank). */
export type Marks = Record<string, number | null | undefined>;
export type StudentClo = { cloId: string; status: "CLEARED" | "NOT_CLEARED" | "NOT_ASSESSED"; pct: number | null; level: Level | null; items: number };
const r2 = (x: number) => Math.round(x * 100) / 100;
const share = (it: CItem, cloId: string) => (it.clos.find((c) => c.cloId === cloId)?.pct ?? 0) / 100;
/** Items that count towards a CLO's attainment (not "Not for CLO", not excluded, not faulty). */
export const countsFor = (it: CItem, cloId: string) => !it.notForClo && !it.excluded && !it.faulty && share(it, cloId) > 0;

export function studentClo(s: MethodSettings, items: CItem[], cloId: string, marks: Marks): StudentClo {
  const mine = items.filter((it) => countsFor(it, cloId) && it.maxMarks > 0 && marks[it.id] !== null && marks[it.id] !== undefined);
  if (!mine.length) return { cloId, status: "NOT_ASSESSED", pct: null, level: null, items: 0 };
  const frac = (it: CItem) => Math.max(0, Math.min(1, (marks[it.id] as number) / it.maxMarks));
  let pct: number, cleared: boolean;
  if (s.method === "SUM") {
    const got = mine.reduce((a, it) => a + (marks[it.id] as number) * share(it, cloId), 0), max = mine.reduce((a, it) => a + it.maxMarks * share(it, cloId), 0);
    pct = (100 * got) / max; cleared = pct >= s.passPct - 1e-9;
  } else if (s.method === "ITEMS") {
    const ok = mine.filter((it) => 100 * frac(it) >= s.passPct - 1e-9).length;
    pct = (100 * ok) / mine.length; cleared = pct >= s.itemsPct - 1e-9;
  } else {
    const w = (it: CItem) => (s.method === "WEIGHTS" ? it.weights?.[cloId] ?? 0 : it.gradePct * share(it, cloId));
    const total = mine.reduce((a, it) => a + w(it), 0);
    if (total <= 0) return { cloId, status: "NOT_ASSESSED", pct: null, level: null, items: mine.length };
    pct = (100 * mine.reduce((a, it) => a + w(it) * frac(it), 0)) / total; cleared = pct >= s.passPct - 1e-9;
  }
  pct = r2(pct);
  return { cloId, status: cleared ? "CLEARED" : "NOT_CLEARED", pct, level: levelOf(pct, s.levels), items: mine.length };
}

export type ClassClo = { cloId: string; assessed: number; cleared: number; notAssessed: number; clearedPct: number; achieved: boolean; levels: Record<Level, number>; avgPct: number | null };
/** The class: share of assessed students who cleared the CLO (Not assessed are shown apart and never counted). */
export function classClo(s: MethodSettings, items: CItem[], cloId: string, students: Marks[]): ClassClo {
  const rs = students.map((m) => studentClo(s, items, cloId, m));
  const done = rs.filter((r) => r.status !== "NOT_ASSESSED");
  const cleared = done.filter((r) => r.status === "CLEARED").length;
  const levels: Record<Level, number> = { EXCELLENT: 0, GOOD: 0, SATISFACTORY: 0, NOT_MET: 0 };
  for (const r of done) levels[r.level!]++;
  const clearedPct = done.length ? r2((100 * cleared) / done.length) : 0;
  return { cloId, assessed: done.length, cleared, notAssessed: rs.length - done.length, clearedPct, achieved: done.length > 0 && clearedPct >= s.targetPct - 1e-9, levels, avgPct: done.length ? r2(done.reduce((a, r) => a + (r.pct || 0), 0) / done.length) : null };
}
/** All four methods side by side for one CLO (the comparison before choosing). */
export function compareMethods(s: MethodSettings, items: CItem[], cloId: string, students: Marks[]) {
  return (Object.keys(METHODS) as Method[]).map((m) => ({ method: m, ...classClo({ ...s, method: m }, items, cloId, students) }));
}

/** Class average of an item over the students who sat it (blanks left out). */
export function itemAverage(it: CItem, students: Marks[]) {
  const xs = students.map((m) => m[it.id]).filter((x): x is number => typeof x === "number");
  return xs.length ? r2((100 * xs.reduce((a, b) => a + b, 0)) / (xs.length * it.maxMarks)) : null;
}
/** Items whose class average is below the threshold: "Mid Q2: class average 22% — check the question". */
export function faultyFlags(items: CItem[], students: Marks[], thresholdPct = DEFAULT_SETTINGS.faultyAvgPct) {
  return items.flatMap((it) => { const avg = itemAverage(it, students); return avg !== null && avg < thresholdPct ? [{ itemId: it.id, avg, text: `${it.label}: class average ${Math.round(avg)}% — check the question` }] : []; });
}

// ---- the OMC's limits, under the chosen method
export type Limit = { label: string; types: string[]; minPct: number | null; maxPct: number | null; part?: Part | null };
const nt = (t: string) => t.trim().toLowerCase();
/** Each item type's effective share of a CLO: method 3 from the weights, 4 from grade shares, 1 and 2 from marks. */
export function cloTypeShares(method: Method, items: CItem[], cloId: string) {
  const mine = items.filter((it) => countsFor(it, cloId));
  const w = (it: CItem) => (method === "WEIGHTS" ? it.weights?.[cloId] ?? 0 : method === "GRADE" ? it.gradePct * share(it, cloId) : it.maxMarks * share(it, cloId));
  const total = mine.reduce((a, it) => a + w(it), 0);
  const out: Record<string, number> = {};
  for (const it of mine) out[it.type] = (out[it.type] || 0) + (total ? (100 * w(it)) / total : 0);
  return { total, byType: out, items: mine };
}
const plural = (types: string[]) => types.map((t) => `${t.toLowerCase().replace(/z$/, "zze").replace(/(s|x)$/, "$1e")}s`).join(" + ").replace(/quizzes/g, "quizzes");
export function limitBreaches(method: Method, items: CItem[], clos: { id: string; code: string; part?: Part }[], limits: Limit[]) {
  const out: { cloCode: string; limit: string; value: number; text: string }[] = [];
  for (const c of clos) {
    const sh = cloTypeShares(method, items, c.id);
    if (!sh.total) continue;
    for (const l of limits) {
      if (l.part && c.part && l.part !== c.part) continue;
      const v = Math.round(Object.entries(sh.byType).filter(([t]) => l.types.map(nt).includes(nt(t))).reduce((a, [, x]) => a + x, 0) * 10) / 10;
      const lo = l.minPct !== null && v < l.minPct - 1e-6, hi = l.maxPct !== null && v > l.maxPct + 1e-6;
      if (lo || hi) out.push({ cloCode: c.code, limit: l.label, value: v, text: `${c.code}: ${plural(l.types)} ${l.types.length > 1 ? "are" : "is"} ${v}% (limit ${hi ? `${l.maxPct}%` : `at least ${l.minPct}%`})` });
    }
  }
  return out;
}
/** Method 3: the SE's weights for one CLO must add up to 100 and keep within the limits — else saving is refused, naming the CLO. */
export function checkWeights(items: CItem[], clo: { id: string; code: string; part?: Part }, limits: Limit[]): string | null {
  const total = Math.round(items.filter((it) => countsFor(it, clo.id)).reduce((a, it) => a + (it.weights?.[clo.id] ?? 0), 0) * 100) / 100;
  if (Math.abs(total - 100) > 0.01) return `${clo.code}: weights add up to ${total}, not 100.`;
  const b = limitBreaches("WEIGHTS", items, [clo], limits);
  return b.length ? `${b[0].text}.` : null;
}

// ---- mapping and coverage
export const isQuestionType = (type: string) => /^(mid|final)/i.test(type);
export function mappingIssues(items: CItem[], clos: { id: string; code: string; part: Part }[], o: { hasLab: boolean; notForCloReasons?: Record<string, string | null> }) {
  const blocking: string[] = [], warnings: string[] = [];
  for (const it of items) {
    if (it.notForClo) { if (it.isQuestion) blocking.push(`${it.label} is a mid / final question — it must map to a CLO.`); else if (!(o.notForCloReasons?.[it.id] || "").trim()) blocking.push(`${it.label} is "Not for CLO" without a reason.`); continue; }
    if (!it.clos.length) { (it.isQuestion ? blocking : blocking).push(`${it.label} is not mapped to any CLO.`); continue; }
    const sum = it.clos.reduce((a, c) => a + c.pct, 0);
    if (Math.abs(sum - 100) > 0.01) blocking.push(`${it.label}: its CLO split adds up to ${sum}%, not 100%.`);
    for (const c of it.clos) { const clo = clos.find((x) => x.id === c.cloId); if (clo && clo.part !== it.part) warnings.push(`${it.label} is a ${it.part.toLowerCase()} item mapped to ${clo.part.toLowerCase()} ${clo.code}${clo.part === "LAB" || it.part === "LAB" ? " (shared CLO)" : ""}.`); }
  }
  if (o.hasLab && !clos.some((c) => c.part === "LAB")) blocking.push("This course has a lab but no lab CLO.");
  for (const c of clos) {
    const mine = items.filter((it) => !it.notForClo && it.clos.some((x) => x.cloId === c.id && x.pct > 0));
    if (!mine.length) { blocking.push(`${c.code} is not assessed by any item.`); continue; }
    if (c.part === "THEORY" && !mine.some((it) => it.isQuestion)) blocking.push(`${c.code} has no mid or final question.`);
    if (c.part === "LAB" && !mine.some((it) => it.part === "LAB")) blocking.push(`${c.code} (lab CLO) has no lab item.`);
    if (c.part === "LAB" && mine.some((it) => it.part === "LAB") && !mine.some((it) => it.part === "LAB" && /final/i.test(it.type))) warnings.push(`${c.code} (lab CLO) is not assessed by the lab final.`);
  }
  return { blocking: Array.from(new Set(blocking)), warnings: Array.from(new Set(warnings)) };
}
/** May this item be excluded from attainment? Only if the CLO's remaining items still meet the limits. */
export function canExclude(method: Method, items: CItem[], itemId: string, clos: { id: string; code: string; part?: Part }[], limits: Limit[]) {
  const after = items.map((it) => (it.id === itemId ? { ...it, excluded: true } : it));
  const affected = clos.filter((c) => items.find((i) => i.id === itemId)?.clos.some((x) => x.cloId === c.id));
  for (const c of affected) if (!after.some((it) => countsFor(it, c.id))) return `${c.code} would have no item left.`;
  const b = limitBreaches(method, after, affected, limits);
  return b.length ? b[0].text : null;
}

// ---- lab part of a course
/** An item's share of the course grade = its part's share × its share within the part (lab final 30% of a 20% lab = 6%). */
export const courseGradePct = (partSharePct: number, withinPartPct: number) => r2((partSharePct * withinPartPct) / 100);
/** The separate lab pass rule (off by default): at least X% in the lab part to pass the course. */
export const passesLabRule = (labPartPct: number | null, rule: { on: boolean; minPct: number }) => !rule.on || (labPartPct !== null && labPartPct >= rule.minPct - 1e-9);
export type LabRow = { week: number; labNumber: number; hours: number; title: string; topics: { lectureNumber: number; topic: string }[]; cloId: string | null; tools: string; deliverable: string; labOnly: boolean; kind: "TASK" | "MID" | "FINAL" };
/** A new lab plan: 15 rows, one per teaching week, each a single 3-hour session. */
export const defaultLabRows = (n = 15, hours = 3): LabRow[] => Array.from({ length: n }, (_, i) => ({ week: i + 1, labNumber: i + 1, hours, title: "", topics: [], cloId: null, tools: "", deliverable: "", labOnly: false, kind: i + 1 === 8 ? "MID" : i + 1 === n ? "FINAL" : "TASK" }));
/** Lab rows ahead of the theory they practise: "Lab 5 (Week 5) practises Recursion — taught in L12 (Week 6)". */
export function labAhead(rows: LabRow[], lectures: { lectureNumber: number; week: number; topic: string }[]) {
  const out: { labNumber: number; lectureNumber: number; text: string }[] = [];
  for (const r of rows) for (const t of r.topics) {
    const l = lectures.find((x) => x.topic.trim().toLowerCase() === t.topic.trim().toLowerCase()) || lectures.find((x) => x.lectureNumber === t.lectureNumber);
    if (l && l.week > r.week) out.push({ labNumber: r.labNumber, lectureNumber: l.lectureNumber, text: `Lab ${r.labNumber} (Week ${r.week}) practises ${t.topic} — taught in L${l.lectureNumber} (Week ${l.week})` });
  }
  return out;
}

// ---- early warning on each item's marks
export type WarnSettings = { passPct: number; redPct: number; amberPct: number; respondDays: number; escalateDays: number; marksDays: number; remind1: number; remind2: number; redDay: number; escalateDay: number; lateMode: "STAMP" | "LOCK" };
export const DEFAULT_WARN: WarnSettings = { passPct: 50, redPct: 50, amberPct: 40, respondDays: 3, escalateDays: 3, marksDays: 5, remind1: 4, remind2: 5, redDay: 6, escalateDay: 8, lateMode: "STAMP" };
/** Red when more than redPct of those who sat it are below the pass mark, amber above amberPct. Absent students left out. */
export function warningLevel(scores: (number | null | undefined)[], max: number, w: Pick<WarnSettings, "passPct" | "redPct" | "amberPct">) {
  const sat = scores.filter((x): x is number => typeof x === "number");
  if (!sat.length || max <= 0) return { level: null as "RED" | "AMBER" | null, belowPct: 0, sat: 0, below: 0 };
  const below = sat.filter((x) => (100 * x) / max < w.passPct - 1e-9).length, belowPct = r2((100 * below) / sat.length);
  return { level: belowPct > w.redPct ? ("RED" as const) : belowPct > w.amberPct ? ("AMBER" as const) : null, belowPct, sat: sat.length, below };
}
/** Theory good + lab bad: practice; both bad: teaching; only this item failed: possibly faulty. */
export function diagnose(o: { thisBelowPct: number; otherPartBelowPct: number | null; classOtherItemsBelowPct: number | null; passShare?: number }) {
  if (o.classOtherItemsBelowPct !== null && o.classOtherItemsBelowPct < 25 && o.thisBelowPct >= 80) return { kind: "FAULTY" as const, text: "Possibly a faulty item: the class did well on everything else." };
  if (o.otherPartBelowPct === null) return { kind: "UNKNOWN" as const, text: "No item of the other part on this topic yet." };
  if (o.otherPartBelowPct <= 40) return { kind: "PRACTICE" as const, text: "Practice problem: the other part on this topic went well." };
  return { kind: "TEACHING" as const, text: "Teaching problem: both theory and lab on this topic went badly." };
}
/** Who is told: a lab item → the theory teacher of the linked topic (lab engineer and SE copied); a theory item → teacher and SE. */
export function warningRecipients(o: { part: Part; teacherId: string | null; theoryTeacherId: string | null; labEngineerId: string | null; seId: string | null }) {
  const to = o.part === "LAB" ? [o.theoryTeacherId || o.teacherId] : [o.teacherId];
  const cc = o.part === "LAB" ? [o.labEngineerId, o.seId] : [o.seId];
  return { to: to.filter((x): x is string => !!x), cc: Array.from(new Set(cc.filter((x): x is string => !!x && !to.includes(x)))) };
}
/** Escalation: teacher → SE after respondDays → Program Lead / HOD after escalateDays more. */
export function escalationStage(raisedAt: Date, now: Date, respondedAt: Date | null, w: Pick<WarnSettings, "respondDays" | "escalateDays">) {
  if (respondedAt) return "RESPONDED" as const;
  const days = (now.getTime() - raisedAt.getTime()) / 864e5;
  return days >= w.respondDays + w.escalateDays ? ("HOD" as const) : days >= w.respondDays ? ("SE" as const) : ("TEACHER" as const);
}

// ---- marks within one week (working days)
const DAY = 864e5;
const utc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
/** Working days after the held date, up to and including the day. */
export function workdayNumber(cal: WorkCal, held: Date, day: Date) { let n = 0; for (let t = utc(held).getTime() + DAY; t <= utc(day).getTime(); t += DAY) if (isWorkday(cal, new Date(t))) n++; return n; }
/** Due date: the n-th working day after the item was held. */
export function marksDue(cal: WorkCal, held: Date, days: number) { let t = utc(held).getTime(), left = days; while (left > 0) { t += DAY; if (isWorkday(cal, new Date(t))) left--; } return new Date(t); }
export function marksStatus(cal: WorkCal, held: Date, now: Date, enteredAt: Date | null, w: Pick<WarnSettings, "marksDays" | "remind1" | "remind2" | "redDay" | "escalateDay" | "lateMode">) {
  const due = marksDue(cal, held, w.marksDays);
  if (enteredAt) { const n = workdayNumber(cal, held, enteredAt); return { due, day: n, stage: "DONE" as const, late: n > w.marksDays, remind: false, escalate: false }; }
  const n = workdayNumber(cal, held, now);
  const stage = n >= w.escalateDay ? ("ESCALATED" as const) : n >= w.redDay ? ("OVERDUE" as const) : n >= w.remind1 ? ("REMIND" as const) : ("OPEN" as const);
  const today = isWorkday(cal, utc(now));
  return { due, day: n, stage, late: false, remind: today && (n === w.remind1 || n === w.remind2), escalate: today && n === w.escalateDay, locked: w.lateMode === "LOCK" && n > w.marksDays };
}
/** Program Lead's setting is final; else the department (OMC) default. */
export function resolveSettings<T extends Record<string, unknown>>(dept: T, program: Partial<T> | null | undefined): T { return { ...dept, ...Object.fromEntries(Object.entries(program || {}).filter(([, v]) => v !== null && v !== undefined)) } as T; }

// ---- assessment types
export type TypeDef = { key: string; name: string; family: string; part: "THEORY" | "LAB" | "BOTH"; marking: "MARKS" | "RUBRIC" | "AUTO" | "PASS_FAIL"; group: boolean; defaultNotForClo: boolean; evidence: string; graded: boolean; ccp?: boolean };
const T = (family: string, part: TypeDef["part"], names: string, extra: Partial<TypeDef> = {}): TypeDef[] => names.split("|").map((n) => ({ key: n.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, ""), name: n.trim(), family, part, marking: "MARKS", group: false, defaultNotForClo: false, evidence: "paper", graded: true, ...extra }));
export const SEED_TYPES: TypeDef[] = [
  ...T("Written", "THEORY", "Quiz (announced)|Quiz (surprise)|Online MCQ quiz|Assignment|Problem set|Sessional test|Mid-term|Final|Take-home exam|Open-book exam|Case study|Essay / report|Term paper|Literature review"),
  ...T("Lab and practical", "LAB", "Lab task / submission|Lab report / journal|Lab quiz|Lab assignment|Lab mid|Lab final|Practical exam|Coding test|Simulation exercise"),
  ...T("Lab and practical", "LAB", "Auto-graded programming assignment", { marking: "AUTO", evidence: "repository link" }),
  ...T("Projects", "BOTH", "Course project|Mini project|Prototype / demo|Portfolio / e-portfolio|Repository review|Open-ended design problem", { marking: "RUBRIC", evidence: "report" }),
  ...T("Projects", "BOTH", "Complex Computing / Engineering Problem (CCP / CEP)", { marking: "RUBRIC", evidence: "report", ccp: true }),
  ...T("Oral and communication", "BOTH", "Viva|Presentation|Poster|Demo|Group discussion|Debate", { marking: "RUBRIC", evidence: "video" }),
  ...T("Collaborative", "BOTH", "Group project", { marking: "RUBRIC", group: true, evidence: "report" }),
  ...T("Collaborative", "BOTH", "Peer assessment|Self-assessment", { marking: "RUBRIC" }),
  ...T("Professional", "BOTH", "Internship report|Industry / supervisor evaluation|Field-visit report|Professional certification|Competition / hackathon participation", { evidence: "report" }),
  ...T("FYP / capstone", "THEORY", "FYP proposal|FYP progress review|FYP final report|FYP defence", { marking: "RUBRIC", evidence: "report" }),
  ...T("Continuous and online", "BOTH", "LMS / Moodle quiz|Discussion-forum contribution|Flipped-class activity|Reflective journal|Minute paper"),
  ...T("Continuous and online", "BOTH", "Class participation|Attendance", { defaultNotForClo: true, evidence: "none" }),
  ...T("AI-era", "BOTH", "Assignment with AI-use declaration|Oral defence of submitted work|Proctored online exam|Adaptive test"),
  ...T("Not graded (indirect evidence)", "BOTH", "Course exit survey|CLO self-assessment survey|Alumni / employer survey", { graded: false, defaultNotForClo: true, evidence: "survey", marking: "PASS_FAIL" }),
];
/** A survey type never counts in CLO marks. */
export const countsInCloMarks = (t: Pick<TypeDef, "graded">) => t.graded;
/** Rubric: each criterion maps to its own CLO — the item becomes one split per criterion's CLO by its marks. */
export function rubricSplit(criteria: { cloId: string; max: number }[]) {
  const total = criteria.reduce((a, c) => a + c.max, 0), by: Record<string, number> = {};
  for (const c of criteria) by[c.cloId] = (by[c.cloId] || 0) + (total ? (100 * c.max) / total : 0);
  return Object.entries(by).map(([cloId, pct]) => ({ cloId, pct: r2(pct) }));
}
/** Group mark adjusted per member by peer assessment (member's peer score ÷ the group's mean), capped at the maximum. */
export function peerAdjusted(groupMark: number, max: number, peer: Record<string, number>) {
  const vals = Object.values(peer), mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return Object.fromEntries(Object.entries(peer).map(([id, p]) => [id, r2(Math.min(max, mean ? (groupMark * p) / mean : groupMark))]));
}
/** Blank stays blank: "", "A", "Abs", "Absent" → absent (null); "0" → 0; numbers → numbers; anything else → error. */
export function parseMarkCell(v: unknown): { ok: true; value: number | null } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v === "number") return Number.isFinite(v) ? { ok: true, value: v } : { ok: false };
  const s = String(v).trim();
  if (!s || /^(a|abs|absent|-)$/i.test(s)) return { ok: true, value: null };
  const n = Number(s);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
}
/** The term's locked method wins unless the OMC explicitly recalculated that term. */
export function methodForTerm<T>(locked: { settings: T; recalculated?: T | null } | null, current: T): T { return locked ? locked.recalculated || locked.settings : current; }
