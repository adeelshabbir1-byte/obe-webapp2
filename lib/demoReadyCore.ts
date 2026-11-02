// "Make demo ready": the parts with no database — the one-click demo logins (who each role is and what they do daily),
// the ordered build plan the Super Admin's button runs step by step, and realistic sample marks.

export type DemoRole = { key: string; label: string; daily: string; username?: string; student?: boolean };

/** One login per role, each labelled with what that person does on a normal day. */
export const DEMO_ROLES: DemoRole[] = [
  { key: "dean", label: "Dean", daily: "Looks over the faculty's programs, results and visit readiness", username: "dream.dean" },
  { key: "hod", label: "Head of Department", daily: "Approves course results; signs off the department's plans", username: "dream.hod.cs" },
  { key: "lead", label: "Program Lead", daily: "Runs the BS CS batches: offerings, teachers and GA attainment", username: "dream.lead.cs" },
  { key: "dc", label: "Department Coordinator", daily: "Sections, rooms and the timetable", username: "dream.dc" },
  { key: "omcConvener", label: "OMC Convener", daily: "Confirms the OMC's votes on plans and finalises them", username: "dream.omc" },
  { key: "omc", label: "OMC member", daily: "Votes on Subject Experts' plans; reviews weak CLOs and faulty questions", username: "dream.omc2" },
  { key: "bos", label: "BOS Convener", daily: "Chairs the Board of Studies: course homes and codes", username: "dream.bos" },
  { key: "se", label: "Subject Expert", daily: "Writes the course plan: CLOs, lectures, assessments, exam questions", username: "dream.se" },
  { key: "instructor", label: "Instructor", daily: "Teaches, marks attendance and enters marks", username: "dream.instructor" },
  { key: "labeng", label: "Lab Engineer", daily: "Runs lab sessions and enters lab marks", username: "dream.labeng" },
  { key: "controller", label: "Controller of Examinations", daily: "Publishes approved results", username: "dream.controller" },
  { key: "qec", label: "QEC", daily: "Quality office: SAR, surveys and reviews", username: "dream.qec" },
  { key: "affiliation", label: "Affiliation office", daily: "Runs affiliated colleges: applications, visits, centres, examiners, notices", username: "dream.affiliation" },
  { key: "treasurer", label: "Treasurer", daily: "Approves and pays examiner claims; college fees", username: "dream.treasurer" },
  { key: "college", label: "Affiliated college head", daily: "Dream College Sahiwal: applications, faculty approvals, notices from the university", username: "dream.college" },
  { key: "student", label: "Student", daily: "Sees attendance, marks, results and transcript", student: true },
];
export const roleByKey = (k: string) => DEMO_ROLES.find((r) => r.key === k) || null;

/** The programs of the demo and the batches each one has running now (S1, S3, S5, S7 in Fall 2026). */
export const PROGRAMS = [
  { p: "CS", lead: "dream.lead.cs", code: "BSCS", name: "BS Computer Science", roll: "CS" },
  { p: "AI", lead: "dream.lead.ai", code: "BSAI", name: "BS Artificial Intelligence", roll: "AI" },
  { p: "BBA", lead: "dream.lead.bba", code: "BBA", name: "BBA (Hons)", roll: "BB" },
] as const;
export type Prog = (typeof PROGRAMS)[number]["p"];
/** Start years of the batches beyond the first one (Fall 2024, semester 5): S1, S3 and S7. */
export const EXTRA_STARTS = [2026, 2025, 2023];
export const ALL_STARTS = [2024, ...EXTRA_STARTS];
export const STUDENTS_PER_BATCH = 120;
export const CAMPUS_PARTS = ["content", "people", "students", "accreditation", "surveys", "activity", "fixes", "governance", "nceac", "complex", "ugpolicy", "hemis", "coursefiles", "labs", "moderation", "registers", "approvals", "dashboard", "signoff", "support", "library", "assets", "recruitment", "research", "billing", "quality", "campusfees"];

const tIdx = (t: string, y: number) => y * 2 + (t === "Fall" ? 1 : 0);
/** Semester running in Fall 2026 for a batch that started in Fall of this year. */
export const semNow = (startYear: number) => tIdx("Fall", 2026) - tIdx("Fall", startYear) + 1;

export type Step = { key: string; label: string; p?: Prog; start?: number; sem?: number; part?: string };

/** Every step of "Make demo ready", in order. Each one is one HTTP call that fits the Vercel time limit. */
/** The newest features' demo data (lib/demoNewer.ts), also runnable on their own from the demo page. */
export const NEWER: [string, string][] = [["people", "Affiliation office, Treasurer, an affiliated college, affiliation jobs, exam team"], ["allocation", "Year allocation plan: drafted, submitted, approved"], ["committees", "BOS members with roles, terms, Secretary and composition rule"], ["affiliation", "A year of affiliation work with Dream College Sahiwal"], ["collab", "A joint degree and a blended ODL course, each with its lead"], ["college", "Dream College: a BS CS batch with students, courses, marks, registration numbers and OBE records"]];
export function readyPlan(): Step[] {
  const s: Step[] = [{ key: "delete", label: "Removing the old demo institute" }, { key: "setup", label: "Institute, people, BS CS and BS AI, 120 students a batch" }];
  const batchSteps = (p: Prog, start: number) => {
    for (let sem = 1; sem <= 8; sem++) s.push({ key: "courses", p, start, sem, label: `${p} ${start}: courses of semester ${sem}` });
    for (let sem = 1; sem <= semNow(start); sem++) s.push({ key: "activity", p, start, sem, label: `${p} ${start}: ${sem < semNow(start) ? `marks and results, semester ${sem}` : `semester ${sem} under way`}` });
  };
  batchSteps("CS", 2024); batchSteps("AI", 2024);
  s.push({ key: "finish", label: "Outcome weights and CQI notes" }, { key: "business", label: "Business school (BBA, NBEAC)" });
  batchSteps("BBA", 2024);
  s.push({ key: "finishBatch", p: "BBA", start: 2024, label: "BBA outcome weights" });
  for (const part of CAMPUS_PARTS) s.push({ key: "campus", part, label: `Campus and accreditation data: ${part}` });
  s.push({ key: "people", label: "Organisation chart: OMC, BOS, Controller, QEC, coordinators, faculty types" });
  for (const p of PROGRAMS) for (const start of EXTRA_STARTS) {
    s.push({ key: "addBatch", p: p.p, start, label: `${p.code} Fall ${start}: batch and students` });
    batchSteps(p.p, start);
    s.push({ key: "finishBatch", p: p.p, start, label: `${p.code} Fall ${start}: outcome weights` });
  }
  s.push({ key: "bos", label: "Course homes and codes approved by the BOS (meeting and minutes)" });
  s.push({ key: "plans", label: "Subject Experts' plans approved by OMC votes" }, { key: "batchApproval", label: "OMC batch approvals" }, { key: "method", label: "Attainment method 4 and the OMC's limits" });
  s.push({ key: "pickDemo", label: "Choosing the demo course" });
  for (const p of PROGRAMS) for (const start of ALL_STARTS) s.push({ key: "endTerm", p: p.p, start, label: `${p.code} Fall ${start}: end of teaching — lectures, attendance, marks` });
  for (const p of PROGRAMS) for (const start of ALL_STARTS) s.push({ key: "approve", p: p.p, start, label: `${p.code} Fall ${start}: results approved and published` });
  s.push({ key: "warning", label: "An early warning on a lab topic with a CQI tutorial" }, { key: "faulty", label: "A faulty question excluded by the OMC" });
  for (const p of PROGRAMS) for (const start of ALL_STARTS) s.push({ key: "history", p: p.p, start, label: `${p.code} Fall ${start}: topic performance and GA history` });
  s.push({ key: "samples", label: "Best, average and weakest samples (PDF)" });
  for (const p of ["CS", "AI"] as const) s.push({ key: "polish", p, start: 2024, label: `${p === "CS" ? "BS CS" : "BS AI"}: faculty records and loads, lab plan, activities, evidence, course folders` });
  s.push({ key: "facilities", label: "Rooms and lab computers for 960 computing students" });
  for (const [part, label] of NEWER) s.push({ key: "newer", part, label });
  s.push({ key: "check", label: "Checking readiness" });
  return s;
}

// Deterministic randomness, so a rebuild (and "Fill sample marks") gives the same marks.
export function rng(seed: string) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const normal = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** A student's ability (same as the demo's history uses), 0.3 … 0.97. */
export const ability = (rollNumber: string) => { const r = rng(`ability-${rollNumber}`); return clamp(0.7 + 0.13 * normal(r), 0.3, 0.97); };
/** A realistic mark out of max for this student on this item, to the half mark. Finals run a little lower. */
export function sampleScore(rollNumber: string, itemKey: string, max: number, type: string) {
  const r = rng(`mark-${rollNumber}-${itemKey}`);
  const f = clamp(ability(rollNumber) + (type === "Final" ? -0.05 : type === "Quiz" ? 0.04 : 0) + 0.09 * normal(r), 0.12, 1);
  return Math.round(f * max * 2) / 2;
}

/** The running term for the live demo: teaching ended about two weeks ago, the final exam was two days ago. */
export function termDates(now: Date) {
  const day = 864e5;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 17 * 7 * day);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return {
    lecture: (n: number, week: number) => new Date(monday.getTime() + ((week - 1) * 7 + (n % 2 === 0 ? 2 : 0)) * day),
    finalHeld: new Date(now.getTime() - 2 * day),
  };
}
