// Pilot figures (pure): work recorded in OBEHUB grouped into areas, and the time the institute itself says each task
// took before and takes now. OBEHUB counts the work; the minutes are the institute's own estimates, never ours.
export type Area = { key: string; label: string; task: string; re: RegExp };
export const AREAS: Area[] = [
  { key: "curriculum", label: "Curriculum & committees", task: "a curriculum, course or committee change", re: /^(MASTER_|CURRICULUM_|COMMITTEE_|HEC_|NATIONAL_|OFFICIAL_|GAS_LOADED|BULK_HEC|EQUIVALENCE_)/ },
  { key: "planning", label: "Course planning (CLOs, lecture plans, mapping)", task: "a CLO, lecture-plan or mapping change", re: /^(CLO_|CLOS_|INSTRUCTOR_CLO|LECTURE|INSTRUCTOR_LECTURE|INSTRUCTOR_PLAN|PLAN_|COURSE_PLAN|TOPIC_|COURSE_CONTENT_IMPORTED|COURSE_PREREQUISITE)/ },
  { key: "assessment", label: "Assessments & papers", task: "an assessment or paper action", re: /^(INSTRUMENT|INSTRUCTOR_INSTRUMENT|EXAM_DRAFT|PAPER_|QBANK|QB_|EXAM_BLUEPRINT|EXAM_QUESTION)/ },
  { key: "marks", label: "Marks & results", task: "a marks or result action", re: /^(MARK_|MARKS_|LAB_MARKS|RESULTS?_|GRADE_|AFFILIATE_UNIVERSITY_MARKS|HISTORICAL_GRADE)/ },
  { key: "allocation", label: "Allocation, timetable & exams", task: "an allocation, timetable or exam-schedule action", re: /^(ALLOCATION|AUTO_ALLOCATION|INSTRUCTOR_ASSIGNED|TIMETABLE|COURSE_LEAD|SUBSTITUT|RESCHEDUL|EXAM_DATE|EXAM_SESSION|EXAM_CENTRE|EXAM_PUBLISHED|EXTERNAL_EXAMINER)/ },
  { key: "cqi", label: "CQI actions", task: "a CQI record or remedy", re: /^(CQI_|REMED|FEEDFORWARD)/ },
  { key: "accreditation", label: "Accreditation files & reports", task: "a report, course file or accreditation document", re: /^(ACCREDITATION_|EVIDENCE|NCEAC_|COURSE_FILES|SAR_|HEMIS_EXPORTED|DASHBOARD_EXPORTED|INSTITUTE_DATA_EXPORTED)/ },
  { key: "colleges", label: "Affiliated colleges", task: "an affiliation or college-result action", re: /^(AFF_|AFFILIAT)/ },
];
export const areaOf = (action: string) => AREAS.find((a) => a.re.test(action))?.key || null;

export type Minutes = Record<string, { before?: number; now?: number }>;
export type Row = { key: string; label: string; task: string; count: number; before: number | null; now: number | null; hoursSaved: number | null };

/** counts: audit action → how many times. minutes: per area, the institute's before / now minutes per task. */
export function summarise(counts: Record<string, number>, minutes: Minutes) {
  const by: Record<string, number> = {};
  for (const [action, n] of Object.entries(counts)) { const k = areaOf(action); if (k) by[k] = (by[k] || 0) + n; }
  const rows: Row[] = AREAS.map((a) => {
    const m = minutes[a.key] || {};
    const before = Number.isFinite(m.before) && (m.before as number) >= 0 ? (m.before as number) : null;
    const now = Number.isFinite(m.now) && (m.now as number) >= 0 ? (m.now as number) : null;
    const count = by[a.key] || 0;
    return { key: a.key, label: a.label, task: a.task, count, before, now, hoursSaved: before !== null && now !== null ? Math.round((count * (before - now)) / 6) / 10 : null };
  });
  const entered = rows.filter((r) => r.hoursSaved !== null);
  return { rows, total: rows.reduce((t, r) => t + r.count, 0), hoursSaved: entered.length ? Math.round(entered.reduce((t, r) => t + (r.hoursSaved as number), 0) * 10) / 10 : null, entered: entered.length };
}

/** Cleans what the form sends: numbers 0–6000 minutes, only known areas. */
export function cleanMinutes(raw: unknown): Minutes {
  const out: Minutes = {};
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, { before?: unknown; now?: unknown }>;
  for (const a of AREAS) {
    const v = src[a.key] || {};
    const f = (x: unknown) => { if (x === "" || x === null || x === undefined) return undefined; const n = Number(x); return Number.isFinite(n) && n >= 0 && n <= 6000 ? n : undefined; };
    const b = f(v.before), n = f(v.now);
    if (b !== undefined || n !== undefined) out[a.key] = { ...(b !== undefined ? { before: b } : {}), ...(n !== undefined ? { now: n } : {}) };
  }
  return out;
}
