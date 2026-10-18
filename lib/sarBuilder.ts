import { parseFinding, labelOf, POSITIONS, DECISIONS, OUTCOMES } from "./accreditation/visit";
import { Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, PageBreak, AlignmentType } from "docx";
import { prisma } from "./db";
import { BODIES, type BodyKey } from "./accreditation/bodies";
import { CATALOGUE } from "./accreditation/catalogue";
import { outcomesData } from "./outcomesReport";
import { SOURCES } from "./indirectPlo";
import { cdb, parseArr, KNOWLEDGE } from "./complexProblems";
import { evalSummary } from "./evaluations";

// One-click Self-Assessment Report for a visit, in the council's chapter order, filled from everything the system holds.
// Narrative text the Program Lead writes per chapter is kept (SarNarrative) and merged in on every regeneration;
// anything missing is listed up front and marked in red where it belongs.

const db = prisma as unknown as Record<string, any>;
type Ch = { key: string; title: string; prompt: string };

const TITLES: Record<BodyKey, Record<string, string>> = {
  NCEAC: { profile: "Criterion 1 — Program Mission, Objectives and Outcomes", outcomes: "Criterion 2 — Graduate Attributes / PLO Assessment", curriculum: "Criterion 3 — Curriculum and Learning Process", students: "Criterion 4 — Students", faculty: "Criterion 5 — Faculty and Support Staff", facilities: "Criterion 6 — Facilities and Infrastructure", support: "Criterion 7 — Institutional Support and Financial Resources", cqi: "Criterion 8 — Steps to Improve the Program (CQI)", industry: "Criterion 9 — Industrial Linkages" },
  PEC: { profile: "Criterion 1 — Program Educational Objectives", outcomes: "Criterion 2 — Program Learning Outcomes (Graduate Attributes)", curriculum: "Criterion 3 — Curriculum and Learning Process", students: "Criterion 4 — Students", faculty: "Criterion 5 — Faculty and Support Staff", facilities: "Criterion 6 — Facilities and Infrastructure", support: "Criterion 7 — Institutional Support and Financial Resources", cqi: "Criterion 8 — Continuous Quality Improvement", industry: "Criterion 9 — Industrial Linkages" },
  NBEAC: { profile: "Form 2 — Program Mission, Objectives and Learning Goals", outcomes: "Assurance of Learning — Goal Attainment", curriculum: "Form 2 — Curriculum and Course Results", students: "Form 3 — Students", faculty: "Form 4 — Faculty", facilities: "Form 6 — Facilities and Resources", support: "Form 6 — Financial Resources", cqi: "Closing the Loop", industry: "Form 5 — Social Responsibility and Linkages" },
  HEC: { profile: "Criterion 1 — Program Mission, Objectives and Outcomes", outcomes: "Criterion 1 — Outcome Assessment", curriculum: "Criterion 2 — Curriculum Design and Organization", students: "Criterion 4 — Student Support and Advising", faculty: "Criterion 6 — Faculty", facilities: "Criterion 3 & 7 — Laboratories and Institutional Facilities", support: "Criterion 8 — Institutional Support", cqi: "Criterion 5 — Process Control and Improvement", industry: "Linkages with Industry and Society" },
};
export function chapters(body: BodyKey): Ch[] {
  const t = TITLES[body] || TITLES.HEC;
  return [
    { key: "intro", title: "Introduction and Program Profile", prompt: "Brief history of the program, the department and the self-assessment process (who prepared this report and how)." },
    { key: "profile", title: t.profile, prompt: "How the mission and objectives were set with stakeholders and approved, and how they are reviewed." },
    { key: "outcomes", title: t.outcomes, prompt: "How PLOs are measured (direct and indirect), the targets, and what the results show." },
    { key: "curriculum", title: t.curriculum, prompt: "Curriculum design, review process, teaching methods, and how complex problems are built into courses." },
    { key: "students", title: t.students, prompt: "Admission criteria, advising and counselling, progression, and student support." },
    { key: "faculty", title: t.faculty, prompt: "Faculty recruitment, development, workload and retention." },
    { key: "facilities", title: t.facilities, prompt: "Classrooms, laboratories, computing, library and safety arrangements." },
    { key: "support", title: t.support, prompt: "Budget, financial sustainability and institutional support for the program." },
    { key: "cqi", title: t.cqi, prompt: "How assessment results lead to improvements, with examples and their effect." },
    { key: "industry", title: t.industry, prompt: "Industrial advisory board, internships, industry projects and community engagement." },
    { key: "compliance", title: "Compliance with the Previous Visit", prompt: "Overall statement on how the previous panel's recommendations were addressed." },
    { key: "conclusion", title: "Strengths, Weaknesses and Implementation Plan", prompt: "Summary of strengths and areas for improvement identified in this self-assessment." },
  ];
}

// ---- small docx helpers
const RED = "B3261E";
const run = (text: string, o: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) => new TextRun({ text, bold: o.bold, italics: o.italics, color: o.color, size: o.size ?? 21 });
const p = (text: string, o: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) => new Paragraph({ spacing: { after: 100 }, children: [run(text, o)] });
const gap = (text: string) => p(`[Missing] ${text}`, { color: RED, italics: true });
const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 }, children: [new TextRun({ text })] });
const h2 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 }, children: [new TextRun({ text })] });
const cell = (text: string, head = false) => new TableCell({ shading: head ? { type: ShadingType.CLEAR, fill: "E8EEF5", color: "auto" } : undefined, children: String(text).split("\n").map((l) => new Paragraph({ children: [new TextRun({ text: l, bold: head, size: 17 })] })) });
const table = (cols: string[], rows: (string | number | null | undefined)[][]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: cols.map((c) => cell(c, true)) }), ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c === null || c === undefined || c === "" ? "—" : String(c))) }))] });
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "—");

export async function sarData(cycleId: string) {
  const c = await prisma.accreditationCycle.findUnique({ where: { id: cycleId } });
  if (!c) return null;
  const body = (BODIES[c.body as BodyKey] ? c.body : "HEC") as BodyKey;
  const [head, lead, narr] = await Promise.all([
    prisma.user.findUnique({ where: { id: c.chairmanId }, select: { name: true, instituteName: true } }),
    prisma.user.findUnique({ where: { id: c.leadId }, select: { name: true } }),
    db.sarNarrative.findMany({ where: { cycleId } }).catch(() => []) as Promise<{ sectionKey: string; text: string }[]>,
  ]);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: c.leadId, degreeProgram: c.program }, orderBy: { startYear: "desc" }, select: { id: true, batchName: true, startYear: true } });
  const recent = batches.slice(0, 3);
  const out = (await Promise.all(recent.map((b) => outcomesData(b.id)))).filter((x): x is NonNullable<typeof x> => !!x);
  const courses = await prisma.course.findMany({ where: { batchId: { in: batches.map((b) => b.id) } }, select: { id: true, code: true, title: true, creditHours: true, courseType: true, instructorId: true, subjectExpertId: true, batchId: true, assignmentPct: true, quizPct: true, projectPct: true, labPct: true, midtermPct: true, finalPct: true }, orderBy: [{ code: "asc" }] });
  const latestByCode = new Map<string, (typeof courses)[number]>();
  for (const co of courses) { const prev = latestByCode.get(co.code); const yr = (id: string | null) => batches.find((b) => b.id === id)?.startYear || 0; if (!prev || yr(co.batchId) > yr(prev.batchId)) latestByCode.set(co.code, co); }
  const descIds = Array.from(latestByCode.values()).map((x) => x.id);
  const [clos, plos, rows, tags, know] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId: { in: descIds }, source: "SE" }, select: { courseId: true, code: true, statement: true, bloomLevel: true, mappedPloId: true }, orderBy: { code: "asc" } }),
    prisma.pLO.findMany({ where: { batchId: { in: batches.map((b) => b.id) } }, select: { id: true, number: true, title: true, batchId: true } }),
    prisma.lectureRow.findMany({ where: { courseId: { in: descIds }, source: "SE" }, select: { courseId: true, week: true, topic: true }, orderBy: [{ week: "asc" }] }).catch(() => [] as { courseId: string; week: number; topic: string }[]),
    cdb.complexTag.findMany({ where: { courseId: { in: courses.map((x) => x.id) } } }).catch(() => []) as Promise<{ instrumentId: string; courseId: string; attrsJson: string }[]>,
    cdb.courseKnowledge.findMany({ where: { chairmanId: c.chairmanId, courseCode: { in: Array.from(latestByCode.keys()) } } }).catch(() => []) as Promise<{ courseCode: string; areasJson: string }[]>,
  ]);
  const ploNum = new Map(plos.map((x) => [x.id, x.number]));
  // People: everyone teaching or designing the program's courses, plus the Program Lead.
  const staffIds = Array.from(new Set([c.leadId, ...courses.flatMap((x) => [x.instructorId, x.subjectExpertId]).filter((x): x is string => !!x)]));
  const [staff, profiles, records] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, email: true, role: true } }),
    prisma.facultyProfile.findMany({ where: { userId: { in: staffIds } }, select: { userId: true, designation: true, employmentType: true, specialization: true, dateOfJoining: true } }),
    prisma.facultyRecord.findMany({ where: { userId: { in: staffIds } }, select: { userId: true, kind: true, title: true, organisation: true, role: true, startYear: true, endYear: true, category: true }, orderBy: [{ startYear: "desc" }] }),
  ]);
  const students = await prisma.student.findMany({ where: { batchId: { in: batches.map((b) => b.id) } }, select: { id: true, batchId: true, status: true } }).catch(async () => (await prisma.student.findMany({ where: { batchId: { in: batches.map((b) => b.id) } }, select: { id: true, batchId: true } })).map((s) => ({ ...s, status: "ACTIVE" })));
  const [placements, exits, cqi, complaints, labs, evals, items, prevCycle] = await Promise.all([
    cdb.placement.findMany({ where: { studentId: { in: students.map((s) => s.id) } }, select: { studentId: true, kind: true, organization: true, inField: true } }).catch(() => []) as Promise<{ studentId: string; kind: string; organization: string; inField: boolean }[]>,
    db.exitSurvey.findMany({ where: { kind: "STUDENT_EXIT", subjectId: { in: students.map((s) => s.id) }, submittedAt: { not: null } }, select: { answersJson: true } }).catch(() => []) as Promise<{ answersJson: string }[]>,
    prisma.cqiRecord.findMany({ where: { batchId: { in: batches.map((b) => b.id) } }, select: { sourceReference: true, finding: true, actionTaken: true, status: true, metricBefore: true, metricAfter: true } }),
    db.complaint.findMany({ where: { chairmanId: c.chairmanId, createdAt: { gte: new Date(Date.now() - 2 * 365 * 86400000) } }, select: { category: true, status: true, createdAt: true, closedAt: true } }).catch(() => []) as Promise<{ category: string; status: string; createdAt: Date; closedAt: Date | null }[]>,
    db.labFileEntry.findMany({ where: { chairmanId: c.chairmanId }, select: { lab: true, kind: true, courseCode: true, entryDate: true } }).catch(() => []) as Promise<{ lab: string; kind: string; courseCode: string | null; entryDate: Date | null }[]>,
    evalSummary(courses.map((x) => x.id)),
    db.visitItem.findMany({ where: { cycleId }, orderBy: { sort: "asc" } }).catch(() => []) as Promise<{ kind: string; dataJson: string; status: string }[]>,
    prisma.accreditationCycle.findFirst({ where: { leadId: c.leadId, body: c.body, id: { not: c.id }, createdAt: { lt: c.createdAt } }, orderBy: { createdAt: "desc" } }),
  ]);
  const prevFindings = prevCycle ? ((await db.visitItem.findMany({ where: { cycleId: prevCycle.id, kind: "FINDING" } }).catch(() => [])) as { dataJson: string; status: string }[]) : [];
  const tasks = await prisma.accreditationTask.findMany({ where: { cycleId }, select: { code: true, status: true, dataJson: true } });
  const rooms = await prisma.room.findMany({ where: { chairmanId: c.chairmanId }, select: { type: true, capacity: true } });
  return { c, body, head, lead, narr: new Map(narr.map((n) => [n.sectionKey, n.text])), batches, out, courses, latestByCode, clos, plos, ploNum, rows, tags, know, staff, profiles, records, students, placements, exits, cqi, complaints, labs, evals, items, prevCycle, prevFindings, tasks, rooms };
}
export type SarData = NonNullable<Awaited<ReturnType<typeof sarData>>>;

/** What is still missing, chapter by chapter (also shown on the SAR page). */
export function sarGaps(d: SarData) {
  const g: { ch: string; text: string }[] = [];
  const latest = d.out[0];
  if (!latest?.peos.length) g.push({ ch: "profile", text: "Program Educational Objectives are not entered (Program Profile)." });
  if (!latest?.mission) g.push({ ch: "profile", text: "Mission statement is not entered." });
  if (!d.plos.length) g.push({ ch: "outcomes", text: "No PLOs for this program's batches." });
  if (latest && !latest.plo.rows.some((r) => r.cells.direct)) g.push({ ch: "outcomes", text: "No finalised results yet, so there is no direct PLO attainment." });
  if (latest && !latest.plo.rows.some((r) => ["STUDENT", "ALUMNI", "EMPLOYER", "courseExit"].some((k) => r.cells[k]))) g.push({ ch: "outcomes", text: "No indirect evidence: run the exit, alumni and employer surveys." });
  if (!d.tags.length && (d.body === "PEC" || d.body === "NCEAC")) g.push({ ch: "curriculum", text: "No assessment is tagged as a complex problem." });
  if (!d.know.length && (d.body === "PEC" || d.body === "NCEAC")) g.push({ ch: "curriculum", text: "Knowledge profile not mapped for any course." });
  const noClo = Array.from(d.latestByCode.values()).filter((x) => !d.clos.some((cl) => cl.courseId === x.id));
  if (noClo.length) g.push({ ch: "curriculum", text: `Courses without CLOs: ${noClo.map((x) => x.code).join(", ")}.` });
  const noEdu = d.staff.filter((s) => !d.records.some((r) => r.userId === s.id && r.kind === "EDUCATION"));
  if (noEdu.length) g.push({ ch: "faculty", text: `Faculty without qualifications on their profile (CV appendix incomplete): ${noEdu.map((s) => s.name).join(", ")}.` });
  if (!d.placements.length) g.push({ ch: "students", text: "No internship or job records for this program's students." });
  if (!d.labs.some((l) => l.kind === "SAFETY_TRAINING")) g.push({ ch: "facilities", text: "No lab safety training recorded (Lab File)." });
  if (!d.cqi.length) g.push({ ch: "cqi", text: "No CQI records for this program's batches." });
  for (const ch of chapters(d.body)) if (!d.narr.get(ch.key)?.trim()) g.push({ ch: ch.key, text: `Narrative not written yet: ${ch.prompt}` });
  return g;
}

export async function buildSar(cycleId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const d = await sarData(cycleId);
  if (!d) return null;
  const gaps = sarGaps(d);
  const chs = chapters(d.body);
  const kids: (Paragraph | Table)[] = [];
  const narrative = (key: string) => { const t = d.narr.get(key)?.trim(); return t ? t.split(/\n+/).map((x) => p(x)) : [gap(chs.find((c) => c.key === key)?.prompt || "Write this section.")]; };
  const gapsFor = (key: string) => gaps.filter((x) => x.ch === key && !x.text.startsWith("Narrative")).map((x) => gap(x.text));
  const latest = d.out[0];

  // Cover
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2000 }, children: [run(d.head?.instituteName || "Institute", { bold: true, size: 32 })] }));
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [run("Self-Assessment Report", { bold: true, size: 44 })] }));
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(d.c.program, { size: 30 })] }));
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [run(`${BODIES[d.body].name}`, { size: 22 })] }));
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`${BODIES[d.body].framework}`, { italics: true, size: 20 })] }));
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [run(`Program Lead: ${d.lead?.name || "—"} · Head of Institution: ${d.head?.name || "—"}`, { size: 20 })] }));
  kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`Visit: ${d.c.visitDate ? d.c.visitDate.toISOString().slice(0, 10) : "date to be confirmed"} · Generated ${new Date().toISOString().slice(0, 10)}`, { size: 20 })] }));
  kids.push(new Paragraph({ children: [new PageBreak()] }));

  // Readiness summary
  kids.push(h1("Readiness summary"));
  kids.push(p(gaps.length ? `${gaps.length} items still need attention before this report is final (also marked in red in each chapter):` : "All sections have data and narrative."));
  if (gaps.length) kids.push(table(["Chapter", "What is missing"], gaps.map((x) => [chs.find((c) => c.key === x.ch)?.title || x.ch, x.text])));
  kids.push(h2("Contents"));
  chs.forEach((c, i) => kids.push(p(`${i + 1}. ${c.title}`)));
  kids.push(p("Appendices: A. Course descriptions · B. Faculty CVs · C. Criteria checklist"));

  // 1 Intro
  kids.push(h1(`1. ${chs[0].title}`)); kids.push(...narrative("intro"));
  kids.push(table(["Item", "Detail"], [["Institution", d.head?.instituteName], ["Program", d.c.program], ["Accreditation body", BODIES[d.body].name], ["Batches covered", d.batches.map((b) => b.batchName).join(", ")], ["Students (all batches)", d.students.length], ["Teaching staff involved", d.staff.length]]));

  // 2 Profile
  kids.push(h1(`2. ${chs[1].title}`)); kids.push(...gapsFor("profile"));
  if (latest?.mission) { kids.push(h2("Mission")); kids.push(p(latest.mission)); }
  if (latest?.peos.length) { kids.push(h2("Program Educational Objectives")); latest.peos.forEach((x, i) => kids.push(p(`PEO-${i + 1}: ${x}`))); }
  kids.push(...narrative("profile"));

  // 3 Outcomes
  kids.push(h1(`3. ${chs[2].title}`)); kids.push(...gapsFor("outcomes"));
  const latestBatch = d.batches[0];
  const pl = d.plos.filter((x) => x.batchId === latestBatch?.id).sort((a, b) => a.number - b.number);
  if (pl.length) { kids.push(h2("Program Learning Outcomes")); kids.push(table(["PLO", "Statement"], pl.map((x) => [`PLO-${x.number}`, x.title]))); }
  for (const o of d.out) {
    kids.push(h2(`PLO attainment — ${o.batch.batchName} (target ${o.plo.target}%)`));
    kids.push(table(["PLO", ...SOURCES.map(([, v]) => v), "Blended", "Met"], o.plo.rows.map((r) => [`PLO-${r.number}`, ...SOURCES.map(([k]) => (r.cells[k] ? `${r.cells[k]!.pct}% (n=${r.cells[k]!.n})` : "")), r.blended !== null ? `${r.blended}%` : "", r.met === null ? "" : r.met ? "Yes" : "No"])));
  }
  kids.push(...narrative("outcomes"));

  // 4 Curriculum
  kids.push(h1(`4. ${chs[3].title}`)); kids.push(...gapsFor("curriculum"));
  const codes = Array.from(d.latestByCode.values());
  kids.push(h2("Scheme of studies"));
  kids.push(p(`${codes.length} courses, ${codes.reduce((s, x) => s + x.creditHours, 0)} credit hours.`));
  kids.push(table(["Code", "Title", "Cr. Hrs", "Type", "PLOs"], codes.map((x) => [x.code, x.title, x.creditHours, x.courseType, Array.from(new Set(d.clos.filter((cl) => cl.courseId === x.id && cl.mappedPloId).map((cl) => d.ploNum.get(cl.mappedPloId!)))).sort((a, b) => (a || 0) - (b || 0)).map((n) => `PLO-${n}`).join(", ")])));
  if (d.body === "PEC" || d.body === "NCEAC") {
    const ks = KNOWLEDGE[d.body === "PEC" ? "PEC" : "NCEAC"];
    const kOf = new Map(d.know.map((k) => [k.courseCode, parseArr(k.areasJson)]));
    kids.push(h2("Knowledge profile coverage"));
    kids.push(table(["Area", "Courses"], ks.map(([k, n]) => [`${k} ${n}`, codes.filter((x) => kOf.get(x.code)?.includes(k)).map((x) => x.code).join(", ")])));
    kids.push(h2(d.body === "PEC" ? "Complex engineering problems" : "Complex computing problems"));
    const tc = new Map<string, number>(); for (const t of d.tags) tc.set(t.courseId, (tc.get(t.courseId) || 0) + 1);
    kids.push(table(["Course", "Complex-problem assessments"], d.courses.filter((x) => tc.get(x.id)).map((x) => [x.code, tc.get(x.id)])));
  }
  for (const o of d.out.slice(0, 1)) { kids.push(h2(`Course CLO results — ${o.batch.batchName}`)); kids.push(table(["Course", "Term", "Students", "Failed", "CLOs (% meeting)"], o.courses.map((x) => [`${x.code} ${x.title}`, x.term, x.n, x.fails, x.clos.map((cl) => `${cl.code} ${cl.pct}%`).join(", ")]))); }
  const ev = d.courses.map((x) => ({ x, e: d.evals.get(x.id)! })).filter((r) => r.e.COURSE.n || r.e.TEACHER.n);
  if (ev.length) { kids.push(h2("Student evaluation of courses and teachers (out of 5)")); kids.push(table(["Course", "Course rating", "Teacher rating", "Responses"], ev.map((r) => [r.x.code, r.e.COURSE.overall, r.e.TEACHER.overall, Math.max(r.e.COURSE.n, r.e.TEACHER.n)]))); }
  kids.push(...narrative("curriculum"));

  // 5 Students
  kids.push(h1(`5. ${chs[4].title}`)); kids.push(...gapsFor("students"));
  kids.push(table(["Batch", "Enrolled", "Studying", "Graduated", "Left", "Dropped", "Internship", "Employed / higher study"], d.batches.map((b) => { const ss = d.students.filter((s) => s.batchId === b.id); const ids = new Set(ss.map((s) => s.id)); const pl2 = d.placements.filter((x) => ids.has(x.studentId)); return [b.batchName, ss.length, ss.filter((s) => s.status === "ACTIVE").length, ss.filter((s) => s.status === "GRADUATED").length, ss.filter((s) => s.status === "LEFT").length, ss.filter((s) => s.status === "DROPPED").length, pct(new Set(pl2.filter((x) => x.kind === "INTERNSHIP").map((x) => x.studentId)).size, ss.length), pct(new Set(pl2.filter((x) => x.kind !== "INTERNSHIP").map((x) => x.studentId)).size, ss.length)]; })));
  if (d.exits.length) { const rs = new Map<string, number>(); for (const e of d.exits) { const r = String((JSON.parse(e.answersJson || "{}") as Record<string, unknown>).reason || "—"); rs.set(r, (rs.get(r) || 0) + 1); } kids.push(h2("Why students left (exit surveys)")); kids.push(table(["Reason", "Students"], Array.from(rs.entries()).sort((a, b) => b[1] - a[1]))); }
  if (d.complaints.length) { const closed = d.complaints.filter((x) => x.closedAt); kids.push(h2("Complaints and grievances (last two years)")); kids.push(p(`${d.complaints.length} received, ${closed.length} closed, average ${closed.length ? (closed.reduce((s, x) => s + (x.closedAt!.getTime() - x.createdAt.getTime()) / 86400000, 0) / closed.length).toFixed(1) : "—"} days to close.`)); }
  kids.push(...narrative("students"));

  // 6 Faculty
  kids.push(h1(`6. ${chs[5].title}`)); kids.push(...gapsFor("faculty"));
  const prof = new Map(d.profiles.map((x) => [x.userId, x]));
  const highest = (id: string) => d.records.filter((r) => r.userId === id && r.kind === "EDUCATION").map((r) => r.title)[0] || "";
  const pubs = (id: string) => d.records.filter((r) => r.userId === id && r.kind === "PUBLICATION" && (r.startYear || 0) >= new Date().getFullYear() - 5).length;
  kids.push(table(["Name", "Designation", "Employment", "Highest qualification", "Publications (5 yrs)", "Courses in program"], d.staff.map((s) => [s.name, prof.get(s.id)?.designation, prof.get(s.id)?.employmentType, highest(s.id), pubs(s.id), Array.from(new Set(d.courses.filter((x) => x.instructorId === s.id).map((x) => x.code))).join(", ")])));
  const ft = d.staff.filter((s) => !/visit|part/i.test(prof.get(s.id)?.employmentType || "")).length;
  kids.push(p(`Full-time faculty: ${ft}; PhD holders: ${d.staff.filter((s) => /ph\.?d/i.test(highest(s.id))).length}; student–teacher ratio about ${ft ? Math.round(d.students.filter((s) => s.status === "ACTIVE").length / ft) : "—"} : 1.`));
  kids.push(...narrative("faculty"));

  // 7 Facilities
  kids.push(h1(`7. ${chs[6].title}`)); kids.push(...gapsFor("facilities"));
  kids.push(p(`Lecture rooms: ${d.rooms.filter((r) => r.type === "LECTURE").length} (capacity ${d.rooms.filter((r) => r.type === "LECTURE").reduce((s, r) => s + r.capacity, 0)}); laboratories: ${d.rooms.filter((r) => r.type === "LAB").length}.`));
  const labNames = Array.from(new Set(d.labs.map((l) => l.lab)));
  if (labNames.length) kids.push(table(["Lab", "Manuals", "Safety SOP", "Safety training (12 months)", "Maintenance (12 months)"], labNames.map((l) => { const es = d.labs.filter((x) => x.lab === l); const yr = Date.now() - 365 * 86400000; return [l, es.filter((x) => x.kind === "MANUAL").length, es.some((x) => x.kind === "SOP") ? "Yes" : "No", es.filter((x) => x.kind === "SAFETY_TRAINING" && x.entryDate && x.entryDate.getTime() > yr).length, es.filter((x) => x.kind === "MAINTENANCE" && x.entryDate && x.entryDate.getTime() > yr).length]; })));
  kids.push(...narrative("facilities"));

  // 8 Support
  kids.push(h1(`8. ${chs[7].title}`)); kids.push(...narrative("support"));

  // 9 CQI
  kids.push(h1(`9. ${chs[8].title}`)); kids.push(...gapsFor("cqi"));
  if (d.cqi.length) kids.push(table(["Outcome", "Finding", "Action", "Before → after", "Status"], d.cqi.map((x) => [x.sourceReference, x.finding, x.actionTaken, `${x.metricBefore ?? "—"} → ${x.metricAfter ?? "—"}`, x.status])));
  kids.push(...narrative("cqi"));

  // 10 Industry
  kids.push(h1(`10. ${chs[9].title}`));
  const emp = new Map<string, number>(); for (const x of d.placements) emp.set(x.organization, (emp.get(x.organization) || 0) + 1);
  if (emp.size) kids.push(table(["Organisation (internships and jobs)", "Students"], Array.from(emp.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20)));
  kids.push(...narrative("industry"));

  // 11 Compliance
  kids.push(h1(`11. ${chs[10].title}`));
  if (d.prevCycle) { kids.push(p(`Previous visit: ${d.prevCycle.title}${d.prevCycle.visitDate ? ` (${d.prevCycle.visitDate.toISOString().slice(0, 10)})` : ""}.`)); const fs = d.prevFindings.map((f) => ({ f, x: JSON.parse(f.dataJson || "{}") as Record<string, string>, q: parseFinding(f) })).filter((r) => r.x.type !== "STRENGTH" && !r.q.withdrawn); if (fs.length) kids.push(table(["Finding", "Our position", "Action and progress", "Result"], fs.map((r) => [`${r.x.type || ""} ${r.x.criterion ? `(${r.x.criterion})` : ""} ${r.x.observation || ""}`, r.q.position ? `${labelOf(POSITIONS, r.q.position)}${r.q.position !== "ACCEPT" ? ` — ${labelOf(DECISIONS, r.q.decision)}` : ""}` : "Accept", `${r.x.action || r.x.response || ""} (${r.q.pct}%)${r.q.metricBefore || r.q.metricAfter ? ` ${r.q.metricBefore || "—"} → ${r.q.metricAfter || "—"}` : ""}`, `${labelOf(OUTCOMES, r.q.outcome)}${r.q.outcomeNote ? `: ${r.q.outcomeNote}` : ""}`]))); const w = d.prevFindings.filter((f) => parseFinding(f).withdrawn).length; if (w) kids.push(p(`${w} finding(s) of the previous visit were withdrawn by the council after our rebuttal.`)); }
  else kids.push(p("This is the program's first accreditation visit recorded in the system."));
  kids.push(...narrative("compliance"));

  // 12 Conclusion + plan
  kids.push(h1(`12. ${chs[11].title}`)); kids.push(...narrative("conclusion"));
  const plan = d.items.filter((i) => i.kind === "IMPLEMENTATION").map((i) => JSON.parse(i.dataJson || "{}") as Record<string, string>);
  if (plan.length) { kids.push(h2("Implementation plan")); kids.push(table(["Finding", "Action", "Responsible", "Timeline", "Measure"], plan.map((x) => [x.finding, x.action, x.responsible, x.timeline, x.indicator]))); }

  // Appendix A: course descriptions
  kids.push(new Paragraph({ children: [new PageBreak()] })); kids.push(h1("Appendix A — Course Descriptions"));
  for (const x of codes) {
    kids.push(h2(`${x.code} ${x.title}`));
    kids.push(p(`Credit hours: ${x.creditHours} · Type: ${x.courseType} · Assessment: assignments ${x.assignmentPct}%, quizzes ${x.quizPct}%, project ${x.projectPct}%, lab ${x.labPct}%, midterm ${x.midtermPct}%, final ${x.finalPct}%`, { size: 19 }));
    const cl = d.clos.filter((c) => c.courseId === x.id);
    if (cl.length) kids.push(table(["CLO", "Statement", "Bloom", "PLO"], cl.map((c) => [c.code, c.statement, c.bloomLevel, c.mappedPloId ? `PLO-${d.ploNum.get(c.mappedPloId) ?? "?"}` : ""]))); else kids.push(gap("No CLOs."));
    const tp = d.rows.filter((r) => r.courseId === x.id);
    if (tp.length) kids.push(p(`Topics: ${Array.from(new Set(tp.map((r) => r.topic))).filter(Boolean).join("; ")}`, { size: 18 }));
  }

  // Appendix B: faculty CVs
  kids.push(new Paragraph({ children: [new PageBreak()] })); kids.push(h1("Appendix B — Faculty CVs"));
  for (const s of d.staff) {
    const pr = prof.get(s.id); const rs = d.records.filter((r) => r.userId === s.id);
    kids.push(h2(s.name));
    kids.push(p(`${pr?.designation || ""}${pr?.employmentType ? ` · ${pr.employmentType}` : ""}${pr?.specialization ? ` · ${pr.specialization}` : ""}${pr?.dateOfJoining ? ` · joined ${pr.dateOfJoining.toISOString().slice(0, 10)}` : ""} · ${s.email}`, { size: 19 }));
    const block = (kind: string, label: string, cols: string[], f: (r: (typeof rs)[number]) => (string | number | null | undefined)[], max = 15) => { const xs = rs.filter((r) => r.kind === kind).slice(0, max); if (xs.length) { kids.push(p(label, { bold: true, size: 19 })); kids.push(table(cols, xs.map(f))); } };
    if (!rs.some((r) => r.kind === "EDUCATION")) kids.push(gap("Qualifications not entered on the profile."));
    block("EDUCATION", "Education", ["Degree", "Institution", "Year"], (r) => [r.title, r.organisation, r.endYear || r.startYear]);
    block("EXPERIENCE", "Experience", ["Position", "Organisation", "From", "To"], (r) => [r.role || r.title, r.organisation, r.startYear, r.endYear || "present"]);
    block("PUBLICATION", "Publications (latest)", ["Title", "Venue", "Year", "Category"], (r) => [r.title, r.organisation, r.startYear, r.category]);
    block("GRANT", "Grants and projects", ["Title", "Funder", "Year"], (r) => [r.title, r.organisation, r.startYear]);
    const taught = Array.from(new Set(d.courses.filter((c) => c.instructorId === s.id).map((c) => `${c.code} ${c.title}`)));
    if (taught.length) kids.push(p(`Courses taught in this program: ${taught.join("; ")}`, { size: 18 }));
  }

  // Appendix C: criteria checklist
  kids.push(new Paragraph({ children: [new PageBreak()] })); kids.push(h1("Appendix C — Criteria Checklist"));
  const cat = CATALOGUE[d.body];
  const tOf = new Map(d.tasks.map((t) => [t.code, t]));
  const STATUS: Record<string, string> = { OPEN: "Not assigned", ASSIGNED: "Assigned", RETURNED: "Returned", SUBMITTED: "Signed off", APPROVED: "Approved" };
  for (const g of cat.groups) {
    const ts = cat.tasks.filter((t) => t.group === g.key);
    if (!ts.length) continue;
    kids.push(h2(`${BODIES[d.body].groupLabel} ${g.key} — ${g.title}`));
    kids.push(table(["Item", "Status", "Notes for the panel"], ts.map((t) => { const r = tOf.get(t.code); let note = ""; try { note = (JSON.parse(r?.dataJson || "{}") as { fields?: Record<string, string> }).fields?.note || ""; } catch { note = ""; } return [`${t.code} ${t.title}`, r ? STATUS[r.status] || r.status : "—", note]; })));
  }

  const doc = new Document({ creator: "OBEHUB", title: `SAR ${d.c.program}`, styles: { default: { document: { run: { font: "Calibri" } } } }, sections: [{ children: kids }] });
  const buffer = await Packer.toBuffer(doc);
  return { buffer, filename: `SAR-${d.body}-${d.c.program}-${new Date().toISOString().slice(0, 10)}.docx`.replace(/[^\w.-]+/g, "_") };
}
