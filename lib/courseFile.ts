import { prisma } from "./db";
import { instituteOfBatch } from "./moduleLocks";
import { computeResultMate, computeCloPloPassRates } from "./resultMate";
import { courseSampling } from "./portfolio";
import { evalSummary } from "./evaluations";
import { PdfDoc, GREEN, RED, AMBER } from "./pdfDoc";

// The complete course file of one course as a single PDF: outline, CLOs and their PLO mapping, lecture plan against
// what was taught, attendance, assessments with their CLOs and the question papers, best / average / worst student
// work, results and grade distribution, CLO attainment, CQI actions and the students' feedback. A course file is
// complete when all ten parts have something in them; the course folder's "kept" flag follows that automatically.

export const PARTS: [string, string][] = [
  ["outline", "Course outline"], ["clos", "CLOs and CLO-PLO mapping"], ["plan", "Lecture plan and what was taught"], ["attendance", "Attendance summary"],
  ["assessments", "Assessments and question papers"], ["samples", "Best, average and worst student work"], ["results", "Results and grade distribution"],
  ["attainment", "CLO attainment"], ["cqi", "CQI actions"], ["feedback", "Student feedback"],
];
const edb = prisma as unknown as Record<string, any>;
const count = async (p: Promise<{ courseId: string | null; _count: { _all: number } }[]>) => new Map((await p.catch(() => [])).map((r) => [r.courseId || "", r._count._all]));

/** Which parts each course has, without building the PDF. */
export async function courseFileStatus(courseIds: string[]) {
  const ids = courseIds.concat(["none"]);
  const [courses, se, taught, clos, unmapped, att, insts, marks, cqi, evals, iclo] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, catalogDescription: true, textbook: true, instructorObservations: true } }),
    count(prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "SE" }, _count: { _all: true } }) as never),
    count(prisma.lectureRow.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "INSTRUCTOR", actualDate: { not: null } }, _count: { _all: true } }) as never),
    count(prisma.cLO.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "SE" }, _count: { _all: true } }) as never),
    count(prisma.cLO.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "SE", mappedPloId: null }, _count: { _all: true } }) as never),
    count(prisma.attendanceRecord.groupBy({ by: ["courseId"], where: { courseId: { in: ids } }, _count: { _all: true } }) as never),
    count(prisma.assessmentInstrument.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "INSTRUCTOR", marksPct: { gt: 0 } }, _count: { _all: true } }) as never),
    count(prisma.studentMark.groupBy({ by: ["courseId"], where: { courseId: { in: ids } }, _count: { _all: true } }) as never),
    count(prisma.cqiRecord.groupBy({ by: ["courseId"], where: { courseId: { in: ids } }, _count: { _all: true } }) as never),
    count(edb.courseEvaluation.groupBy({ by: ["courseId"], where: { courseId: { in: ids } }, _count: { _all: true } })),
    count(prisma.cLO.groupBy({ by: ["courseId"], where: { courseId: { in: ids }, source: "INSTRUCTOR" }, _count: { _all: true } }) as never),
  ]);
  const out = new Map<string, { done: string[]; missing: string[]; complete: boolean }>();
  for (const c of courses) {
    const g = (m: Map<string, number>) => m.get(c.id) || 0;
    const has: Record<string, boolean> = {
      outline: !!(c.catalogDescription?.trim() || c.textbook?.trim()) || g(se) > 0,
      clos: g(clos) > 0 && g(unmapped) === 0,
      plan: g(se) > 0 && g(taught) > 0,
      attendance: g(att) > 0,
      assessments: g(insts) > 0,
      samples: g(marks) > 0,
      results: g(marks) > 0,
      attainment: g(marks) > 0 && (g(iclo) > 0 || g(clos) > 0),
      cqi: g(cqi) > 0 || !!c.instructorObservations?.trim(),
      feedback: g(evals) > 0,
    };
    const done = PARTS.filter(([k]) => has[k]).map(([, l]) => l), missing = PARTS.filter(([k]) => !has[k]).map(([, l]) => l);
    out.set(c.id, { done, missing, complete: missing.length === 0 });
  }
  return out;
}

/** Keep each course folder's "kept" flag in step with whether its course file is complete. */
export async function syncCourseFolders(courses: { id: string; coordinatorId: string }[]) {
  const st = await courseFileStatus(courses.map((c) => c.id));
  const cur = new Map((await prisma.courseFolder.findMany({ where: { courseId: { in: courses.map((c) => c.id).concat(["none"]) } }, select: { courseId: true, kept: true } })).map((f) => [f.courseId, f.kept]));
  for (const c of courses) {
    const complete = !!st.get(c.id)?.complete;
    if (cur.get(c.id) === complete || (!complete && !cur.has(c.id))) continue;
    await prisma.courseFolder.upsert({ where: { courseId: c.id }, create: { courseId: c.id, coordinatorId: c.coordinatorId, kept: complete }, update: { kept: complete } });
  }
  return st;
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "-");
const dmy = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-");

/** The course file as one PDF (bytes), or null when the course does not exist. */
export async function courseFilePdf(courseId: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, creditHours: true, courseType: true, semesterNumber: true, offeredTermName: true, offeredTermYear: true, catalogDescription: true, textbook: true, referenceMaterial: true, teachingMethods: true, instructorObservations: true, batchId: true, instructor: { select: { name: true } }, coordinator: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } } });
  if (!course) return null;
  const chairmanId = course.batchId ? await instituteOfBatch(course.batchId) : null;
  const inst = chairmanId ? await prisma.user.findUnique({ where: { id: chairmanId }, select: { instituteName: true } }) : null;
  const status = (await courseFileStatus([courseId])).get(courseId)!;
  const term = course.offeredTermName ? `${course.offeredTermName} ${course.offeredTermYear || ""}`.trim() : "";
  const d = await PdfDoc.create(`Course file - ${course.code} ${course.title}${term ? ` - ${term}` : ""}`);
  d.title(`Course File: ${course.code} ${course.title}`, `${inst?.instituteName || "Institute"} - ${course.batch?.degreeProgram || ""}, ${course.batch?.batchName || ""}${term ? ` - ${term}` : ""}`);
  d.kv([["Credit hours", course.creditHours], ["Course type", course.courseType], ["Semester", course.semesterNumber || "-"], ["Teacher", course.instructor?.name || "-"], ["Program Lead", course.coordinator?.name || "-"], ["Prepared", dmy(new Date())]]);
  d.h2(status.complete ? "This course file is complete." : `Still missing: ${status.missing.join(", ")}.`);
  d.table([["Part", 5], ["In this file", 2]], PARTS.map(([, l]) => [l, status.done.includes(l) ? "Yes" : "Missing"]), { colour: (r, c) => (c === 1 ? (status.done.includes(PARTS[r][1]) ? GREEN : RED) : undefined) });

  // 1. Outline
  d.h1("1. Course outline");
  d.kv([["Description", course.catalogDescription || "-"], ["Textbook", course.textbook || "-"], ["Reference material", course.referenceMaterial || "-"], ["Teaching methods", course.teachingMethods || "-"]]);

  // 2. CLOs
  const clos = await prisma.cLO.findMany({ where: { courseId, source: "SE" }, select: { code: true, statement: true, bloomLevel: true, targetPct: true, mappedPlo: { select: { number: true, title: true } } }, orderBy: { orderIndex: "asc" } });
  d.h1("2. CLOs and their PLO mapping");
  if (clos.length) d.table([["CLO", 1], ["Statement", 7], ["Bloom", 1.2], ["PLO", 3], ["Target", 1.2]], clos.map((c) => [c.code, c.statement, c.bloomLevel, c.mappedPlo ? `PLO-${c.mappedPlo.number} ${c.mappedPlo.title}` : "not mapped", `${c.targetPct}%`]), { colour: (r, c) => (c === 3 && !clos[r].mappedPlo ? RED : undefined) });
  else d.note("No CLOs written yet.");

  // 3. Lecture plan vs taught
  const [plan, taught] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId, source: "SE" }, select: { week: true, lectureNumber: true, topic: true, clo: { select: { code: true } } }, orderBy: [{ week: "asc" }, { lectureNumber: "asc" }] }),
    prisma.lectureRow.findMany({ where: { courseId, source: "INSTRUCTOR" }, select: { week: true, lectureNumber: true, topic: true, actualDate: true }, orderBy: [{ week: "asc" }, { lectureNumber: "asc" }] }),
  ]);
  d.h1("3. Lecture plan and what was taught");
  const held = taught.filter((t) => t.actualDate).length;
  d.text(`${plan.length} lectures planned; ${held} recorded as taught (${pct(held, plan.length)}).`);
  if (plan.length) d.table([["Week", 0.8], ["No.", 0.7], ["Planned topic", 5], ["CLO", 1], ["Taught on", 1.6], ["Topic taught", 4]], plan.map((p) => { const t = taught.find((x) => x.week === p.week && x.lectureNumber === p.lectureNumber); return [p.week, p.lectureNumber, p.topic, p.clo?.code || "-", t?.actualDate ? dmy(t.actualDate) : "not recorded", t?.topic && t.topic !== p.topic ? t.topic : t?.actualDate ? "as planned" : "-"]; }), { size: 8, colour: (r, c) => (c === 4 && !taught.find((x) => x.week === plan[r].week && x.lectureNumber === plan[r].lectureNumber)?.actualDate ? AMBER : undefined) });

  // 4. Attendance
  const att = await prisma.attendanceRecord.findMany({ where: { courseId }, select: { studentId: true, status: true, student: { select: { rollNumber: true, name: true } } } });
  d.h1("4. Attendance summary");
  if (att.length) {
    const by = new Map<string, { roll: string; name: string; p: number; n: number }>();
    for (const a of att) { const r = by.get(a.studentId) || { roll: a.student.rollNumber, name: a.student.name, p: 0, n: 0 }; r.n++; if (a.status === "PRESENT" || a.status === "LATE" || a.status === "LEAVE") r.p++; by.set(a.studentId, r); }
    const rows = Array.from(by.values()).sort((a, b) => a.roll.localeCompare(b.roll));
    const avg = rows.reduce((t, r) => t + r.p / r.n, 0) / rows.length;
    const short = rows.filter((r) => r.p / r.n < 0.75);
    d.text(`Average attendance ${Math.round(avg * 100)}%. ${short.length} student(s) below 75%.`);
    d.table([["Roll no.", 2], ["Name", 4], ["Present", 1.2], ["Classes", 1.2], ["Attendance", 1.4]], rows.map((r) => [r.roll, r.name, r.p, r.n, pct(r.p, r.n)]), { size: 8, colour: (r, c) => (c === 4 && rows[r].p / rows[r].n < 0.75 ? RED : undefined) });
  } else d.note("No attendance recorded.");

  // 5. Assessments and papers
  const sampling = await courseSampling(courseId).catch(() => null);
  const insts = await prisma.assessmentInstrument.findMany({ where: { courseId, source: "INSTRUCTOR", marksPct: { gt: 0 } }, select: { id: true, type: true, label: true, marksPct: true, maxScore: true }, orderBy: [{ type: "asc" }, { label: "asc" }] });
  const papers = await prisma.paperSubmission.findMany({ where: { leadCourseId: courseId }, select: { examType: true, version: true, status: true, submittedAt: true, approvedAt: true }, orderBy: { submittedAt: "desc" } }).catch(() => []);
  d.h1("5. Assessments and question papers");
  if (insts.length) d.table([["Assessment", 3], ["Type", 2], ["Weight", 1.2], ["Out of", 1.2], ["CLOs", 2.5]], insts.map((i) => [i.label, i.type, `${i.marksPct}%`, i.maxScore, sampling?.items.find((s) => s.id === i.id)?.clos.join(", ") || "-"]));
  else d.note("No assessments set.");
  d.h2("Question papers");
  if (papers.length) d.table([["Paper", 2], ["Version", 1], ["Status", 2], ["Submitted", 2], ["Approved", 2]], papers.map((p) => [p.examType, p.version, p.status.replace(/_/g, " ").toLowerCase(), dmy(p.submittedAt), dmy(p.approvedAt)]));
  else d.note("No question paper submitted through OBEHUB.");

  // 6. Samples
  d.h1("6. Best, average and worst student work");
  const items = (sampling?.items || []).filter((i) => i.scored > 0);
  if (items.length) d.table([["Assessment", 3], ["Best", 3], ["Average", 3], ["Lowest", 3], ["Kept copies", 1.5]], items.map((i) => { const s = (x: { rollNumber: string; score: number } | null) => (x ? `${x.rollNumber} (${x.score}/${i.maxScore})` : "-"); return [i.label, s(i.suggest.HIGH), s(i.suggest.MEDIUM), s(i.suggest.LOW), i.samples.length]; }), { size: 8 });
  else d.note("No marks entered yet, so no samples can be chosen.");
  d.note("Attach the marked scripts of these students (Teacher → course → Samples keeps the scanned copies).");

  // 7. Results
  const res = await computeResultMate(courseId).catch(() => null);
  d.h1("7. Results and grade distribution");
  if (res && res.rows.length) {
    const grades = new Map<string, number>();
    for (const r of res.rows) grades.set(r.grade, (grades.get(r.grade) || 0) + 1);
    const order = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"];
    const keys = Array.from(grades.keys()).sort((a, b) => (order.indexOf(a) + 99 * +(order.indexOf(a) < 0)) - (order.indexOf(b) + 99 * +(order.indexOf(b) < 0)));
    const fails = grades.get("F") || 0;
    d.text(`${res.rows.length} students. Class average ${res.stats.mean}% (standard deviation ${res.stats.sd}). Passed ${res.rows.length - fails} (${pct(res.rows.length - fails, res.rows.length)}), failed ${fails}.${res.cutoffsAreSet ? "" : " Grades worked out from the class average (no cut-offs saved)."}`);
    d.bars(keys.map((k) => [k, grades.get(k) || 0]));
    d.table([["Assessment", 3], ["Out of", 1], ["Class average", 1.5], ["Spread (SD)", 1.5]], res.instruments.filter((i) => insts.some((x) => x.id === i.id)).map((i) => [i.label, i.maxScore, i.average ?? "-", i.sd ?? "-"]));
  } else d.note("No results yet.");

  // 8. CLO attainment
  const pr = res && res.rows.length ? await computeCloPloPassRates(courseId).catch(() => null) : null;
  const targets = new Map((await prisma.cLO.findMany({ where: { courseId, source: "INSTRUCTOR" }, select: { code: true, targetPct: true } })).map((c) => [c.code, c.targetPct]));
  d.h1("8. CLO attainment");
  if (pr && pr.cloStats.length) {
    d.note("A student attains a CLO by scoring at least half of the marks set on it. The CLO is attained when the share of students who attain it reaches its target.");
    d.table([["CLO", 1.2], ["Marks set on it", 2], ["Students attaining", 2], ["Share", 1.4], ["Target", 1.2], ["Result", 1.6]], pr.cloStats.map((c) => { const share = pr.studentCount ? (100 * c.passCount) / pr.studentCount : 0; const t = targets.get(c.code) ?? 60; return [c.code, `${c.maxWeight}%`, `${c.passCount} of ${pr.studentCount}`, `${Math.round(share)}%`, `${t}%`, c.maxWeight ? (share >= t ? "Attained" : "Not attained") : "Not assessed"]; }), { colour: (r, c) => { if (c !== 5) return undefined; const x = pr.cloStats[r]; const share = pr.studentCount ? (100 * x.passCount) / pr.studentCount : 0; return !x.maxWeight ? AMBER : share >= (targets.get(x.code) ?? 60) ? GREEN : RED; } });
  } else d.note("No CLO attainment yet (needs CLOs and marks).");

  // 9. CQI
  const cqi = await prisma.cqiRecord.findMany({ where: { courseId }, select: { finding: true, actionTaken: true, status: true, sourceReference: true, metricBefore: true, metricAfter: true }, orderBy: { createdAt: "asc" } });
  d.h1("9. CQI actions");
  if (cqi.length) d.table([["About", 1.4], ["Finding", 4], ["Action taken", 4], ["Status", 1.6], ["Before / after", 1.6]], cqi.map((c) => [c.sourceReference || "-", c.finding, c.actionTaken || "-", c.status, c.metricBefore !== null ? `${c.metricBefore} / ${c.metricAfter ?? "-"}` : "-"]));
  else d.note("No CQI action recorded for this course.");
  if (course.instructorObservations?.trim()) { d.h2("Teacher's observations"); d.text(course.instructorObservations); }

  // 10. Feedback
  const ev = (await evalSummary([courseId]).catch(() => new Map())).get(courseId);
  d.h1("10. Student feedback");
  if (ev && (ev.COURSE.n || ev.TEACHER.n)) {
    d.kv([["Course rating", ev.COURSE.overall !== null ? `${ev.COURSE.overall} / 5 (${ev.COURSE.n} students)` : "-"], ["Teacher rating", ev.TEACHER.overall !== null ? `${ev.TEACHER.overall} / 5 (${ev.TEACHER.n} students)` : "-"]]);
    const comments = [...ev.COURSE.comments, ...ev.TEACHER.comments].slice(0, 8);
    if (comments.length) { d.h2("Some comments (students are not named)"); for (const c of comments) d.text(`- ${c}`, { size: 8.5, indent: 6 }); }
  } else d.note("No student feedback yet.");

  const bytes = await d.save();
  return { bytes, filename: `Course File - ${course.code} ${course.title}${term ? ` - ${term}` : ""}.pdf`.replace(/[^\w .()-]+/g, "") };
}
