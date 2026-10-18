import { isModuleOn } from "./moduleLocks";
import { headers } from "next/headers";
import { prisma } from "./db";
import { LESSONS, type Q } from "./obeLessons";
import { chairmanIdFor } from "./reportScope";

export const tdb = prisma as unknown as Record<string, any>;
export const PASS_PCT = 80, EXAM_MIN = 25, RETAKE_MIN = 60;

const DESIGNER: Q[] = [
  { prompt: "Which CLO is written correctly?", options: ["Students will understand sorting", "Apply divide-and-conquer to design a sorting algorithm for a given data set (C3)", "Know about databases", "Learn Java"], answer: 1, why: "A CLO uses one measurable verb at a stated Bloom level, on a specific task." },
  { prompt: "How many CLOs does a typical 3-credit course have?", options: ["1", "3 to 5", "12 to 15", "One per lecture"], answer: 1, why: "Three to five CLOs keep assessment manageable and meaningful." },
  { prompt: "A CLO at C4 (analyse) should be assessed by…", options: ["A recall MCQ", "A question that asks students to break down and compare, e.g. analyse two algorithms' complexity", "Attendance", "A C1 definition question"], answer: 1, why: "Assess at or above the CLO's own level." },
  { prompt: "In the lecture plan, each topic is tagged to a CLO so that…", options: ["The timetable works", "Questions set on that topic count towards that CLO automatically", "Students can skip it", "The HEC can see attendance"], answer: 1, why: "Topic → CLO tagging is how marks flow to CLOs." },
  { prompt: "Assessment weights (quiz, assignment, mid, final) must…", options: ["Total 100% and follow the OMC weight policy", "Be equal", "Total 120%", "Be decided by students"], answer: 0, why: "The weight policy sets the ranges; totals must be 100%." },
  { prompt: "A project measures CLO-3 and CLO-4. In this system you should…", options: ["Leave it unmapped", "Split it across the two CLOs (direct mapping with a share each)", "Map it to the midterm", "Map it to every CLO"], answer: 1, why: "Projects and labs map directly to one or more CLOs, split by share." },
  { prompt: "Every CLO must be mapped to…", options: ["A GA", "A room", "A textbook chapter only", "Nothing"], answer: 0, why: "CLO → GA mapping is how courses build graduate attributes." },
  { prompt: "If a CLO has no assessment at all…", options: ["It is fine", "It can never be attained; add questions or tasks for it", "It counts as 100%", "It is removed automatically"], answer: 1, why: "Every CLO needs evidence." },
  { prompt: "A good paper for a C3 CLO mostly contains…", options: ["Definitions", "Application problems the student has not seen before", "True/false only", "Copy of the slides"], answer: 1, why: "C3 = apply knowledge to new situations." },
  { prompt: "Why does a course plan go to OMC / the Program Lead for approval?", options: ["To check it against policy and the program's GA coverage", "For decoration", "To print it", "To change student grades"], answer: 0, why: "Review keeps CLOs, weights and GA coverage consistent across the program." },
];
const ASSESSOR: Q[] = [
  { prompt: "GA attainment for a cohort is best reported as…", options: ["The average of final exam marks", "The share of students who reached the GA threshold, compared with the target", "Attendance %", "Number of courses"], answer: 1, why: "Attainment = how many students achieved the outcome, against a target." },
  { prompt: "Indirect assessment means…", options: ["Marks from exams", "Evidence from surveys and opinions (exit, alumni, employer)", "Guessing", "Attendance"], answer: 1, why: "Indirect evidence comes from perceptions, not graded work." },
  { prompt: "Marks show GA-5 at 85% but employers rate it 40%. You should…", options: ["Ignore employers", "Investigate: assessments may be too easy or not authentic; record a CQI action", "Delete the survey", "Lower the target"], answer: 1, why: "A large gap between direct and indirect evidence is a finding." },
  { prompt: "PEOs are assessed mainly through…", options: ["First-semester quizzes", "Alumni and employer feedback a few years after graduation", "Lab attendance", "Midterms"], answer: 1, why: "PEOs describe career accomplishments after graduation." },
  { prompt: "Closing the loop means…", options: ["Locking results", "Using assessment findings to change teaching or curriculum, then checking the effect", "Ending the semester", "Archiving files"], answer: 1, why: "CQI = act on evidence and measure the effect." },
  { prompt: "A valid CQI record contains…", options: ["Only a complaint", "The finding, the action, who does it, and the metric before and after", "A student's name", "Nothing"], answer: 1, why: "Accreditors look for measured improvement." },
  { prompt: "Work samples kept for accreditation are…", options: ["Only the best scripts", "Best, average and weakest scripts of each assessment", "Random photos", "Attendance sheets"], answer: 1, why: "Panels check the range of performance." },
  { prompt: "If a GA is covered by only one course, the risk is…", options: ["None", "Weak evidence: one bad semester fails the GA; spread coverage across courses", "Too many marks", "Timetable clashes"], answer: 1, why: "Each GA should be built and assessed in several courses." },
  { prompt: "Complex computing / engineering problems must be…", options: ["Optional", "Identified in courses and assessed so every graduate faces them", "Avoided", "Only in the first year"], answer: 1, why: "Seoul and Washington Accords require them." },
  { prompt: "The direct GA figure in this system comes from…", options: ["Surveys", "Every finalised course result whose CLOs map to that GA", "The Program Lead's opinion", "Admissions"], answer: 1, why: "Finalised results carry each student's GA attainment." },
];
export const BADGES: { key: string; name: string; for: string; roles: string[]; pool: () => { id: string; q: Q }[]; count: number }[] = [
  { key: "BASICS", name: "OBE Basics", for: "Required for Instructors", roles: ["INSTRUCTOR", "LAB_ENGINEER"], count: 15, pool: () => LESSONS.flatMap((l, li) => l.quiz.map((q, qi) => ({ id: `L:${li}:${qi}`, q }))) },
  { key: "DESIGNER", name: "Course Designer", for: "Required for Subject Experts", roles: ["SUBJECT_EXPERT"], count: 20, pool: () => [...LESSONS.flatMap((l, li) => l.quiz.map((q, qi) => ({ id: `L:${li}:${qi}`, q }))), ...DESIGNER.map((q, i) => ({ id: `D:${i}`, q }))] },
  { key: "ASSESSOR", name: "Program Assessor", for: "For Program Leads and OMC", roles: ["PROGRAM_COORDINATOR", "OMC", "DEPARTMENT_COORDINATOR"], count: 20, pool: () => [...[1, 2, 4].flatMap((li) => LESSONS[li]?.quiz.map((q, qi) => ({ id: `L:${li}:${qi}`, q })) || []), ...ASSESSOR.map((q, i) => ({ id: `A:${i}`, q }))] },
];
export function questionById(id: string): Q | null {
  const [k, a, b] = id.split(":");
  if (k === "L") return LESSONS[+a]?.quiz[+b] || null;
  if (k === "D") return DESIGNER[+a] || null;
  if (k === "A") return ASSESSOR[+a] || null;
  return null;
}
export const badgeOf = (k: string) => BADGES.find((b) => b.key === k) || null;

export async function badgesOf(userIds: string[]) {
  const rows = (await tdb.trainingAttempt.findMany({ where: { userId: { in: userIds }, passed: true }, select: { id: true, userId: true, badge: true, submittedAt: true, score: true, total: true } }).catch(() => [])) as { id: string; userId: string; badge: string; submittedAt: Date; score: number; total: number }[];
  const m = new Map<string, Map<string, (typeof rows)[number]>>();
  for (const r of rows) { const x = m.get(r.userId) || new Map(); if (!x.has(r.badge)) x.set(r.badge, r); m.set(r.userId, x); }
  return m;
}

export async function policyOf(chairmanId: string) {
  return (await tdb.trainingPolicy.findUnique({ where: { chairmanId } }).catch(() => null)) as { enabled: boolean; graceUntil: Date | null; exemptJson: string } | null;
}

/** Why this person may not change curriculum yet, or null. SE: every change; Instructor: CLO, weights, assessments, plan, paper. */
export async function trainingBlock(user: { id: string; role: string; managedById: string | null }): Promise<string | null> {
  const badge = user.role === "SUBJECT_EXPERT" ? "DESIGNER" : user.role === "INSTRUCTOR" ? "BASICS" : null;
  if (!badge) return null;
  const cid = await chairmanIdFor(user).catch(() => "");
  // No training gate for institutes that have not bought the training module.
  if (cid && !(await isModuleOn(cid, "training"))) return null;
  const p = cid ? await policyOf(cid) : null;
  if (!p?.enabled || (p.graceUntil && p.graceUntil > new Date())) return null;
  let ex: string[] = []; try { ex = JSON.parse(p.exemptJson); } catch { ex = []; }
  if (ex.includes(user.id)) return null;
  const has = (await tdb.trainingAttempt.count({ where: { userId: user.id, badge, passed: true } }).catch(() => 1)) as number;
  return has ? null : `Pass the ${badgeOf(badge)!.name} certification (Learn OBE → Certification) before changing course design.`;
}

/** Used by the course guards: on a change request (not GET) to a curriculum route, apply the training rule. */
export async function blockedForCurriculum(user: { id: string; role: string; managedById?: string | null }) {
  let method = "GET", path = "";
  try { method = headers().get("x-method") || "GET"; path = headers().get("x-pathname") || ""; } catch { return false; }
  if (method === "GET") return false;
  if (user.role === "INSTRUCTOR" && !/\/(clo|weights|instruments|lecture|lecture-mapping|paper-distribution)(\/|$)/.test(path)) return false;
  return !!(await trainingBlock({ id: user.id, role: user.role, managedById: user.managedById ?? null }));
}
