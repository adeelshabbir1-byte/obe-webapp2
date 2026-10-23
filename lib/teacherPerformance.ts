import { prisma } from "./db";
import { gradeDistribution } from "./quality";
import { teacherRatings } from "./evaluations";
import { computeScorecard } from "./appraisal";
import { fdpHours } from "./fdp";
import { connectorCounts } from "./alumniVoice";
import { chairmanIdFor } from "./reportScope";

// Faculty Performance Report — one teacher, one term: courses and sections; class results against other sections of
// the same course this term and the course's past offerings; CLO attainment and CQI; student feedback (this teacher's
// own sections); lectures delivered and attendance marked; deadlines; FYP supervision; FDP hours; alumni reached; and
// the trend over the last terms. A ranked summary for the HOD / Dean uses the same figures.

const adb = prisma as unknown as Record<string, any>;
export type Term = { name: string; year: number };
const tIdx = (t: Term) => (/fall/i.test(t.name) ? 2 * t.year : 2 * t.year - 1);
const tOf = (i: number): Term => (i % 2 === 0 ? { name: "Fall", year: i / 2 } : { name: "Spring", year: (i + 1) / 2 });
export const termLabel = (t: Term) => `${t.name} ${t.year}`;
export const parseTerm = (s?: string | null): Term => { const m = /^(Fall|Spring)-(\d{4})$/.exec(s || ""); if (m) return { name: m[1], year: Number(m[2]) }; const d = new Date(); return d.getUTCMonth() >= 7 ? { name: "Fall", year: d.getUTCFullYear() } : { name: "Spring", year: d.getUTCFullYear() }; };
const avg = (xs: number[]) => (xs.length ? Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10 : null);

async function coursesOf(userIds: string[], t: Term) {
  return prisma.course.findMany({ where: { offeredTermName: t.name, offeredTermYear: t.year, OR: [{ instructorId: { in: userIds.concat("none") } }, { sectionAssignments: { some: { instructorId: { in: userIds.concat("none") } } } }] }, select: { id: true, code: true, title: true, creditHours: true, instructorId: true, sectionAssignments: { select: { instructorId: true } }, batch: { select: { degreeProgram: true, batchName: true } }, _count: { select: { studentEnrollments: true } } } });
}
const teaches = (c: { instructorId: string | null; sectionAssignments: { instructorId: string }[] }, u: string) => c.instructorId === u || c.sectionAssignments.some((a) => a.instructorId === u);

/** Rating of this teacher across courses: weighted by answers. */
function myRating(r: Map<string, { teacherId: string; n: number; overall: number | null }[]>, u: string) {
  let t = 0, n = 0;
  for (const xs of Array.from(r.values())) for (const x of xs) if (x.teacherId === u && x.overall !== null) { t += x.overall * x.n; n += x.n; }
  return n ? { avg: Math.round((10 * t) / n) / 10, n } : null;
}

export async function termReport(userId: string, t: Term) {
  const who = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, managedById: true, department_: { select: { name: true } } } });
  const courses = await coursesOf([userId], t);
  const ids = courses.map((c) => c.id), codes = Array.from(new Set(courses.map((c) => c.code)));
  const [mine, others, past, ratings, lectures, marked, cqi, card] = await Promise.all([
    gradeDistribution({ id: { in: ids.concat("none") } }).catch(() => ({ rows: [] })),
    gradeDistribution({ code: { in: codes.concat("none") }, offeredTermName: t.name, offeredTermYear: t.year, id: { notIn: ids.concat("none") } }).catch(() => ({ rows: [] })),
    gradeDistribution({ code: { in: codes.concat("none") }, NOT: { offeredTermName: t.name, offeredTermYear: t.year } }).catch(() => ({ rows: [] })),
    teacherRatings(ids).catch(() => new Map()),
    ids.length ? prisma.lectureRow.findMany({ where: { courseId: { in: ids }, source: "INSTRUCTOR" }, select: { courseId: true, actualDate: true, topic: true } }) : Promise.resolve([]),
    ids.length ? prisma.attendanceRecord.groupBy({ by: ["courseId", "lectureRowId"], where: { courseId: { in: ids }, markedById: userId } } as never).catch(() => []) as unknown as Promise<{ courseId: string }[]> : Promise.resolve([]),
    ids.length ? prisma.cqiRecord.findMany({ where: { courseId: { in: ids } }, select: { courseId: true, status: true, sourceReference: true } }).catch(() => []) : Promise.resolve([]),
    computeScorecard(userId, t.year).catch(() => null),
  ]);
  const { computeCloPloPassRates } = await import("./resultMate");
  const rows = [];
  for (const c of courses) {
    const g = mine.rows.find((r) => r.courseId === c.id);
    const o = others.rows.filter((r) => r.code === c.code);
    const p = past.rows.filter((r) => r.code === c.code);
    const clo = await computeCloPloPassRates(c.id).catch(() => null);
    const cloRates = clo && clo.studentCount ? clo.cloStats.filter((s) => s.maxWeight > 0).map((s) => ({ code: s.code, pct: Math.round((100 * s.passCount) / clo.studentCount) })) : [];
    const lec = lectures.filter((l) => l.courseId === c.id && (l.topic || "").trim());
    const rt = (ratings.get(c.id) || []).find((x: { teacherId: string }) => x.teacherId === userId) || null;
    rows.push({
      code: c.code, title: c.title, batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "", creditHours: c.creditHours, students: c._count.studentEnrollments,
      sections: c.instructorId === userId ? 1 + c.sectionAssignments.filter((a) => a.instructorId === userId).length : c.sectionAssignments.filter((a) => a.instructorId === userId).length,
      mean: g?.mean ?? null, passRate: g?.passRate ?? null, aShare: g?.aShare ?? null, fShare: g?.fShare ?? null, dist: g?.dist || {}, flags: g?.flags || [],
      otherMean: avg(o.map((x) => x.mean).filter((x): x is number => x != null)), pastMean: avg(p.map((x) => x.mean).filter((x): x is number => x != null)), pastTerms: Array.from(new Set(p.map((x) => x.term))).length,
      clo: cloRates, cloAvg: avg(cloRates.map((x) => x.pct)), weakClos: cloRates.filter((x) => x.pct < 60).map((x) => x.code),
      cqi: cqi.filter((x) => x.courseId === c.id).map((x) => `${x.sourceReference || ""} (${x.status})`),
      rating: rt ? { avg: rt.overall, n: rt.n } : null,
      planned: lec.length, delivered: lec.filter((l) => l.actualDate).length, attendanceSessions: marked.filter((m) => m.courseId === c.id).length,
    });
  }
  const chairmanId = who ? await chairmanIdFor({ id: who.id, role: who.role, managedById: who.managedById }) : "";
  const [fdp, alumni, fyp, cosup] = await Promise.all([
    fdpHours(chairmanId || "", [userId], t.year).then((m) => m.get(userId) || 0),
    connectorCounts([userId]).then((m) => m.get(userId) || { sent: 0, answered: 0 }).catch(() => ({ sent: 0, answered: 0 })),
    adb.fypGroup.count({ where: { supervisorId: userId, cycle: { termName: t.name, termYear: t.year } } }).catch(() => adb.fypGroup.count({ where: { supervisorId: userId } }).catch(() => 0)),
    adb.fypCoSupervisor.count({ where: { userId } }).catch(() => 0),
  ]);
  const rating = myRating(ratings as never, userId);
  // The adjusted feedback score: allows for how strictly or generously each batch rated all its teachers this term.
  const fb = chairmanId ? await import("./feedbackAnalysis").then((m) => m.termFeedback(chairmanId, { name: t.name, year: t.year })).then((tf) => tf.ranking.find((x) => x.teacherId === userId) || null).catch(() => null) : null;
  const planned = rows.reduce((a, r) => a + r.planned, 0), delivered = rows.reduce((a, r) => a + r.delivered, 0);
  // Trend: the last four terms before this one, light figures only.
  const trend = [];
  for (let i = tIdx(t) - 3; i <= tIdx(t); i++) {
    const tt = tOf(i);
    const cs = i === tIdx(t) ? courses : await coursesOf([userId], tt);
    if (!cs.length) { trend.push({ term: termLabel(tt), courses: 0, mean: null, passRate: null, rating: null }); continue; }
    const [g, r] = i === tIdx(t) ? [mine, ratings] : await Promise.all([gradeDistribution({ id: { in: cs.map((c) => c.id) } }).catch(() => ({ rows: [] })), teacherRatings(cs.map((c) => c.id)).catch(() => new Map())]);
    trend.push({ term: termLabel(tt), courses: cs.length, mean: avg(g.rows.map((x) => x.mean).filter((x): x is number => x != null)), passRate: avg(g.rows.map((x) => x.passRate)), rating: myRating(r as never, userId)?.avg ?? null });
  }
  return {
    teacher: { id: userId, name: who?.name || "—", department: who?.department_?.name || "" }, term: termLabel(t), courses: rows,
    totals: { courses: rows.length, sections: rows.reduce((a, r) => a + r.sections, 0), students: rows.reduce((a, r) => a + r.students, 0), creditHours: rows.reduce((a, r) => a + r.creditHours, 0) },
    rating, feedback: fb ? { raw: fb.raw, adjusted: fb.adjusted, total: fb.total, n: fb.n, shown: fb.shown } : null, delivery: { planned, delivered, pct: planned ? Math.round((100 * delivered) / planned) : null, attendanceSessions: rows.reduce((a, r) => a + r.attendanceSessions, 0) },
    deadlines: card?.deadlines || null, results: card?.results || null, design: card?.design || null, recognition: card?.recognition || [],
    fyp: { groups: fyp as number, coSupervised: cosup as number }, fdpHours: fdp, alumni,
    cloAvg: avg(rows.map((r) => r.cloAvg).filter((x): x is number => x != null)), trend,
  };
}
export type TermReport = Awaited<ReturnType<typeof termReport>>;

/** Ranked list for the HOD / Dean / Head: light figures per teacher who taught in the term. */
export async function ranking(people: { id: string; name: string; department_: { name: string } | null }[], t: Term) {
  const ids = people.map((p) => p.id);
  const courses = await coursesOf(ids, t);
  const cIds = courses.map((c) => c.id);
  const [g, r, lec] = await Promise.all([
    gradeDistribution({ id: { in: cIds.concat("none") } }).catch(() => ({ rows: [] })),
    teacherRatings(cIds).catch(() => new Map()),
    cIds.length ? prisma.lectureRow.findMany({ where: { courseId: { in: cIds }, source: "INSTRUCTOR" }, select: { courseId: true, actualDate: true, topic: true } }) : Promise.resolve([]),
  ]);
  const out = [];
  for (const p of people) {
    const cs = courses.filter((c) => teaches(c, p.id));
    if (!cs.length) continue;
    const gr = g.rows.filter((x) => cs.some((c) => c.id === x.courseId));
    const lr = lec.filter((l) => cs.some((c) => c.id === l.courseId) && (l.topic || "").trim());
    const rating = myRating(r as never, p.id);
    const mean = avg(gr.map((x) => x.mean).filter((x): x is number => x != null)), pass = avg(gr.map((x) => x.passRate));
    const delivery = lr.length ? Math.round((100 * lr.filter((l) => l.actualDate).length) / lr.length) : null;
    const parts = [rating ? (rating.avg / 5) * 100 : null, pass, delivery].filter((x): x is number => x != null);
    out.push({ id: p.id, name: p.name, department: p.department_?.name || "", courses: cs.map((c) => c.code).join(", "), mean, passRate: pass, rating: rating?.avg ?? null, answers: rating?.n ?? 0, delivery, score: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null });
  }
  return out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/** The report as a Word-openable HTML document. */
export function reportHtml(r: TermReport) {
  const e = (s: unknown) => String(s ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const td = (x: unknown) => `<td>${e(x)}</td>`;
  return `<html><head><meta charset="utf-8"><title>Faculty Performance Report</title><style>body{font-family:Arial;font-size:11pt}table{border-collapse:collapse;width:100%;margin:6px 0 14px}td,th{border:1px solid #999;padding:4px;font-size:10pt;text-align:left}th{background:#eee}h1{font-size:16pt}h2{font-size:13pt;margin-top:16px}</style></head><body>
<h1>Faculty Performance Report — ${e(r.term)}</h1><p><b>${e(r.teacher.name)}</b>${r.teacher.department ? `, ${e(r.teacher.department)}` : ""}</p>
<p>${r.totals.courses} course(s), ${r.totals.sections} section(s), ${r.totals.students} students, ${r.totals.creditHours} credit hours.</p>
<h2>Courses and results</h2><table><tr><th>Course</th><th>Batch</th><th>Students</th><th>Mean %</th><th>Pass %</th><th>A %</th><th>F %</th><th>Other sections mean</th><th>Past offerings mean</th><th>Flags</th></tr>
${r.courses.map((c) => `<tr>${td(`${c.code} ${c.title}`)}${td(c.batch)}${td(c.students)}${td(c.mean)}${td(c.passRate)}${td(c.aShare)}${td(c.fShare)}${td(c.otherMean)}${td(c.pastMean)}${td(c.flags.join("; ") || "")}</tr>`).join("")}</table>
<h2>CLO attainment and CQI</h2><table><tr><th>Course</th><th>Students reaching each CLO</th><th>Weak CLOs (&lt;60%)</th><th>CQI records</th></tr>
${r.courses.map((c) => `<tr>${td(c.code)}${td(c.clo.map((x) => `${x.code} ${x.pct}%`).join(", ") || "—")}${td(c.weakClos.join(", ") || "none")}${td(c.cqi.join("; ") || "none")}</tr>`).join("")}</table>
<h2>Teaching and feedback</h2><table>
<tr><th>Student feedback (own sections)</th><td>${r.rating ? `${r.rating.avg}/5 from ${r.rating.n} students` : "not enough answers"}</td></tr>
<tr><th>Lectures delivered</th><td>${r.delivery.pct !== null ? `${r.delivery.pct}% (${r.delivery.delivered} of ${r.delivery.planned})` : "—"}</td></tr>
<tr><th>Attendance sessions marked</th><td>${r.delivery.attendanceSessions}</td></tr>
<tr><th>Deadlines met on time (year)</th><td>${r.deadlines?.rate != null ? `${r.deadlines.rate}% (${r.deadlines.ON_TIME} of ${r.deadlines.judged})` : "—"}</td></tr>
<tr><th>Results approved</th><td>${r.results ? `${r.results.approved} approved, ${r.results.notSubmitted} not submitted` : "—"}</td></tr>
<tr><th>FYP groups supervised</th><td>${r.fyp.groups}${r.fyp.coSupervised ? ` (+${r.fyp.coSupervised} co-supervised)` : ""}</td></tr>
<tr><th>FDP hours (${e(r.term.split(" ")[1])})</th><td>${r.fdpHours}</td></tr>
<tr><th>Alumni reached</th><td>${r.alumni.answered} answered of ${r.alumni.sent} requests</td></tr>
<tr><th>Recognition</th><td>${e(r.recognition.map((x) => x.title).join("; ") || "—")}</td></tr></table>
<h2>Trend</h2><table><tr><th>Term</th><th>Courses</th><th>Mean %</th><th>Pass %</th><th>Feedback</th></tr>${r.trend.map((x) => `<tr>${td(x.term)}${td(x.courses)}${td(x.mean)}${td(x.passRate)}${td(x.rating)}</tr>`).join("")}</table>
<p style="font-size:9pt;color:#666">Generated by OBEHUB on ${new Date().toDateString()}.</p></body></html>`;
}
