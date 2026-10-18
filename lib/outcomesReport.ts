import { prisma } from "./db";
import { cohortIndirect } from "./indirectPlo";
import { pdb } from "./portfolio";

/** Report formats: the same cohort evidence laid out in each council's vocabulary. */
export const FORMATS: Record<string, { name: string; outcome: string; outcomes: string[]; courseReport: string; sections: string[] }> = {
  NCEAC: { name: "NCEAC (computing)", outcome: "Graduate Attribute / GA", courseReport: "Course Assessment Report", sections: ["Criterion 1 — Program mission and objectives", "Criterion 1 — Graduate attributes (GA) assessment", "Criterion 2 — Curriculum: course CLO results", "Criterion 1 — Continuous quality improvement"],
    outcomes: ["Academic Education", "Knowledge for Solving Computing Problems", "Problem Analysis", "Design/Development of Solutions", "Modern Tool Usage", "Individual and Teamwork", "Communication", "Computing Professionalism and Society", "Ethics", "Life-long Learning"] },
  PEC: { name: "PEC (engineering, Washington Accord)", outcome: "Graduate Attribute (GA)", courseReport: "Course Learning Outcome Assessment", sections: ["Criterion 2 — Program Educational Objectives", "Criterion 3 — Graduate Attributes attainment", "Criterion 4 — Curriculum: course CLO results", "Criterion 3 — Continuous quality improvement"],
    outcomes: ["Engineering Knowledge", "Problem Analysis", "Design/Development of Solutions", "Investigation", "Modern Tool Usage", "The Engineer and Society", "Environment and Sustainability", "Ethics", "Individual and Team Work", "Communication", "Project Management", "Lifelong Learning"] },
  ABET: { name: "ABET", outcome: "Student Outcome (SO)", courseReport: "Faculty Course Assessment Report (FCAR)", sections: ["Criterion 2 — Program Educational Objectives", "Criterion 3 — Student Outcomes", "Course-level evidence (FCAR summaries)", "Criterion 4 — Continuous Improvement"],
    outcomes: ["Complex problem solving", "Design to meet needs", "Effective communication", "Ethical and professional responsibility", "Effective teamwork", "Experimentation and analysis", "Acquire and apply new knowledge"] },
  NBEAC: { name: "NBEAC (business)", outcome: "Learning Goal / GA", courseReport: "Assurance of Learning — course results", sections: ["Form 2 — Program objectives and learning goals", "Assurance of Learning — goal attainment", "Assurance of Learning — course results", "Closing the loop"], outcomes: [] },
  HEC: { name: "HEC QA (self-assessment)", outcome: "Graduate Attribute", courseReport: "Course evaluation", sections: ["Criterion 1 — Program mission and objectives", "Criterion 1 — Program learning outcomes", "Criterion 2 — Curriculum: course results", "Criterion 3 — Assessment and improvement"], outcomes: [] },
};

/** Everything an outcomes report needs for one cohort. */
export async function outcomesData(batchId: string) {
  const ind = await cohortIndirect(batchId);
  if (!ind) return null;
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, degreeProgram: true, batchName: true, coordinatorId: true, coordinator: { select: { name: true, managedById: true } } } });
  const profile = await prisma.programProfile.findFirst({ where: { coordinatorId: batch!.coordinatorId, degreeProgram: batch!.degreeProgram }, select: { peos: true, departmentMission: true } }).catch(() => null);
  let peos: string[] = []; try { peos = profile?.peos ? JSON.parse(profile.peos) : []; } catch { peos = profile?.peos ? [profile.peos] : []; }
  // Course-level CLO results from finalised transcript records.
  const recs = await prisma.studentTranscriptRecord.findMany({ where: { student: { batchId } }, select: { courseCode: true, courseTitle: true, termName: true, termYear: true, grade: true, cloAttainmentJson: true } });
  const courses = new Map<string, { code: string; title: string; term: string; n: number; fails: number; clos: Map<string, [number, number]> }>();
  for (const r of recs) {
    const c = courses.get(r.courseCode) || { code: r.courseCode, title: r.courseTitle, term: `${r.termName} ${r.termYear}`, n: 0, fails: 0, clos: new Map() };
    c.n++; if (r.grade === "F") c.fails++;
    let cl: { code: string; passed?: boolean }[] = []; try { cl = JSON.parse(r.cloAttainmentJson); } catch { cl = []; }
    for (const x of cl) { const v = c.clos.get(x.code) || [0, 0]; v[0] += x.passed ? 1 : 0; v[1]++; c.clos.set(x.code, v); }
    courses.set(r.courseCode, c);
  }
  const courseRows = Array.from(courses.values()).sort((a, b) => a.code.localeCompare(b.code)).map((c) => ({ ...c, clos: Array.from(c.clos.entries()).sort().map(([code, [h, n]]) => ({ code, pct: Math.round((1000 * h) / n) / 10, n })) }));
  const cqi = await prisma.cqiRecord.findMany({ where: { batchId }, orderBy: { createdAt: "asc" }, select: { sourceReference: true, finding: true, actionTaken: true, status: true, metricBefore: true, metricAfter: true, createdAt: true } });
  const courseIds = (await prisma.course.findMany({ where: { batchId }, select: { id: true } })).map((c) => c.id);
  const samples = ((await pdb.studentWorkSample.count({ where: { courseId: { in: courseIds } } }).catch(() => 0)) as number);
  const verified = ((await pdb.studentPortfolioItem.count({ where: { verifiedAt: { not: null }, studentId: { in: (await prisma.student.findMany({ where: { batchId }, select: { id: true } })).map((s) => s.id) } } }).catch(() => 0)) as number);
  return { batch: batch!, peos, mission: profile?.departmentMission || "", plo: ind, courses: courseRows, cqi, samples, verified };
}

export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map((c) => { const s = c === null || c === undefined ? "" : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");
}
