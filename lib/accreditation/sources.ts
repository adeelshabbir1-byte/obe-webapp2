import { prisma } from "../db";
import { completeness } from "../facultyProfile";
import { fiscalYearNow, labRatio } from "../resources";
import { computeReadiness, type Check } from "../readiness";
import { computeHecComparison } from "../hecCompare";
import { buildNbeacSar } from "../nbeacSar";
import { sarScope } from "../sarAccess";
import { MEETING_KINDS } from "../evidenceFiles";
import { standardsFor, type BodyKey, type Standards } from "./bodies";
import type { SourceKey, TaskDef } from "./catalogue";

// What the system already knows for an accreditation task — so the assignee only checks it and signs off.
// Each source returns a table, the checks it can settle against the council's standards, and named gaps (shown in red
// on the readiness dashboard). Everything is worked out from the live records each time; nothing is copied.

export type Gap = { kind: "course-file" | "unverified-profile" | "plo" | "result" | "fsr" | "lab" | "data" | "overload" | "cqi"; text: string; href: string };
export type SourceResult = { key: SourceKey; title: string; columns: string[]; rows: (string | number)[][]; checks: Check[]; gaps: Gap[]; note?: string };
type Cell = string | number;

export type ProgramContext = { chairmanId: string; leadId: string; program: string; departmentId: string | null; body: BodyKey };

const YEAR_MS = 365 * 864e5;
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");
const chk = (label: string, done: number, total: number, hint: string, href: string): Check => ({ label, done: Math.min(done, total), total, hint, href });
const isVisiting = (t: string | null | undefined) => /visiting|adjunct|part-time/i.test(t || "");
const PHD = /\b(ph\.?\s?d|doctor|d\.?phil)\b/i;
const MASTERS = /\b(ms|m\.?s\.?|mphil|m\.?phil|master|msc|m\.?sc|mba|ma)\b/i;

/** Loads each kind of record once per program, however many tasks and sources use it. */
export class SourceLoader {
  private memo = new Map<string, Promise<unknown>>();
  std!: Standards;
  constructor(public ctx: ProgramContext) {}
  private once<T>(key: string, f: () => Promise<T>): Promise<T> { if (!this.memo.has(key)) this.memo.set(key, f()); return this.memo.get(key) as Promise<T>; }
  async init() { this.std = await standardsFor(this.ctx.chairmanId, this.ctx.body); return this; }

  batches() { return this.once("batches", () => prisma.batch.findMany({ where: { coordinatorId: this.ctx.leadId }, select: { id: true, batchName: true, degreeProgram: true, advisorId: true, studentCount: true } })); }
  courses() { return this.once("courses", () => prisma.course.findMany({ where: { coordinatorId: this.ctx.leadId }, select: { id: true, code: true, title: true, creditHours: true, semesterNumber: true, batchId: true, courseType: true, isNonCredit: true, isOffered: true, instructorId: true, instructor: { select: { name: true } } } })); }
  async offered() { return (await this.courses()).filter((c) => c.isOffered); }
  students() { return this.once("students", async () => prisma.student.count({ where: { batch: { coordinatorId: this.ctx.leadId }, status: "ACTIVE" } })); }
  faculty() {
    return this.once("faculty", async () => {
      const offered = await this.offered();
      const ids = Array.from(new Set(offered.map((c) => c.instructorId).filter((x): x is string => !!x)));
      const people = await prisma.user.findMany({
        where: { isActive: true, isVisitingPlaceholder: false, OR: [{ id: { in: ids.length ? ids : ["none"] } }, { managedById: this.ctx.leadId, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER"] } }] },
        select: { id: true, name: true, role: true },
      });
      const uid = people.map((p) => p.id);
      const [profiles, edu] = await Promise.all([
        prisma.facultyProfile.findMany({ where: { userId: { in: uid.length ? uid : ["none"] } } }),
        prisma.facultyRecord.findMany({ where: { userId: { in: uid.length ? uid : ["none"] }, kind: "EDUCATION" }, select: { userId: true, title: true } }),
      ]);
      return people.map((p) => {
        const prof = profiles.find((x) => x.userId === p.id) || null;
        const degrees = edu.filter((e) => e.userId === p.id).map((e) => e.title);
        const highest = degrees.find((d) => PHD.test(d)) || degrees.find((d) => MASTERS.test(d)) || degrees[0] || "";
        const verified = !!prof?.verifiedAt && prof.updatedAt.getTime() - prof.verifiedAt.getTime() < 5000;
        const load = offered.filter((c) => c.instructorId === p.id && !c.isNonCredit).reduce((n, c) => n + c.creditHours, 0);
        return { ...p, prof, degrees, highest, phd: degrees.some((d) => PHD.test(d)), visiting: isVisiting(prof?.employmentType), complete: completeness(prof, degrees.length), verified, changedSinceCheck: !!prof?.verifiedAt && !verified, load };
      }).sort((a, b) => a.name.localeCompare(b.name));
    });
  }
  readiness() {
    return this.once("readiness", async () => {
      const lead = await prisma.user.findUnique({ where: { id: this.ctx.leadId }, select: { id: true, managedById: true, departmentId: true } });
      return lead ? computeReadiness(lead, "", this.std) : null;
    });
  }
  nbeac() {
    return this.once("nbeac", async () => {
      if (!this.ctx.departmentId) return null;
      const head = await prisma.user.findUnique({ where: { id: this.ctx.chairmanId } });
      if (!head) return null;
      const scope = await sarScope({ ...head, role: "CHAIRMAN" } as never);
      return buildNbeacSar({ id: head.id, role: "CHAIRMAN" }, scope, this.ctx.departmentId).catch(() => null);
    });
  }
}

// ---------------------------------------------------------------------------------------------------- the sources

async function faculty(l: SourceLoader): Promise<SourceResult> {
  const f = await l.faculty(), std = l.std;
  const fullTime = f.filter((x) => !x.visiting).length, visiting = f.length - fullTime, fte = fullTime + visiting * 0.25;
  const phd = f.filter((x) => !x.visiting && x.phd).length;
  const students = await l.students();
  const ratio = fte > 0 ? Math.round((students / fte) * 10) / 10 : null;
  const checks = [
    chk("Faculty profiles 80% complete", f.filter((x) => x.complete >= 80).length, f.length, "Ask faculty to complete My Profile.", "/faculty-report"),
    chk("Faculty profiles checked against the documents", f.filter((x) => x.verified).length, f.length, "Check each profile and mark it verified on this task.", "/faculty-report"),
    chk(`Full-time faculty: at least ${std.minFullTimeFaculty}`, fullTime, std.minFullTimeFaculty, "Hire or record more full-time faculty.", "/coordinator/faculty"),
    chk(`Full-time faculty with a PhD: at least ${std.minPhdFaculty}`, phd, std.minPhdFaculty, "Faculty record their degrees under My Profile.", "/faculty-report"),
  ];
  const gaps: Gap[] = f.filter((x) => !x.verified).map((x) => ({ kind: "unverified-profile" as const, text: `${x.name}: profile ${x.changedSinceCheck ? "changed since it was checked" : "not checked"}`, href: "/faculty-report" }));
  if (std.maxStudentFacultyRatio && ratio !== null) {
    checks.push(chk(`Students per full-time-equivalent teacher: at most ${std.maxStudentFacultyRatio} (now ${ratio})`, ratio <= std.maxStudentFacultyRatio ? 1 : 0, 1, "Add faculty, or reduce the intake.", "/coordinator/faculty"));
    if (ratio > std.maxStudentFacultyRatio) gaps.push({ kind: "fsr", text: `${ratio} students per teacher (limit ${std.maxStudentFacultyRatio})`, href: "/coordinator/faculty" });
  }
  return {
    key: "faculty", title: "Faculty register", columns: ["Name", "Designation", "Status", "Highest degree", "Profile", "Checked"],
    rows: f.map((x) => [x.name, x.prof?.designation || "—", x.visiting ? x.prof?.employmentType || "Visiting" : x.prof?.employmentType || "Full-time", x.highest || "—", `${x.complete}%`, x.verified ? day(x.prof?.verifiedAt) : x.changedSinceCheck ? "changed since" : "no"]),
    checks, gaps, note: `${students} students · ${fullTime} full-time and ${visiting} visiting (a visiting teacher counts as 0.25)${ratio !== null ? ` · ${ratio} students per teacher` : ""}.`,
  };
}

async function facultyLoad(l: SourceLoader): Promise<SourceResult> {
  const f = (await l.faculty()).filter((x) => x.load > 0), max = l.std.maxFacultyLoadCh;
  const over = f.filter((x) => x.load > max);
  return {
    key: "facultyLoad", title: "Teaching load this semester", columns: ["Teacher", "Credit hours", `Within ${max}`],
    rows: f.map((x) => [x.name, x.load, x.load <= max ? "yes" : "over"]),
    checks: [chk(`Teachers within ${max} credit hours`, f.length - over.length, f.length, "Rebalance the load.", "/coordinator/load-report")],
    gaps: over.map((x) => ({ kind: "overload" as const, text: `${x.name}: ${x.load} credit hours`, href: "/coordinator/load-report" })),
  };
}

async function courseFiles(l: SourceLoader): Promise<SourceResult> {
  const offered = await l.offered();
  const folders = await prisma.courseFolder.findMany({ where: { courseId: { in: offered.map((c) => c.id).concat("none") } }, select: { courseId: true, kept: true, note: true } });
  const kept = new Map(folders.map((x) => [x.courseId, x]));
  const missing = offered.filter((c) => !kept.get(c.id)?.kept);
  return {
    key: "courseFiles", title: "Course folders of offered courses", columns: ["Course", "Instructor", "Folder kept", "Note"],
    rows: offered.map((c) => [`${c.code} ${c.title}`, c.instructor?.name || "—", kept.get(c.id)?.kept ? "yes" : "no", kept.get(c.id)?.note || ""]),
    checks: [chk("Offered courses with a complete folder", offered.length - missing.length, offered.length, "Tick the courses whose folders are kept.", "/coordinator/course-folders")],
    gaps: missing.map((c) => ({ kind: "course-file" as const, text: `${c.code} ${c.title}: no course folder`, href: "/coordinator/course-folders" })),
  };
}

async function curriculum(l: SourceLoader): Promise<SourceResult> {
  const [batches, courses] = await Promise.all([l.batches(), l.courses()]);
  const min = l.std.minCreditHours;
  const per = batches.map((b) => {
    const cs = courses.filter((c) => c.batchId === b.id && !c.isNonCredit);
    return { b, credits: cs.reduce((n, c) => n + c.creditHours, 0), semesters: new Set(cs.map((c) => c.semesterNumber)).size, capstone: cs.filter((c) => c.courseType === "Capstone Project").reduce((n, c) => n + c.creditHours, 0) };
  });
  let coverage: number | null = null;
  try { const h = await computeHecComparison(l.ctx.leadId, "", ""); coverage = h.empty ? null : Math.round(h.coverage as number); } catch { coverage = null; }
  const checks = [chk(`Batches with at least ${min} credit hours`, per.filter((x) => x.credits >= min).length, per.length, "Complete the curriculum.", "/coordinator/courses"),
    chk("Batches spread over 8 semesters", per.filter((x) => x.semesters >= 8).length, per.length, "Place courses in all 8 semesters.", "/coordinator/program-semester-map")];
  if (coverage !== null) checks.push(chk("HEC curriculum covered (%)", coverage, 100, "Add the missing HEC courses or explain the differences.", "/coordinator/hec-comparison"));
  return {
    key: "curriculum", title: "Scheme of studies", columns: ["Batch", "Credit hours", "Semesters", "Final year project (credit hours)"],
    rows: per.map((x) => [`${x.b.degreeProgram} — ${x.b.batchName}`, x.credits, x.semesters, x.capstone]), checks,
    gaps: per.filter((x) => x.credits < min).map((x) => ({ kind: "data" as const, text: `${x.b.batchName}: ${x.credits} credit hours (needs ${min})`, href: "/coordinator/courses" })),
    note: coverage !== null ? `Courses of the newest batch cover ${coverage}% of the HEC curriculum.` : undefined,
  };
}

async function plos(l: SourceLoader): Promise<SourceResult> {
  const [batches, courses] = await Promise.all([l.batches(), l.courses()]);
  const [rows, maps] = await Promise.all([
    prisma.pLO.findMany({ where: { batchId: { in: batches.map((b) => b.id).concat("none") } }, select: { id: true, batchId: true, number: true, status: true } }),
    prisma.coursePloMapping.findMany({ where: { courseId: { in: courses.map((c) => c.id).concat("none") } }, select: { ploId: true } }).catch(() => [] as { ploId: string }[]),
  ]);
  const covered = new Set(maps.map((m) => m.ploId));
  return {
    key: "plos", title: "Program learning outcomes", columns: ["Batch", "GAs", "Approved", "Taught by a course"],
    rows: batches.map((b) => { const mine = rows.filter((r) => r.batchId === b.id); return [b.batchName, mine.length, mine.filter((r) => r.status === "approved").length, mine.filter((r) => covered.has(r.id)).length]; }),
    checks: [chk("Batches with GAs", batches.filter((b) => rows.some((r) => r.batchId === b.id)).length, batches.length, "Write or import the GAs.", "/coordinator/plos"),
      chk("GAs approved", rows.filter((r) => r.status === "approved").length, rows.length, "Send the GAs for approval.", "/coordinator/plos"),
      chk("GAs taught by at least one course", rows.filter((r) => covered.has(r.id)).length, rows.length, "Map courses to every GA.", "/omc/plo-matrix")],
    gaps: [],
  };
}

async function ploAttainment(l: SourceLoader): Promise<SourceResult> {
  const target = l.std.ploTargetPct;
  const recs = await prisma.studentTranscriptRecord.findMany({ where: { coordinatorId: l.ctx.leadId }, select: { termName: true, termYear: true, ploAttainmentJson: true } });
  if (!recs.length) return { key: "ploAttainment", title: "GA attainment", columns: [], rows: [], checks: [chk("Results with GA attainment recorded", 0, 1, "Approve course results so attainment is recorded.", "/results-approval")], gaps: [] };
  const latest = recs.reduce((m, r) => Math.max(m, r.termYear * 2 + (r.termName === "Fall" ? 1 : 0)), 0);
  const agg = new Map<string, { n: number; ok: number }>();
  for (const r of recs.filter((x) => x.termYear * 2 + (x.termName === "Fall" ? 1 : 0) === latest)) {
    let arr: { label: string; passed: boolean }[] = [];
    try { arr = JSON.parse(r.ploAttainmentJson || "[]"); } catch { arr = []; }
    for (const p of arr) { const e = agg.get(p.label) || { n: 0, ok: 0 }; e.n++; if (p.passed) e.ok++; agg.set(p.label, e); }
  }
  const items = Array.from(agg.entries()).map(([label, e]) => ({ label, n: e.n, pct: Math.round((100 * e.ok) / e.n) })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const below = items.filter((x) => x.pct < target);
  const term = `${latest % 2 ? "Fall" : "Spring"} ${Math.floor(latest / 2)}`;
  return {
    key: "ploAttainment", title: `GA attainment, ${term}`, columns: ["PLO", "Student results", "Attained", `Benchmark ${target}%`],
    rows: items.map((x) => [x.label, x.n, `${x.pct}%`, x.pct >= target ? "met" : "below"]),
    checks: [chk(`GAs attained by at least ${target}% of students`, items.length - below.length, items.length, "Plan remediation and CQI actions for the weak GAs.", "/omc/reports/attainment-analytics")],
    gaps: below.map((x) => ({ kind: "plo" as const, text: `${x.label}: ${x.pct}% attained (benchmark ${target}%)`, href: "/omc/reports/attainment-analytics" })),
  };
}

async function results(l: SourceLoader): Promise<SourceResult> {
  const offered = await l.offered();
  const rs = await prisma.courseResult.findMany({ where: { courseId: { in: offered.map((c) => c.id).concat("none") } }, select: { courseId: true, status: true } }).catch(() => [] as { courseId: string; status: string }[]);
  const st = new Map(rs.map((r) => [r.courseId, r.status]));
  const notApproved = offered.filter((c) => st.get(c.id) !== "APPROVED");
  return {
    key: "results", title: "Course results this semester", columns: ["Course", "Instructor", "Result"],
    rows: offered.map((c) => [`${c.code} ${c.title}`, c.instructor?.name || "—", (st.get(c.id) || "not submitted").toLowerCase()]),
    checks: [chk("Course results approved", offered.length - notApproved.length, offered.length, "Follow up the results still waiting.", "/results-approval")],
    gaps: notApproved.slice(0, 30).map((c) => ({ kind: "result" as const, text: `${c.code}: result ${(st.get(c.id) || "not submitted").toLowerCase()}`, href: "/results-approval" })),
  };
}

async function surveys(l: SourceLoader): Promise<SourceResult> {
  const since = new Date(Date.now() - YEAR_MS);
  const rows = await prisma.surveyResult.findMany({ where: { leadId: l.ctx.leadId } as never, orderBy: { surveyDate: "desc" }, take: 40 }).catch(() => [] as { kind: string; surveyDate: Date; respondents: number; avgRating: number | null; findings: string | null; actionTaken: string | null }[]);
  const recent = (k: string) => rows.some((r) => r.kind === k && r.surveyDate >= since);
  return {
    key: "surveys", title: "Stakeholder surveys", columns: ["Survey", "Date", "Respondents", "Average rating", "Findings", "Action taken"],
    rows: rows.map((r) => [r.kind.toLowerCase(), day(r.surveyDate), r.respondents, r.avgRating ?? "—", r.findings || "—", r.actionTaken || "—"]),
    checks: [chk("Alumni, employer and student surveys in the last 12 months", ["ALUMNI", "EMPLOYER", "STUDENT"].filter(recent).length, 3, "Run and record the missing surveys.", "/outcomes"),
      chk("Surveys with the action taken written", rows.filter((r) => r.actionTaken?.trim()).length, rows.length, "Write what was done about each survey's findings.", "/outcomes")],
    gaps: [],
  };
}

async function outcomes(l: SourceLoader): Promise<SourceResult> {
  const rows = await prisma.outcomeFigure.findMany({ where: { leadId: l.ctx.leadId } as never, orderBy: { intakeYear: "desc" } }).catch(() => [] as { intakeYear: number; admitted: number; graduated: number; graduatedOnTime: number; droppedOut: number }[]);
  return {
    key: "outcomes", title: "Intake and graduation figures", columns: ["Intake year", "Admitted", "Graduated", "On time", "Dropped out"],
    rows: rows.map((r) => [r.intakeYear, r.admitted, r.graduated, r.graduatedOnTime, r.droppedOut]),
    checks: [chk("Intake years with figures recorded (3 are asked for)", rows.length, 3, "Enter the figures under Graduation & Surveys.", "/outcomes")], gaps: [],
  };
}

async function studentSupport(l: SourceLoader): Promise<SourceResult> {
  const batches = await l.batches(), offered = await l.offered();
  const since = new Date(Date.now() - YEAR_MS);
  const [counselling, sections, enrolled] = await Promise.all([
    prisma.programEvidence.count({ where: { coordinatorId: l.ctx.leadId, area: "COUNSELLING", OR: [{ date: null }, { date: { gte: since } }] } }),
    prisma.courseSectionAssignment.groupBy({ by: ["courseId"], where: { courseId: { in: offered.map((c) => c.id).concat("none") } }, _sum: { sectionCount: true } }),
    prisma.studentEnrollment.groupBy({ by: ["courseId"], where: { courseId: { in: offered.map((c) => c.id).concat("none") }, status: "ACTIVE" }, _count: { _all: true } }),
  ]);
  const secOf = new Map(sections.map((s) => [s.courseId, s._sum.sectionCount || 0]));
  const sized = enrolled.map((e) => ({ id: e.courseId, students: e._count._all, secs: Math.max(1, secOf.get(e.courseId) || 1) }));
  const max = l.std.maxClassSize;
  return {
    key: "studentSupport", title: "Advising and class sizes", columns: ["Batch", "Advisor named", "Students"],
    rows: batches.map((b) => [b.batchName, b.advisorId ? "yes" : "no", b.studentCount]),
    checks: [chk("Batches with an advisor", batches.filter((b) => b.advisorId).length, batches.length, "Name an advisor for each batch.", "/coordinator/batches"),
      chk("Counselling sessions recorded in the last 12 months (4 are usual)", counselling, 4, "Record the sessions held.", "/coordinator/evidence"),
      chk(`Offered courses with at most ${max} students per section`, sized.filter((x) => x.students / x.secs <= max).length, sized.length, "Open more sections.", "/coordinator/load-report")],
    gaps: batches.filter((b) => !b.advisorId).map((b) => ({ kind: "data" as const, text: `${b.batchName}: no advisor`, href: "/coordinator/batches" })),
  };
}

async function lab(l: SourceLoader): Promise<SourceResult> {
  const r = await labRatio(l.ctx.chairmanId, l.ctx.departmentId);
  const per = l.std.maxStudentsPerComputer, need = Math.max(Math.ceil(r.students / per), 1);
  const gaps: Gap[] = r.working < need ? [{ kind: "lab", text: `${r.working} working computers for ${r.students} students (needs ${need} at ${per} per computer)`, href: "/lab-inventory" }] : [];
  return {
    key: "lab", title: "Labs and computers", columns: ["Labs", "Computers", "Working", "Seats", "Students", "Students per working computer"],
    rows: [[r.labs, r.computers, r.working, r.seats, r.students, r.perComputer ?? "—"]],
    checks: [chk("Labs recorded by the Lab Manager", Math.min(r.labs, 1), 1, "Ask the Lab Manager to enter the labs.", "/lab-inventory"),
      chk(`Working computers: 1 for every ${per} students (needs ${need})`, r.working, need, "Repair or add computers.", "/lab-inventory")],
    gaps,
  };
}

async function library(l: SourceLoader): Promise<SourceResult> {
  const [info, reqs] = await Promise.all([
    prisma.libraryInfo.findUnique({ where: { chairmanId: l.ctx.chairmanId } }).catch(() => null),
    prisma.libraryRequisition.groupBy({ by: ["status"], where: { chairmanId: l.ctx.chairmanId }, _count: { _all: true } }).catch(() => [] as { status: string; _count: { _all: number } }[]),
  ]);
  return {
    key: "library", title: "Library", columns: ["Titles", "Volumes", "Printed journals", "E-books", "Digital libraries", "Librarian", "Last stock check"],
    rows: info ? [[info.totalTitles, info.totalVolumes, info.printJournals, info.ebooks, info.databases || "—", info.hasLibrarian ? "yes" : "no", day(info.lastStockCheck)]] : [],
    checks: [chk("Library record filled in", info ? 1 : 0, 1, "Ask the Librarian to enter the library record.", "/library-inventory"),
      chk("Library stock checked in the last 12 months", info?.lastStockCheck && info.lastStockCheck.getTime() > Date.now() - YEAR_MS ? 1 : 0, 1, "Record the stock check.", "/library-inventory"),
      chk("Textbook requisitions recorded", Math.min(reqs.map((r) => r._count._all).reduce((x, y) => x + y, 0), 1), 1, "The Librarian records the textbooks ordered.", "/library/requisitions")],
    gaps: [], note: reqs.length ? `Requisitions: ${reqs.map((r) => `${r._count._all} ${r.status.toLowerCase()}`).join(", ")}.` : undefined,
  };
}

async function finance(l: SourceLoader): Promise<SourceResult> {
  const fy = fiscalYearNow();
  const rows = await prisma.financeEntry.findMany({ where: { chairmanId: l.ctx.chairmanId, fiscalYear: fy, kind: "BUDGET" }, select: { category: true, amount: true } });
  const has = (cat: string) => rows.some((r) => r.category === cat && r.amount > 0);
  return {
    key: "finance", title: `Budget ${fy}`, columns: ["Head", "Amount"], rows: rows.map((r) => [r.category, r.amount.toLocaleString()]),
    checks: [chk(`Budget set for ${fy}`, rows.some((r) => r.amount > 0) ? 1 : 0, 1, "The Finance Officer enters the budget.", "/chairman/finance"),
      chk("Lab, library, faculty development and research budgets set", ["Laboratory equipment and upgrades", "Library and digital resources", "Faculty development and training", "Research and grants"].filter(has).length, 4, "Set a budget under each head.", "/chairman/finance")],
    gaps: [],
  };
}

async function cqi(l: SourceLoader): Promise<SourceResult> {
  const [batches, courses] = await Promise.all([l.batches(), l.courses()]);
  const rows = await prisma.cqiRecord.findMany({
    where: { chairmanId: l.ctx.chairmanId, OR: [{ batchId: { in: batches.map((b) => b.id).concat("none") } }, { courseId: { in: courses.map((c) => c.id).concat("none") } }] },
    orderBy: { createdAt: "desc" }, take: 60, select: { finding: true, actionTaken: true, status: true, sourceType: true, createdAt: true },
  });
  const closed = rows.filter((r) => r.status.startsWith("verified") || r.status === "closed");
  const noAction = rows.filter((r) => !r.actionTaken?.trim() && !closed.includes(r));
  return {
    key: "cqi", title: "CQI findings and actions", columns: ["Finding", "Source", "Action taken", "Status", "Logged"],
    rows: rows.map((r) => [r.finding, r.sourceType || "—", r.actionTaken || "—", r.status, day(r.createdAt)]),
    checks: [chk("CQI findings closed", closed.length, rows.length, "Follow up and close the open findings.", "/chairman/cqi"), chk("Findings with an action written", rows.length - noAction.length, rows.length, "Write the action for each finding.", "/chairman/cqi")],
    gaps: noAction.slice(0, 20).map((r) => ({ kind: "cqi" as const, text: `No action yet: ${r.finding.slice(0, 80)}`, href: "/chairman/cqi" })),
  };
}

async function industry(l: SourceLoader): Promise<SourceResult> {
  const since = new Date(Date.now() - YEAR_MS);
  const ev = await prisma.programEvidence.findMany({ where: { coordinatorId: l.ctx.leadId, area: { in: ["INDUSTRY", "INTERNSHIP"] } }, select: { area: true, kind: true, title: true, organization: true, date: true } });
  const k = (kind: string) => ev.filter((e) => e.kind === kind);
  return {
    key: "industry", title: "Industry linkages", columns: ["Kind", "Title", "Organisation", "Date"],
    rows: ev.map((e) => [e.kind, e.title, e.organization || "—", day(e.date)]),
    checks: [chk("Advisory board members (3 are usual)", k("Advisory board member").length, 3, "Record the members.", "/coordinator/evidence"),
      chk("Advisory board meeting in the last 12 months", k("Advisory board meeting").filter((e) => !e.date || e.date >= since).length, 1, "Hold and record a meeting.", "/coordinator/evidence"),
      chk("MoUs or agreements with industry", k("MoU / agreement").length, 1, "Record the agreements.", "/coordinator/evidence"),
      chk("Internships recorded", ev.filter((e) => e.area === "INTERNSHIP").length, 1, "Record where students did internships.", "/coordinator/evidence")],
    gaps: [],
  };
}

async function meetings(l: SourceLoader): Promise<SourceResult> {
  const since = new Date(Date.now() - YEAR_MS);
  const rows = await prisma.meetingMinutes.findMany({ where: { chairmanId: l.ctx.chairmanId, OR: [{ leadId: l.ctx.leadId }, { leadId: null }] }, orderBy: { meetingDate: "desc" }, take: 40, select: { kind: true, title: true, meetingDate: true, fileName: true } });
  const statutory = rows.filter((r) => ["BOS", "ACADEMIC_COUNCIL", "SENATE", "SYNDICATE", "BPF", "FACULTY"].includes(r.kind) && r.meetingDate >= since);
  return {
    key: "meetings", title: "Meetings and minutes", columns: ["Meeting", "Title", "Date", "Minutes attached"],
    rows: rows.map((r) => [MEETING_KINDS[r.kind] || r.kind, r.title, day(r.meetingDate), r.fileName ? "yes" : "no"]),
    checks: [chk("Statutory or faculty meetings in the last 12 months", Math.min(statutory.length, 2), 2, "Record the meetings with their minutes.", "/meetings")], gaps: [],
  };
}

async function facilities(l: SourceLoader): Promise<SourceResult> {
  const rooms = await prisma.facilityRoom.findMany({ where: { chairmanId: l.ctx.chairmanId, ...(l.ctx.departmentId ? { OR: [{ departmentId: l.ctx.departmentId }, { departmentId: null }] } : {}) }, select: { roomType: true, capacity: true, multimedia: true } }).catch(() => [] as { roomType: string; capacity: number | null; multimedia: boolean }[]);
  const types = new Map<string, { n: number; seats: number; mm: number }>();
  for (const r of rooms) { const t = types.get(r.roomType) || { n: 0, seats: 0, mm: 0 }; t.n++; t.seats += r.capacity || 0; if (r.multimedia) t.mm++; types.set(r.roomType, t); }
  return {
    key: "facilities", title: "Rooms", columns: ["Type", "Rooms", "Seats", "With multimedia"], rows: Array.from(types.entries()).map(([k, t]) => [k, t.n, t.seats, t.mm]),
    checks: [chk("Rooms recorded by the Facilities Manager", Math.min(rooms.length, 1), 1, "Ask the Facilities Manager to enter the rooms.", "/facilities")], gaps: [],
  };
}

async function readinessFor(l: SourceLoader, def: TaskDef): Promise<SourceResult | null> {
  if (l.ctx.body !== "NCEAC" || !def.criterion) return null;
  const r = await l.readiness();
  const area = r?.areas.find((a) => a.no === def.criterion);
  if (!area) return null;
  return {
    key: "readiness", title: `NCEAC criterion ${area.no}: ${area.title}`, columns: ["Check", "Done", "Of"],
    rows: area.checks.map((c) => [c.label, c.done, c.total]), checks: area.checks.filter((c) => c.total > 0), gaps: [],
    note: area.manual.length ? `Also kept on paper: ${area.manual.join("; ")}.` : undefined,
  };
}

async function nbeacFor(l: SourceLoader, def: TaskDef): Promise<SourceResult | null> {
  if (l.ctx.body !== "NBEAC" || !def.sarForm) return null;
  const doc = await l.nbeac();
  const form = doc?.forms.find((f) => f.key === def.sarForm);
  if (!form) return { key: "nbeac", title: "NBEAC SAR", columns: [], rows: [], checks: [chk("Program in a department with an NBEAC SAR", 0, 1, "Give the program a department.", "/chairman/departments")], gaps: [] };
  const items = form.items.filter((it) => !def.sarCodes || def.sarCodes.test(it.code));
  const counted = items.filter((it) => it.status !== "restricted");
  const filled = counted.filter((it) => it.status === "filled");
  return {
    key: "nbeac", title: `${form.title} — SAR items`, columns: ["Item", "Question", "Status"],
    rows: items.map((it) => [it.code, it.question, it.status === "filled" ? "filled" : it.status === "restricted" ? "confidential" : "missing"]),
    checks: [chk(`SAR items of ${form.title.replace(/^Form \d: /, "")} filled`, filled.length, counted.length, "Fill in the missing items under Accreditation Data.", `/accreditation/nbeac?dept=${l.ctx.departmentId}&form=${def.sarForm}`)],
    gaps: counted.filter((it) => it.status === "missing").slice(0, 20).map((it) => ({ kind: "data" as const, text: `${it.code}: ${it.question}`, href: it.fill || "/accreditation" })),
  };
}

const SOURCES: Partial<Record<SourceKey, (l: SourceLoader) => Promise<SourceResult>>> = {
  faculty, facultyLoad, courseFiles, curriculum, plos, ploAttainment, results, surveys, outcomes, studentSupport, lab, library, finance, cqi, industry, meetings, facilities,
};

/** Whether the system can fill in this kind of data. */
export const handlesSource = (key: SourceKey) => key === "readiness" || key === "nbeac" || !!SOURCES[key];

/** Everything the system fills in for one task. */
export async function sourcesForTask(l: SourceLoader, def: TaskDef): Promise<SourceResult[]> {
  const out: SourceResult[] = [];
  for (const key of def.sources) {
    try {
      const r = key === "readiness" ? await readinessFor(l, def) : key === "nbeac" ? await nbeacFor(l, def) : SOURCES[key] ? await SOURCES[key]!(l) : null;
      if (r) out.push(r);
    } catch (e) {
      console.error("accreditation source", key, (e as Error).message);
      out.push({ key, title: key, columns: [], rows: [], checks: [], gaps: [], note: "This part couldn't be worked out just now." });
    }
  }
  return out;
}

/** How complete the data behind a task is (0–100), from the checks its sources settle; null when nothing is checkable. */
export function dataScore(results: SourceResult[]): number | null {
  const checks = results.flatMap((r) => r.checks).filter((c) => c.total > 0);
  return checks.length ? Math.round((checks.reduce((n, c) => n + c.done / c.total, 0) / checks.length) * 100) : null;
}
