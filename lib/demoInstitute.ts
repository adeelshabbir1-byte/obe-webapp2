import { randomUUID } from "crypto";
import { prisma } from "./db";
import { hashPassword } from "./auth";
import { termIndex } from "./termLogic";
import { courseFamily, suggestedWeights } from "./ploWeightMath";
import { recomputeCourseRows } from "./lectureWeights";

// "My Dream Institute": a demo copy of a real institute for presentations. Two batches (BS CS, BS AI) in their 5th
// semester in Fall 2026, curriculum copied from the real institute, fake people, semesters 1-4 completed with approved
// results and transcripts, semester 5 in progress (lectures to week 8, attendance, quizzes/assignments/midterm marked).
// Built in small steps (each one HTTP call) so nothing times out; removed with a generic sweep of everything it owns.

const db = prisma as unknown as Record<string, any>;
export const DEMO_HEAD = "dream.head";
export const DEMO_PASSWORD = "Dream@2026";
export const DEMO_NAME = "My Dream Institute (DEMO)";
const TERMS = [["Fall", 2024], ["Spring", 2025], ["Fall", 2025], ["Spring", 2026], ["Fall", 2026]] as const; // semesters 1..5
const CURRENT = 5;
const FIRST = ["Ali", "Sara", "Hamza", "Ayesha", "Bilal", "Zainab", "Usman", "Hira", "Fahad", "Maryam", "Saad", "Iqra", "Omar", "Noor", "Taha", "Amna", "Danish", "Fatima", "Hassan", "Laiba", "Zain", "Areeba", "Talha", "Mahnoor", "Asad", "Rabia", "Shayan", "Kinza", "Ahmed", "Eman", "Rayan", "Sana"];
const LAST = ["Khan", "Ahmed", "Raza", "Malik", "Shah", "Iqbal", "Butt", "Qureshi", "Javed", "Riaz", "Aslam", "Siddiqui", "Mirza", "Haider", "Anwar", "Nadeem"];
const GRADES: [string, number, number][] = [["A", 85, 4], ["A-", 80, 3.67], ["B+", 75, 3.33], ["B", 71, 3], ["B-", 68, 2.67], ["C+", 64, 2.33], ["C", 61, 2], ["C-", 58, 1.67], ["D+", 54, 1.33], ["D", 50, 1], ["F", 0, 0]];

// Deterministic randomness, so a rebuild looks the same.
function rng(seed: string) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const normal = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export async function demoHead() {
  return prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true, name: true, createdAt: true } });
}

async function demoScope() {
  const head = await demoHead();
  if (!head) return null;
  const leads = await prisma.user.findMany({ where: { managedById: head.id, role: "PROGRAM_COORDINATOR" as never }, select: { id: true, name: true } });
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: leads.map((l) => l.id) } }, select: { id: true, degreeProgram: true, batchName: true, coordinatorId: true } });
  return { head, leads, batches };
}

export async function demoSummary() {
  const s = await demoScope();
  if (!s) return null;
  const [courses, students, marks, transcripts] = await Promise.all([
    prisma.course.count({ where: { batchId: { in: s.batches.map((b) => b.id) } } }),
    prisma.student.count({ where: { batchId: { in: s.batches.map((b) => b.id) } } }),
    prisma.studentMark.count({ where: { course: { batchId: { in: s.batches.map((b) => b.id) } } } }),
    prisma.studentTranscriptRecord.count({ where: { student: { batchId: { in: s.batches.map((b) => b.id) } } } }),
  ]);
  return { createdAt: s.head.createdAt, batches: s.batches.map((b) => `${b.degreeProgram} — ${b.batchName}`), courses, students, marks, transcripts };
}

/** Step 1: the institute, its people, two programs and batches, PLOs/PEOs, grading scale, current term and students. */
export async function setupDemo(superUserId: string, sources: { sourceBatchId: string; short: "CS" | "AI" }[]) {
  if (await demoHead()) throw new Error("The demo institute already exists. Delete it first.");
  const hash = await hashPassword(DEMO_PASSWORD);
  const mk = (username: string, name: string, role: string, extra: Record<string, unknown> = {}) => ({ id: randomUUID(), username, email: `${username}@dreaminstitute.demo`, passwordHash: hash, name, role, mustChangePassword: false, ...extra });
  const head = mk(DEMO_HEAD, "Prof. Kamran Aziz", "CHAIRMAN", { managedById: superUserId, instituteName: DEMO_NAME });
  await prisma.user.create({ data: head as never });
  const dept = await prisma.department.create({ data: { chairmanId: head.id, name: "Department of Computing" } as never });
  const people = [
    mk("dream.omc", "Dr. Nida Farooq", "OMC", { managedById: head.id, departmentId: dept.id }),
    mk("dream.assigner", "Mr. Junaid Akram", "COURSE_ASSIGNER", { managedById: head.id, departmentId: dept.id }),
  ];
  await prisma.user.createMany({ data: people as never });
  const out: { demoBatchId: string; sourceBatchId: string; leadId: string; teacherIds: string[] }[] = [];
  let t = 0;
  for (const src of sources) {
    const sb = await prisma.batch.findUnique({ where: { id: src.sourceBatchId }, select: { degreeProgram: true, coordinatorId: true } });
    if (!sb) throw new Error("Source batch not found.");
    const prog = src.short === "CS" ? { name: "BS Computer Science", code: "BSCS" } : { name: "BS Artificial Intelligence", code: "BSAI" };
    const lead = mk(`dream.lead.${src.short.toLowerCase()}`, src.short === "CS" ? "Dr. Imran Saeed" : "Dr. Hina Tariq", "PROGRAM_COORDINATOR", { managedById: head.id, departmentId: dept.id });
    await prisma.user.create({ data: lead as never });
    const teachers = Array.from({ length: 5 }, (_, i) => {
      const n = `${["Mr.", "Ms.", "Dr."][(t + i) % 3]} ${FIRST[(t + i * 3 + 5) % FIRST.length]} ${LAST[(t + i * 5 + 2) % LAST.length]}`;
      const uname = t === 0 && i === 0 ? "dream.instructor" : t === 0 && i === 1 ? "dream.se" : `dream.t${t + i + 1}`;
      return mk(uname, n, uname === "dream.se" ? "SUBJECT_EXPERT" : "INSTRUCTOR", { managedById: lead.id, departmentId: dept.id, ...(uname === "dream.se" ? { secondaryRole: "INSTRUCTOR" } : {}) });
    });
    t += 5;
    await prisma.user.createMany({ data: teachers as never });
    await prisma.degreeProgram.create({ data: { coordinatorId: lead.id, name: prog.name, shortCode: prog.code } as never });
    const batch = await prisma.batch.create({ data: { coordinatorId: lead.id, degreeProgram: prog.name, batchName: `${prog.code} Fall 2024`, startTerm: "Fall", startYear: 2024, studentCount: 30, advisorId: teachers[2].id } as never });
    await prisma.currentTerm.create({ data: { coordinatorId: lead.id, termName: "Fall", year: 2026 } as never });
    await prisma.gradingScale.createMany({ data: GRADES.map(([letter, , gpa], i) => ({ coordinatorId: lead.id, letter, gpaValue: gpa, orderIndex: i })) as never });
    const plos = await prisma.pLO.findMany({ where: { batchId: src.sourceBatchId }, orderBy: { number: "asc" } });
    await prisma.pLO.createMany({ data: plos.map((p) => ({ coordinatorId: lead.id, batchId: batch.id, number: p.number, title: p.title, description: p.description, status: "approved" })) as never });
    const prof = (await prisma.programProfile.findFirst({ where: { coordinatorId: sb.coordinatorId, degreeProgram: sb.degreeProgram } })) as { peos?: string | null; peoPloJson?: string | null; departmentVision?: string | null; departmentMission?: string | null } | null;
    const peos = prof?.peos && prof.peos !== "[]" ? prof.peos : JSON.stringify(["Graduates apply sound computing knowledge to solve real problems in industry and research.", "Graduates communicate and work effectively in teams with professional and ethical responsibility.", "Graduates keep learning and adapt to new technologies throughout their careers."]);
    await prisma.programProfile.create({ data: { coordinatorId: lead.id, degreeProgram: prog.name, peos, peoPloJson: prof?.peoPloJson || JSON.stringify({ PEO1: [1, 2, 3, 4, 5], PEO2: [6, 7, 8, 9], PEO3: [10] }), departmentVision: prof?.departmentVision || null, departmentMission: prof?.departmentMission || null } as never });
    const r = rng(`students-${src.short}`);
    await prisma.student.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({ id: randomUUID(), batchId: batch.id, name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`, rollNumber: `DRM-${src.short}-24-${String(i + 1).padStart(3, "0")}`, passwordHash: hash, mustChangePassword: false, currentSemesterNumber: CURRENT })) as never,
    });
    out.push({ demoBatchId: batch.id, sourceBatchId: src.sourceBatchId, leadId: lead.id, teacherIds: teachers.map((x) => x.id) });
  }
  return out;
}

type Plan = { clos: { code: string; statement: string; bloom: string; plo: number | null }[]; rows: { n: number; topic: string; sub: string | null; clo: number | null }[] };

/** The course content: real CLO statements and topics when the source course has them, a sensible generic plan otherwise. */
async function planFor(src: { id: string; title: string; courseType: string } | null, title: string, courseType: string, ploNumbers: number[]): Promise<Plan> {
  const [sClos, sRows] = src ? await Promise.all([
    prisma.cLO.findMany({ where: { courseId: src.id, source: "SE" }, orderBy: { orderIndex: "asc" }, select: { id: true, statement: true, bloomLevel: true, mappedPlo: { select: { number: true } } } }),
    prisma.lectureRow.findMany({ where: { courseId: src.id, source: "SE" }, orderBy: { lectureNumber: "asc" }, select: { lectureNumber: true, topic: true, subtopic: true, cloId: true } }),
  ]) : [[], []];
  const fam = courseFamily(courseType);
  const fallbackPlos = ploNumbers.length ? ploNumbers : fam === "GENERAL" ? [7, 8] : [2, 3];
  const clos = sClos.length >= 2 ? sClos.slice(0, 6).map((c, i) => ({ code: `CLO-${i + 1}`, statement: c.statement, bloom: c.bloomLevel || "C3", plo: c.mappedPlo?.number ?? fallbackPlos[i % fallbackPlos.length] }))
    : [["Explain the core concepts and terminology of", "C2"], ["Apply the main techniques of", "C3"], ["Analyse problems using", "C4"], ["Design and evaluate solutions with", "C5"]].map(([v, b], i) => ({ code: `CLO-${i + 1}`, statement: `${v} ${title}.`, bloom: b, plo: fallbackPlos[i % fallbackPlos.length] }));
  const idx = new Map(sClos.slice(0, 6).map((c, i) => [c.id, i]));
  const byNo = new Map(sRows.map((r) => [r.lectureNumber, r]));
  const quarter = (n: number) => Math.min(clos.length - 1, Math.floor(((n - 1) / 32) * clos.length));
  const rows = Array.from({ length: 32 }, (_, i) => {
    const n = i + 1;
    if (n === 16) return { n, topic: "Midterm Exam", sub: null, clo: null };
    if (n === 32) return { n, topic: "Final Exam Review", sub: null, clo: null };
    const s = byNo.get(n);
    const topic = s?.topic?.trim() && !/exam|review/i.test(s.topic) ? s.topic.trim() : `${title} — Unit ${Math.ceil(n / 4)}, part ${((n - 1) % 4) + 1}`;
    const clo = s?.cloId && idx.has(s.cloId) ? idx.get(s.cloId)! : quarter(n);
    return { n, topic, sub: s?.subtopic || null, clo };
  });
  // Every CLO needs lectures: give an orphan CLO the lectures of its quarter.
  clos.forEach((_, ci) => { if (!rows.some((r) => r.clo === ci)) rows.forEach((r) => { if (r.clo !== null && quarter(r.n) === ci) r.clo = ci; }); });
  return { clos, rows };
}

/** Assessments: 4 quizzes (10%), 2 assignments (15%), midterm (25%, split over the first CLOs), final (50%, over the rest). Each item tests one CLO. */
function instrumentsFor(n: number) {
  const half = Math.max(1, Math.ceil(n / 2));
  const out: { type: string; label: string; marksPct: number; maxScore: number; clo: number }[] = [];
  for (let i = 0; i < 4; i++) out.push({ type: "Quiz", label: `Quiz ${i + 1}`, marksPct: 2.5, maxScore: 10, clo: i % n });
  for (let i = 0; i < 2; i++) out.push({ type: "Assignment", label: `Assignment ${i + 1}`, marksPct: 7.5, maxScore: 20, clo: (i * 2 + 1) % n });
  for (let i = 0; i < half; i++) out.push({ type: "Midterm", label: half > 1 ? `Midterm Q${i + 1}` : "Midterm", marksPct: Math.round((2500 / half)) / 100, maxScore: 50, clo: i });
  const rest = Math.max(1, n - half);
  for (let i = 0; i < rest; i++) out.push({ type: "Final", label: rest > 1 ? `Final Q${i + 1}` : "Final", marksPct: Math.round((5000 / rest)) / 100, maxScore: 100, clo: Math.min(n - 1, half + i) });
  const total = out.reduce((s, x) => s + x.marksPct, 0);
  out[out.length - 1].marksPct = Math.round((out[out.length - 1].marksPct + 100 - total) * 100) / 100;
  return out;
}

/** Step 2: one semester's courses of a demo batch, with the SE plan and an identical Instructor copy, PLO mapping and assessments. */
export async function coursesStep(demoBatchId: string, sourceBatchId: string, semester: number, teacherIds: string[]) {
  const [db_, srcCourses, plos] = await Promise.all([
    prisma.batch.findUnique({ where: { id: demoBatchId }, select: { coordinatorId: true } }),
    prisma.course.findMany({ where: { batchId: sourceBatchId, semesterNumber: semester }, orderBy: { code: "asc" }, select: { id: true, code: true, title: true, creditHours: true, courseType: true, catalogDescription: true, ploMappings: { select: { plo: { select: { number: true } } } } } }),
    prisma.pLO.findMany({ where: { batchId: demoBatchId }, select: { id: true, number: true } }),
  ]);
  if (!db_) throw new Error("Demo batch missing.");
  if (await prisma.course.count({ where: { batchId: demoBatchId, semesterNumber: semester } })) return 0; // already done
  const ploId = new Map(plos.map((p) => [p.number, p.id]));
  let made = 0;
  for (const [k, s] of srcCourses.entries()) {
    const offered = semester <= CURRENT;
    const teacher = teacherIds[(k + semester) % teacherIds.length];
    const ploNumbers = s.ploMappings.map((m) => m.plo.number).filter((n) => ploId.has(n)).sort((a, b) => a - b);
    const plan = await planFor(s, s.title, s.courseType, ploNumbers);
    const course = await prisma.course.create({ data: {
      code: s.code, title: s.title, creditHours: s.creditHours, courseType: s.courseType, coordinatorId: db_.coordinatorId, batchId: demoBatchId, semesterNumber: semester,
      catalogDescription: s.catalogDescription, subjectExpertId: teacher, instructorId: offered ? teacher : null, templateStatus: "approved",
      isOffered: offered, offeredTermName: offered ? TERMS[semester - 1][0] : null, offeredTermYear: offered ? TERMS[semester - 1][1] : null,
    } as never });
    // PLOs on the course: the source mapping, plus whatever the CLOs point to.
    const onCourse = Array.from(new Set([...ploNumbers, ...plan.clos.map((c) => c.plo).filter((n): n is number => n !== null && ploId.has(n))]));
    await prisma.coursePloMapping.createMany({ data: onCourse.map((n) => ({ courseId: course.id, ploId: ploId.get(n)!, assignedById: db_.coordinatorId, source: "MANUAL" })) as never, skipDuplicates: true });
    const share = new Map<number, number>();
    for (const c of plan.clos) if (c.plo) share.set(c.plo, (share.get(c.plo) || 0) + 1);
    const inst = instrumentsFor(plan.clos.length);
    for (const source of offered ? ["SE", "INSTRUCTOR"] : ["SE"]) {
      const cloIds = plan.clos.map(() => randomUUID());
      const seen = new Map<number, number>();
      await prisma.cLO.createMany({ data: plan.clos.map((c, i) => {
        const k2 = c.plo && ploId.has(c.plo) ? share.get(c.plo)! : 0; const r = (seen.get(c.plo || 0) || 0) + 1; seen.set(c.plo || 0, r);
        return { id: cloIds[i], courseId: course.id, source, code: c.code, statement: c.statement, bloomLevel: c.bloom, orderIndex: i, mappedPloId: c.plo && ploId.has(c.plo) ? ploId.get(c.plo) : null, ploMappingSource: "MANUAL", ploContributionPct: k2 ? Math.floor(100 / k2) + (r === 1 ? 100 % k2 : 0) : null, targetPct: 60 };
      }) as never });
      const rowIds = plan.rows.map(() => randomUUID());
      await prisma.lectureRow.createMany({ data: plan.rows.map((r, i) => ({ id: rowIds[i], courseId: course.id, source, week: Math.ceil(r.n / 2), lectureNumber: r.n, topic: r.topic, subtopic: r.sub, cloId: r.clo === null ? null : cloIds[r.clo], bloomLevel: r.clo === null ? null : plan.clos[r.clo].bloom })) as never });
      const instIds = inst.map(() => randomUUID());
      await prisma.assessmentInstrument.createMany({ data: inst.map((x, i) => ({ id: instIds[i], courseId: course.id, source, type: x.type, label: x.label, marksPct: x.marksPct, maxScore: x.maxScore })) as never });
      // Each item is linked to lectures of its own CLO only (quizzes/assignments to two, exams to all of that CLO's lectures).
      const links: { lectureRowId: string; instrumentId: string }[] = [];
      inst.forEach((x, i) => {
        const mine = plan.rows.map((r, ri) => ({ r, ri })).filter(({ r }) => r.clo === x.clo);
        const pick = /Quiz|Assignment/.test(x.type) ? mine.slice(x.type === "Quiz" ? 0 : Math.max(0, mine.length - 2), x.type === "Quiz" ? 2 : mine.length) : mine;
        for (const { ri } of pick) links.push({ lectureRowId: rowIds[ri], instrumentId: instIds[i] });
      });
      await prisma.lectureRowInstrument.createMany({ data: links as never, skipDuplicates: true });
      await recomputeCourseRows(course.id, source as "SE" | "INSTRUCTOR").catch(() => null);
    }
    if (semester === CURRENT) await prisma.courseSectionAssignment.create({ data: { courseId: course.id, instructorId: teacher, sectionCount: 1 } as never }).catch(() => null);
    made++;
  }
  return made;
}

/** Step 3: enrolments and marks for one semester; completed semesters also get approved results and transcript records. */
export async function activityStep(demoBatchId: string, semester: number) {
  const [batch, students, courses] = await Promise.all([
    prisma.batch.findUnique({ where: { id: demoBatchId }, select: { coordinatorId: true, coordinator: { select: { managedById: true } } } }),
    prisma.student.findMany({ where: { batchId: demoBatchId }, orderBy: { rollNumber: "asc" }, select: { id: true, rollNumber: true } }),
    prisma.course.findMany({ where: { batchId: demoBatchId, semesterNumber: semester }, select: { id: true, code: true, title: true, creditHours: true, courseType: true, instructorId: true } }),
  ]);
  if (!batch || !courses.length) return 0;
  if (await prisma.studentEnrollment.count({ where: { courseId: { in: courses.map((c) => c.id) } } })) return 0; // already done
  const done = semester < CURRENT;
  const [term, year] = TERMS[semester - 1];
  await prisma.studentEnrollment.createMany({ data: courses.flatMap((c) => students.map((s) => ({ studentId: s.id, courseId: c.id }))) as never, skipDuplicates: true });
  // Ability per student (stable across semesters), so transcripts tell a consistent story.
  const ability = new Map(students.map((s) => { const r = rng(`ability-${s.rollNumber}`); return [s.id, clamp(0.7 + 0.13 * normal(r), 0.3, 0.97)]; }));
  const transcript: Record<string, unknown>[] = [];
  for (const c of courses) {
    const [clos, insts, links, rows] = await Promise.all([
      prisma.cLO.findMany({ where: { courseId: c.id, source: "INSTRUCTOR" }, orderBy: { orderIndex: "asc" }, select: { id: true, code: true, ploContributionPct: true, mappedPlo: { select: { number: true } } } }),
      prisma.assessmentInstrument.findMany({ where: { courseId: c.id, source: "INSTRUCTOR" }, select: { id: true, type: true, marksPct: true, maxScore: true } }),
      prisma.lectureRowInstrument.findMany({ where: { instrument: { courseId: c.id, source: "INSTRUCTOR" } }, select: { instrumentId: true, lectureRow: { select: { cloId: true, lectureNumber: true } } } }),
      prisma.lectureRow.findMany({ where: { courseId: c.id, source: "INSTRUCTOR" }, select: { id: true, lectureNumber: true, week: true } }),
    ]);
    const cloOf = new Map<string, string>(), lastLecture = new Map<string, number>();
    for (const l of links) { if (l.lectureRow.cloId && !cloOf.has(l.instrumentId)) cloOf.set(l.instrumentId, l.lectureRow.cloId); lastLecture.set(l.instrumentId, Math.max(lastLecture.get(l.instrumentId) || 0, l.lectureRow.lectureNumber)); }
    const r = rng(`course-${c.id}`);
    const weakClo = r() < 0.3 ? clos[Math.floor(r() * clos.length)]?.id : null; // some courses have one CLO students find hard
    const difficulty = new Map(clos.map((cl) => [cl.id, (cl.id === weakClo ? 0.16 : 0) + 0.04 * normal(r)]));
    // In the running semester only items whose lectures are up to the midterm (lecture 16) have been marked.
    const marked = insts.filter((i) => done || (lastLecture.get(i.id) || 99) <= 16);
    const marks: Record<string, unknown>[] = [];
    const frac = new Map<string, number>();
    for (const s of students) for (const i of marked) {
      const f = clamp(ability.get(s.id)! - (difficulty.get(cloOf.get(i.id) || "") || 0) + (i.type === "Final" ? -0.05 : i.type === "Quiz" ? 0.04 : 0) + 0.09 * normal(r), 0.12, 1);
      const score = Math.round(f * i.maxScore * 2) / 2;
      frac.set(`${s.id}|${i.id}`, score / i.maxScore);
      marks.push({ studentId: s.id, courseId: c.id, instrumentId: i.id, score, enteredById: c.instructorId || batch.coordinatorId });
    }
    for (let k = 0; k < marks.length; k += 1000) await prisma.studentMark.createMany({ data: marks.slice(k, k + 1000) as never });
    if (done) {
      await prisma.courseGradeCutoff.createMany({ data: GRADES.map(([letter, minPercent]) => ({ courseId: c.id, letter, minPercent, setById: c.instructorId || batch.coordinatorId })) as never });
      await db.courseResult?.create({ data: { courseId: c.id, status: "APPROVED", termName: term, termYear: year, submittedById: c.instructorId, submittedAt: new Date(Date.UTC(year, term === "Fall" ? 0 : 6, 20)), decidedById: batch.coordinator.managedById, decidedAt: new Date(Date.UTC(year, term === "Fall" ? 0 : 6, 28)) } }).catch(() => null);
      const cloMax = new Map(clos.map((cl) => [cl.id, insts.filter((i) => cloOf.get(i.id) === cl.id).reduce((t, i) => t + i.marksPct, 0)]));
      for (const s of students) {
        const total = insts.reduce((t, i) => t + (frac.get(`${s.id}|${i.id}`) || 0) * i.marksPct, 0);
        const g = GRADES.find(([, min]) => total >= min)!;
        const cloPct = clos.map((cl) => { const max = cloMax.get(cl.id) || 0; const got = insts.filter((i) => cloOf.get(i.id) === cl.id).reduce((t, i) => t + (frac.get(`${s.id}|${i.id}`) || 0) * i.marksPct, 0); return { code: cl.code, pct: max ? Math.round((1000 * got) / max) / 10 : 0, passed: max ? got / max >= 0.5 : false, plo: cl.mappedPlo?.number, w: (cl.ploContributionPct || 0) / 100 }; });
        const ploAgg = new Map<number, { s: number; w: number }>();
        for (const x of cloPct) if (x.plo) { const e = ploAgg.get(x.plo) || { s: 0, w: 0 }; e.s += x.pct * x.w; e.w += x.w; ploAgg.set(x.plo, e); }
        transcript.push({
          studentId: s.id, coordinatorId: batch.coordinatorId, courseCode: c.code, courseTitle: c.title, creditHours: c.creditHours, courseType: c.courseType, termName: term, termYear: year,
          totalPct: Math.round(total * 10) / 10, grade: g[0], gpaPoints: g[2],
          cloAttainmentJson: JSON.stringify(cloPct.map(({ code, pct, passed }) => ({ code, pct, passed }))),
          ploAttainmentJson: JSON.stringify(Array.from(ploAgg.entries()).sort((a, b) => a[0] - b[0]).map(([n, e]) => { const pct = e.w ? Math.round((10 * e.s) / e.w) / 10 : 0; return { label: `GA-${n}`, pct, passed: pct >= 50 }; })),
        });
      }
    } else {
      // Running semester: lectures held to week 8 (dates from 24 Aug 2026, two a week) with attendance.
      const held = rows.filter((x) => x.lectureNumber <= 16);
      for (const x of held) await prisma.lectureRow.update({ where: { id: x.id }, data: { actualDate: new Date(Date.UTC(2026, 7, 24 + (x.week - 1) * 7 + (x.lectureNumber % 2 === 0 ? 2 : 0))) } });
      const att = held.filter((x) => x.lectureNumber !== 16).flatMap((x) => students.map((s) => ({ courseId: c.id, lectureRowId: x.id, studentId: s.id, status: r() < 0.62 + 0.35 * ability.get(s.id)! ? "PRESENT" : "ABSENT", markedById: c.instructorId || batch.coordinatorId })));
      for (let k = 0; k < att.length; k += 1000) await prisma.attendanceRecord.createMany({ data: att.slice(k, k + 1000) as never, skipDuplicates: true });
    }
  }
  for (let k = 0; k < transcript.length; k += 500) await prisma.studentTranscriptRecord.createMany({ data: transcript.slice(k, k + 500) as never });
  return courses.length;
}

/** Step 4: suggested Course->PLO weights, PLO->PEO links and a few CQI notes. */
export async function finishDemo() {
  const s = await demoScope();
  if (!s) return;
  for (const b of s.batches) {
    const plos = await prisma.pLO.findMany({ where: { batchId: b.id }, select: { id: true, number: true, ploMappings: { select: { course: { select: { id: true, courseType: true, creditHours: true } } } } } });
    const rows = plos.flatMap((p) => { const w = suggestedWeights(p.ploMappings.map((m) => ({ id: m.course.id, courseType: m.course.courseType, creditHours: m.course.creditHours })), p.number); return Object.entries(w).map(([courseId, weightPct]) => ({ batchId: b.id, ploId: p.id, courseId, weightPct, source: "SUGGESTED", updatedById: s.head.id })); });
    if (rows.length) await db.coursePloWeight?.createMany({ data: rows, skipDuplicates: true }).catch(() => null);
    const weak = await prisma.course.findMany({ where: { batchId: b.id, semesterNumber: { lte: 4 } }, take: 3, orderBy: { code: "asc" }, select: { id: true, code: true } });
    await prisma.cqiRecord.createMany({ data: weak.map((c, i) => ({ chairmanId: s.head.id, authorId: b.coordinatorId, batchId: b.id, courseId: c.id, sourceType: "CLO", sourceReference: `CLO-${i + 2}`, finding: `${c.code}: fewer than 60% of students reached CLO-${i + 2} in the final exam.`, actionTaken: i === 2 ? null : "Two extra problem-solving sessions and a revision quiz added before the final.", status: i === 0 ? "closed" : i === 1 ? "in-progress" : "open", metricBefore: 48 + i * 4 })) as never });
  }
}

/** Removes everything the demo institute owns: any row in any table pointing at one of its ids, then the rows themselves.
 * One pass per call; call until it reports nothing left. Only rows reachable from the demo head are touched. */
export async function deletePass() {
  const s = await demoScope();
  if (!s) return { left: 0 };
  const ids = new Set<string>([s.head.id, ...s.leads.map((l) => l.id), ...s.batches.map((b) => b.id)]);
  const add = (xs: { id: string }[]) => xs.forEach((x) => ids.add(x.id));
  const leadIds = s.leads.map((l) => l.id), batchIds = s.batches.map((b) => b.id);
  add(await prisma.user.findMany({ where: { OR: [{ managedById: s.head.id }, { managedById: { in: leadIds } }] }, select: { id: true } }));
  add(await prisma.department.findMany({ where: { chairmanId: s.head.id }, select: { id: true } }));
  const courses = await prisma.course.findMany({ where: { OR: [{ batchId: { in: batchIds } }, { coordinatorId: { in: leadIds } }] }, select: { id: true } }); add(courses);
  add(await prisma.student.findMany({ where: { batchId: { in: batchIds } }, select: { id: true } }));
  add(await prisma.pLO.findMany({ where: { batchId: { in: batchIds } }, select: { id: true } }));
  const cids = courses.map((c) => c.id);
  add(await prisma.cLO.findMany({ where: { courseId: { in: cids } }, select: { id: true } }));
  add(await prisma.lectureRow.findMany({ where: { courseId: { in: cids } }, select: { id: true } }));
  add(await prisma.assessmentInstrument.findMany({ where: { courseId: { in: cids } }, select: { id: true } }));
  // The head is removed last, once nothing else is left, so the demo can always be found again.
  ids.delete(s.head.id);
  const cols = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT c.table_name, c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND t.table_type = 'BASE TABLE' AND c.data_type = 'text' AND (c.column_name = 'id' OR c.column_name LIKE '%Id')`);
  const byTable = new Map<string, string[]>();
  for (const c of cols) if (c.column_name !== "id") byTable.set(c.table_name, [...(byTable.get(c.table_name) || []), c.column_name]);
  const hasId = new Set(cols.filter((c) => c.column_name === "id").map((c) => c.table_name));
  // One statement per table: rows pointing at a demo id, then the demo rows themselves. FK order is handled by repeating calls.
  const sweep = async (all: string[]) => {
    let removed = 0;
    for (const [t, cs] of Array.from(byTable.entries())) {
      try { removed += await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE ${cs.map((c) => `"${c}" = ANY($1::text[])`).join(" OR ")}`, all); } catch { /* blocked by a reference: next call */ }
    }
    for (const t of Array.from(hasId)) {
      try { removed += await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "id" = ANY($1::text[])`, all); } catch { /* next call */ }
    }
    return removed;
  };
  let removed = await sweep(Array.from(ids));
  if (removed === 0) removed = await sweep([s.head.id]);
  return { left: (await demoHead()) ? 1 : 0, removed };
}

/** The batches of a real institute that can be copied (for the setup form). */
export async function sourceOptions() {
  const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN" as never, NOT: { username: DEMO_HEAD } }, select: { id: true, name: true, instituteName: true } });
  const out = [];
  for (const h of heads) {
    const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: h.id } }, orderBy: [{ degreeProgram: "asc" }, { startYear: "asc" }], select: { id: true, degreeProgram: true, batchName: true, startTerm: true, startYear: true } });
    out.push({ id: h.id, name: h.instituteName || h.name, batches: batches.map((b) => ({ id: b.id, label: `${b.degreeProgram} — ${b.batchName}`, degree: b.degreeProgram, idx: termIndex(b.startTerm, b.startYear) })) });
  }
  return out;
}
