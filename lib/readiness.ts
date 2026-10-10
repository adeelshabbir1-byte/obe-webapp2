import { effectiveSum } from "./assessmentWeights";
import { prisma } from "./db";
import { completeness } from "./facultyProfile";
import { fiscalYearNow, labRatio } from "./resources";
import { computeHecComparison } from "./hecCompare";

// How ready one program is for an outcome-based accreditation review, counted live from that Program Lead's records.
export type State = "ok" | "partial" | "missing" | "na";
export type Check = { label: string; done: number; total: number; hint: string; href: string };
export type Criterion = { no: number; title: string; checks: Check[]; manual: string[] };

export const pct = (c: Check) => (c.total === 0 ? null : Math.round((c.done / c.total) * 100));
// NCEAC compliance levels (Accreditation Manual, Annexure A): G Good (exceeds compliance), S Satisfactory (compliant),
// C Concern (complies with room for improvement), W Weakness (partially compliant), D Deficient (not compliant).
// The manual gives the words, not percentages: the score bands below are this system's indicative reading.
export const RATINGS = [
  { code: "G", name: "Good", min: 90, colour: "#1B6B3A" }, { code: "S", name: "Satisfactory", min: 75, colour: "#4F9A5E" },
  { code: "C", name: "Concern", min: 60, colour: "#C9A227" }, { code: "W", name: "Weakness", min: 40, colour: "#D9822B" },
  { code: "D", name: "Deficient", min: 0, colour: "#B3261E" },
];
export const NOT_MEASURED = { code: "X", name: "Not measured here", colour: "#9AA0A6" };
export const rate = (p: number | null) => (p === null ? NOT_MEASURED : RATINGS.find((r) => p >= r.min)!);
export const colour = (p: number | null) => rate(p).colour;
export const word = (p: number | null) => rate(p).name;
export const STATE_COLOUR: Record<State, string> = { ok: "#2E7D4F", partial: "#C58A12", missing: "#B3261E", na: "#D5D8DC" };
export const STATE_TEXT: Record<State, string> = { ok: "Done", partial: "Partly done", missing: "Missing", na: "Not applicable yet" };

export async function computeReadiness(user: { id: string; managedById: string | null; departmentId: string | null }, batchIdParam: string) {
  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const batchId = batchIdParam && batches.some((b) => b.id === batchIdParam) ? batchIdParam : "";
  const scopeBatches = batchId ? batches.filter((b) => b.id === batchId) : batches;
  const batchIds = scopeBatches.map((b) => b.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: user.id, ...(batchId ? { batchId } : {}) },
    select: { id: true, code: true, title: true, isOffered: true, subjectExpertId: true, instructorId: true, batchId: true, isNonCredit: true, quizBestOf: true, assignmentBestOf: true },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
  });
  const courseIds = courses.map((c) => c.id);
  const inCourses = { courseId: { in: courseIds.length ? courseIds : ["none"] } };

  const chairmanId = user.managedById || "none";
  const [profile, plos, clos, seRows, instRows, instruments, marks, ploMaps, papers, cqi, templates, rooms, employers, alumni, faculty, studentCount, courseMeta] = await Promise.all([
    prisma.programProfile.findMany({ where: { coordinatorId: user.id } }),
    prisma.pLO.findMany({ where: { coordinatorId: user.id, ...(batchId ? { batchId } : {}) }, select: { id: true, status: true, batchId: true } }),
    prisma.cLO.findMany({ where: { ...inCourses, source: "SE" }, select: { courseId: true, mappedPloId: true } }),
    prisma.lectureRow.findMany({ where: { ...inCourses, source: "SE" }, select: { courseId: true, cloId: true, week: true } }),
    prisma.lectureRow.findMany({ where: { ...inCourses, source: "INSTRUCTOR" }, select: { courseId: true, actualDate: true } }),
    prisma.assessmentInstrument.findMany({ where: { ...inCourses, source: "SE" }, select: { courseId: true, marksPct: true, type: true } }),
    prisma.studentMark.groupBy({ by: ["courseId"], where: inCourses, _count: { _all: true } }),
    prisma.coursePloMapping.findMany({ where: inCourses, select: { ploId: true } }),
    prisma.paperSubmission.findMany({ where: { leadCourseId: { in: courseIds.length ? courseIds : ["none"] } }, select: { status: true } }),
    prisma.cqiRecord.findMany({ where: { chairmanId: user.managedById || "none", OR: [{ courseId: { in: courseIds.length ? courseIds : ["none"] } }, { batchId: { in: batchIds.length ? batchIds : ["none"] } }] }, select: { status: true } }),
    prisma.surveyTemplate.findMany({ where: { coordinatorId: user.id }, select: { stakeholderType: true, responses: { where: { submittedAt: { not: null } }, select: { id: true } } } }),
    prisma.room.findMany({ where: { chairmanId }, select: { type: true } }),
    prisma.employer.count({ where: { chairmanId, status: "APPROVED" } }),
    prisma.alumni.count({ where: { chairmanId, status: "APPROVED" } }),
    prisma.user.findMany({ where: { managedById: user.id, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] }, isVisitingPlaceholder: false, isActive: true }, select: { id: true, normalLoad: true } }),
    prisma.student.count({ where: { batchId: { in: batchIds.length ? batchIds : ["none"] } } }),
    prisma.course.findMany({ where: { coordinatorId: user.id, ...(batchId ? { batchId } : {}) }, select: { id: true, batchId: true, creditHours: true, semesterNumber: true, courseType: true, isNonCredit: true, instructorId: true, isOffered: true } }),
  ]);
  const yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const [activities, ratio, finance, library, pcSpecs] = await Promise.all([
    prisma.activityLog.findMany({ where: { coordinatorId: user.id, activityDate: { gte: yearAgo } }, select: { category: true } }),
    labRatio(chairmanId, user.departmentId || null),
    prisma.financeEntry.findMany({ where: { chairmanId, fiscalYear: fiscalYearNow(), kind: "BUDGET" }, select: { category: true, amount: true } }),
    prisma.libraryInfo.findUnique({ where: { chairmanId } }),
    prisma.labComputerSpec.findMany({ where: { chairmanId, ...(user.departmentId ? { labId: { in: (await prisma.labInfo.findMany({ where: { chairmanId, departmentId: user.departmentId }, select: { id: true } })).map((l) => l.id) } } : {}) }, select: { quantity: true, ramGb: true, purchaseYear: true } }),
  ]);
  const budgetOf = (cat: string) => finance.find((x) => x.category === cat)?.amount || 0;
  const facultyIds = faculty.map((f) => f.id);
  const [facProfiles, facEdu] = await Promise.all([
    prisma.facultyProfile.findMany({ where: { userId: { in: facultyIds.length ? facultyIds : ["none"] } }, select: { userId: true, employmentType: true, photo: true, designation: true, dateOfJoining: true, bloodGroup: true, phone: true, nextOfKinName: true, nextOfKinPhone: true } }),
    prisma.facultyRecord.findMany({ where: { userId: { in: facultyIds.length ? facultyIds : ["none"] }, kind: "EDUCATION" }, select: { userId: true, title: true } }),
  ]);

  // ---- one traffic light per course and per requirement ----
  const by = <T extends { courseId: string }>(rows: T[]) => { const m = new Map<string, T[]>(); rows.forEach((r) => m.set(r.courseId, [...(m.get(r.courseId) || []), r])); return m; };
  const cloBy = by(clos), seBy = by(seRows), instBy = by(instRows), insBy = by(instruments);
  const markCount = new Map<string, number>((marks as { courseId: string; _count: { _all: number } }[]).map((m) => [m.courseId, m._count._all] as [string, number]));
  const share = (done: number, total: number): State => (total === 0 ? "missing" : done === total ? "ok" : done > 0 ? "partial" : "missing");

  const COLS = [
    { key: "clos", label: "CLOs written" }, { key: "plo", label: "CLOs linked to PLOs" }, { key: "plan", label: "Lecture plan" },
    { key: "link", label: "Plan linked to CLOs" }, { key: "assess", label: "Assessments add to 100%" }, { key: "se", label: "Subject Expert" },
    { key: "inst", label: "Instructor" }, { key: "deliv", label: "Delivery logged" }, { key: "marks", label: "Marks entered" },
  ] as const;
  type Col = (typeof COLS)[number]["key"];
  const grid = courses.map((c) => {
    const cl = cloBy.get(c.id) || [], se = seBy.get(c.id) || [], ins = instBy.get(c.id) || [], as = insBy.get(c.id) || [];
    // With "best K of N" quizzes or assignments only the best K count, so those categories add up to their share scaled by K / N.
    const sumPct = Math.round(Array.from(new Set(as.map((a) => (a as unknown as { type: string }).type))).reduce((s, t) => {
      const w = as.filter((a) => (a as unknown as { type: string }).type === t).map((a) => a.marksPct);
      const k = t === "Quiz" ? (c as unknown as { quizBestOf: number | null }).quizBestOf : t === "Assignment" ? (c as unknown as { assignmentBestOf: number | null }).assignmentBestOf : null;
      return s + effectiveSum(w, k);
    }, 0) * 100) / 100;
    const delivered = ins.filter((r) => r.actualDate).length;
    const st: Record<Col, State> = {
      clos: cl.length > 0 ? "ok" : "missing",
      plo: cl.length === 0 ? "missing" : share(cl.filter((x) => x.mappedPloId).length, cl.length),
      plan: se.length > 0 ? "ok" : "missing",
      link: se.length === 0 ? "missing" : share(se.filter((r) => r.cloId).length, se.length),
      assess: sumPct === 100 ? "ok" : sumPct > 0 ? "partial" : "missing",
      se: c.subjectExpertId ? "ok" : "missing",
      inst: !c.isOffered ? "na" : c.instructorId ? "ok" : "missing",
      deliv: !c.isOffered ? "na" : se.length === 0 ? "missing" : delivered / se.length >= 0.9 ? "ok" : delivered > 0 ? "partial" : "missing",
      marks: !c.isOffered ? "na" : (markCount.get(c.id) || 0) > 0 ? "ok" : "missing",
    };
    return { c, st };
  });
  const colCheck = (key: Col, label: string, hint: string, href: string): Check => {
    const app = grid.filter((g) => g.st[key] !== "na");
    const score = app.reduce((s, g) => s + (g.st[key] === "ok" ? 1 : g.st[key] === "partial" ? 0.5 : 0), 0);
    return { label, done: Math.round(score * 10) / 10, total: app.length, hint, href };
  };

  const prof = profile[0];
  let peoCount = 0; try { peoCount = prof?.peos ? (JSON.parse(prof.peos) as unknown[]).filter(Boolean).length : 0; } catch { peoCount = 0; }
  const coveredPlos = new Set<string>([...ploMaps.map((m) => m.ploId), ...clos.map((x) => x.mappedPloId).filter((x): x is string => !!x)]);
  const surveyOf = (t: string) => templates.filter((x) => x.stakeholderType === t).reduce((n, x) => n + x.responses.length, 0);
  const closedCqi = cqi.filter((x) => ["closed", "verified-effective"].includes(x.status)).length;
  const approvedPapers = papers.filter((p) => p.status === "APPROVED").length;

  // Curriculum facts per batch
  const perBatch = scopeBatches.map((b) => {
    const cs = courseMeta.filter((c) => c.batchId === b.id);
    return {
      credits: cs.filter((c) => !c.isNonCredit).reduce((n, c) => n + c.creditHours, 0),
      semesters: new Set(cs.map((c) => c.semesterNumber).filter(Boolean)).size,
      capstone: cs.some((c) => c.courseType === "Capstone Project"),
      genEd: cs.some((c) => c.courseType === "General Education"),
    };
  });
  const maxWeek = new Map<string, number>();
  seRows.forEach((r) => maxWeek.set(r.courseId, Math.max(maxWeek.get(r.courseId) || 0, r.week)));
  const coursesWith15 = courses.filter((c) => (maxWeek.get(c.id) || 0) >= 15).length;

  // Faculty facts
  const profOf = new Map(facProfiles.map((p) => [p.userId, p]));
  const eduOf = (id: string) => facEdu.filter((e) => e.userId === id);
  const facComplete = faculty.filter((f) => completeness(profOf.get(f.id) || null, eduOf(f.id).length) >= 80).length;
  const terminal = faculty.filter((f) => eduOf(f.id).some((e) => /ph\.?\s?d|doctor|\bm\.?\s?phil|\bms\b|\bmasters?\b/i.test(e.title))).length;
  const loadOk = faculty.filter((f) => courseMeta.filter((c) => c.isOffered && c.instructorId === f.id).length <= f.normalLoad).length;
  const labs = rooms.filter((r) => r.type === "LAB").length, lectureRooms = rooms.filter((r) => r.type === "LECTURE").length;

  // Evidence kept by the Program Lead, course folders and office hours
  const evSince = new Date(Date.now() - 365 * 86400000);
  const [evidence, folders, officeProfiles] = await Promise.all([
    prisma.programEvidence.findMany({ where: { coordinatorId: user.id }, select: { area: true, kind: true, date: true, count: true, target: true, actual: true } }),
    prisma.courseFolder.findMany({ where: { coordinatorId: user.id, kept: true }, select: { courseId: true } }),
    prisma.facultyProfile.findMany({ where: { userId: { in: faculty.map((f) => f.id) } }, select: { userId: true, officeHours: true } }),
  ]);
  const recent = (x: { date: Date | null }) => !x.date || x.date >= evSince;
  const ev = (area: string, kind?: string) => evidence.filter((e) => e.area === area && (!kind || e.kind === kind));
  const offeredIds = new Set(courseMeta.filter((c) => c.isOffered).map((c) => c.id));
  const foldersKept = folders.filter((f) => offeredIds.has(f.courseId)).length;
  const withOfficeHours = officeProfiles.filter((p) => p.officeHours?.trim()).length;
  const kpis = ev("PEO", "KPI");
  const peoReviewGroups = new Set(ev("PEO").filter((e) => e.kind.startsWith("Review") && recent(e)).map((e) => e.kind)).size;
  const teachingStudents = scopeBatches.reduce((n, b) => n + b.studentCount, 0);

  // Admission criteria set by the Dean for this lead's program(s)
  const leadRow = await prisma.user.findUnique({ where: { id: user.id }, select: { leadProgram: true, department_: { select: { facultyId: true } } } });
  const admissionPrograms = Array.from(new Set([...(leadRow?.leadProgram ? [leadRow.leadProgram] : []), ...scopeBatches.map((b) => b.degreeProgram)]));
  const admissionSet = admissionPrograms.length
    ? (await prisma.admissionCriteria.findMany({ where: { chairmanId: user.managedById || "none", scopeKey: leadRow?.department_?.facultyId || "INSTITUTE", degreeProgram: { in: admissionPrograms } }, select: { degreeProgram: true, minPercentage: true, requiredSubjects: true, entryTest: true, seats: true } }))
        .filter((c) => c.minPercentage !== null || c.requiredSubjects || c.entryTest || c.seats !== null).length
    : 0;

  const [outcomeRows, surveyRows] = await Promise.all([
    prisma.outcomeFigure.findMany({ where: { leadId: user.id } as never, select: { intakeYear: true, admitted: true, graduated: true } }),
    prisma.surveyResult.findMany({ where: { leadId: user.id, surveyDate: { gte: yearAgo } } as never, select: { kind: true } }),
  ]) as unknown as [{ intakeYear: number; admitted: number; graduated: number }[], { kind: string }[]];
  const surveyKinds = new Set(surveyRows.map((s) => s.kind));

  // ---- extra facts for the official NCEAC criteria (Accreditation Manual, 2nd edition, 2023) ----
  const fyNow = fiscalYearNow();
  const prevFy = (() => { const y = parseInt(fyNow.slice(0, 4), 10) - 1; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; })();
  const thisYear = new Date().getFullYear();
  const offeredList = courseMeta.filter((c) => c.isOffered);
  const [prevBudget, sections, labEngineers, facRecords, hec, admissionRows] = await Promise.all([
    prisma.financeEntry.findMany({ where: { chairmanId, fiscalYear: prevFy, kind: "BUDGET" }, select: { amount: true } }),
    prisma.courseSectionAssignment.findMany({ where: { courseId: { in: offeredList.length ? offeredList.map((c) => c.id) : ["none"] } }, select: { courseId: true, sectionCount: true } }),
    prisma.user.count({ where: { role: "LAB_ENGINEER", managedById: user.id, isActive: true } }),
    prisma.facultyRecord.findMany({ where: { userId: { in: facultyIds.length ? facultyIds : ["none"] }, kind: { in: ["PUBLICATION", "GRANT", "PROJECT"] } }, select: { userId: true, kind: true, startYear: true } }),
    computeHecComparison(user.id, batchId, ""),
    prisma.admissionCriteria.findMany({ where: { chairmanId, scopeKey: (await prisma.user.findUnique({ where: { id: user.id }, select: { department_: { select: { facultyId: true } } } }))?.department_?.facultyId || "INSTITUTE", degreeProgram: { in: admissionPrograms.length ? admissionPrograms : ["none"] } }, select: { minPercentage: true, transferPolicy: true } }),
  ]);
  const fullTime = faculty.filter((f) => !["Visiting", "Part-time"].includes(profOf.get(f.id)?.employmentType || "")).length;
  const visiting = faculty.filter((f) => profOf.get(f.id)?.employmentType === "Visiting").length;
  const fte = fullTime + Math.min(visiting * 0.25, 1);
  const phd = faculty.filter((f) => eduOf(f.id).some((e) => /ph\.?\s?d|doctor/i.test(e.title))).length;
  const loadWithinNine = faculty.filter((f) => offeredList.filter((c) => c.instructorId === f.id && !c.isNonCredit).reduce((n, c) => n + c.creditHours, 0) <= 9).length;
  const researchers = new Set(facRecords.map((r) => r.userId)).size;
  const recentPapers = facRecords.filter((r) => r.kind === "PUBLICATION" && (r.startYear || 0) >= thisYear - 2).length;
  const sectionsOf = new Map<string, number>();
  sections.forEach((s) => sectionsOf.set(s.courseId, (sectionsOf.get(s.courseId) || 0) + s.sectionCount));
  const sized = offeredList.map((c) => ({ secs: sectionsOf.get(c.id) || 0, students: scopeBatches.find((b) => b.id === c.batchId)?.studentCount || 0 })).filter((x) => x.secs > 0 && x.students > 0);
  const classOk = sized.filter((x) => x.students / x.secs <= 50).length;
  const semLoads = scopeBatches.map((b) => {
    const cs = courseMeta.filter((c) => c.batchId === b.id && !c.isNonCredit);
    return Array.from({ length: 8 }, (_, i) => cs.filter((c) => c.semesterNumber === i + 1).reduce((n, c) => n + c.creditHours, 0));
  });
  const semInRange = semLoads.flat().filter((x) => x >= 15 && x <= 18).length;
  const capstoneOk = scopeBatches.filter((b) => courseMeta.filter((c) => c.batchId === b.id && c.courseType === "Capstone Project").reduce((n, c) => n + c.creditHours, 0) >= 6).length;
  const curBudgetTotal = finance.reduce((n, x) => n + x.amount, 0), prevBudgetTotal = prevBudget.reduce((n, x) => n + x.amount, 0);
  const studentsAll = Math.max(ratio.students, teachingStudents);
  const roomsNeeded = Math.max(Math.ceil(studentsAll / 200) * 3, 1);
  const stationsNeeded = Math.max(Math.ceil(ratio.students / 3), 1);
  const q = (kind: string) => ev("QUALITY", kind);
  const hecCoverage = hec.empty ? null : hec.coverage;
  const minAdmission = admissionRows.filter((r) => r.minPercentage !== null && (r.minPercentage as number) >= 50).length;
  const transferSet = admissionRows.filter((r) => !!r.transferPolicy?.trim()).length;
  const EV = "/coordinator/evidence";

  const areas: Criterion[] = [
    { no: 1, title: "Program Objectives (POs)", manual: ["POs approved by the university's statutory body (Board of Studies / Academic Council): keep the minutes", "POs published (website or prospectus) and shown to be consistent with the institution's mission and the needs of stakeholders"], checks: [
      { label: "Vision written", done: prof?.departmentVision?.trim() ? 1 : 0, total: 1, hint: "Fill in the vision on the Program Document page.", href: "/coordinator/program-profile" },
      { label: "Mission written", done: prof?.departmentMission?.trim() ? 1 : 0, total: 1, hint: "Fill in the mission on the Program Document page.", href: "/coordinator/program-profile" },
      { label: "POs written (3 are usual)", done: Math.min(peoCount, 3), total: 3, hint: "Add the POs on the Program Document page.", href: "/coordinator/program-profile" },
      { label: "KPIs set for measuring PO attainment (1.b)", done: Math.min(kpis.length, 1), total: 1, hint: "Add the key performance indicators under Accreditation Evidence, PEO review & KPIs.", href: EV },
      { label: "KPIs that met their target", done: kpis.filter((k) => k.target !== null && k.actual !== null && (k.actual as number) >= (k.target as number)).length, total: Math.max(kpis.length, 1), hint: "Work on the indicators that fall short.", href: EV },
      { label: "PO reviews in the last 12 months (1.c)", done: Math.min(ev("PEO").filter((e) => e.kind.startsWith("Review") && recent(e)).length, 1), total: 1, hint: "Record each review of the POs.", href: EV },
      { label: "Alumni, faculty and industry all took part in forming or reviewing the POs (1.d)", done: ["Review by alumni", "Review by faculty", "Review by industry"].filter((k) => ev("PEO", k).length > 0).length, total: 3, hint: "Record a review by each of the three groups.", href: EV },
      { label: "Alumni survey answered", done: surveyOf("ALUMNI") > 0 ? 1 : 0, total: 1, hint: "Send the alumni survey.", href: "/coordinator/surveys" },
      { label: "Employer survey answered", done: surveyOf("EMPLOYER") > 0 ? 1 : 0, total: 1, hint: "Send the employer survey.", href: "/coordinator/surveys" },
    ] },
    { no: 2, title: "Graduate Attributes (GAs)", manual: ["GAs cover the Seoul Accord GA-1 to GA-10 and are adopted by the university's statutory body", "Documented process to review the GAs periodically", "Mapping of the GAs to the POs", "Samples of student work showing GA achievement (projects, labs, FYDP)"], checks: [
      { label: "Batches that have GAs (PLOs) defined (2.a)", done: scopeBatches.filter((b) => plos.some((p) => p.batchId === b.id)).length, total: scopeBatches.length, hint: "Create or import the GAs/PLOs for each batch.", href: "/coordinator/plos" },
      { label: "GAs approved by the Institute Head", done: plos.filter((p) => p.status === "approved").length, total: plos.length, hint: "Send the GAs for approval.", href: "/coordinator/plos" },
      { label: "Reviews of POs, GAs or CLOs recorded in the last 12 months (2.b)", done: Math.min(q("Review of POs / GAs / CLOs").filter(recent).length, 1), total: 1, hint: "Record each review under Accreditation Evidence, Quality.", href: EV },
      { label: "GAs covered by at least one course", done: plos.filter((p) => coveredPlos.has(p.id)).length, total: plos.length, hint: "Some GAs are not taught anywhere.", href: "/omc/reports/coverage" },
      colCheck("plo", "CLOs mapped to a GA (2.d)", "Map every CLO to one GA.", "/omc/reports/audit"),
      colCheck("assess", "Assessments add up to 100% (so GA attainment can be measured)", "Set quiz, assignment, midterm and final weights.", "/omc/weight-compliance"),
      colCheck("marks", "Offered courses with marks entered", "Enter marks so attainment can be worked out.", "/omc/reports/result-mate"),
      { label: "Student survey answered (indirect assessment)", done: surveyOf("STUDENT") > 0 ? 1 : 0, total: 1, hint: "Send the student survey.", href: "/coordinator/surveys" },
    ] },
    { no: 3, title: "Curriculum and Learning Process", manual: ["Adequate exposure to complex computing problems, design projects, problem-based learning and open-ended labs (3.b, 3.i)", "Lab work and its assessment support the skills required (3.d); lab manuals for every experiment", "Direct and indirect methods used to assess CLOs and GAs (3.j)", "FYDP covers complex problems and has well-defined grading of deliverables and reports (3.k, 3.l)", "Minimum CGPA of 2.0 for the degree"], checks: [
      { label: "Batches with at least 130 credit hours (3.a)", done: perBatch.filter((b) => b.credits >= 130).length, total: perBatch.length, hint: "NCEAC requires at least 130 credit hours.", href: "/coordinator/courses" },
      { label: "Batches spread over 8 semesters", done: perBatch.filter((b) => b.semesters >= 8).length, total: perBatch.length, hint: "Place courses in all 8 semesters.", href: "/coordinator/program-semester-map" },
      { label: "Required HEC courses present in the curriculum (see Curriculum vs HEC)", done: hecCoverage ?? 0, total: hecCoverage === null ? 0 : 100, hint: "Add the missing HEC courses or explain the differences.", href: "/coordinator/hec-comparison" },
      { label: "Batches with a final year design project of at least 6 credit hours", done: capstoneOk, total: scopeBatches.length, hint: "Add the FYDP course (type: Capstone Project) with 6 credit hours over semesters 7 and 8.", href: "/coordinator/courses" },
      { label: "Computing labs defined (3.c)", done: Math.min(labs, 1), total: 1, hint: "Add the labs in the timetable settings.", href: "/coordinator/timetable" },
      colCheck("clos", "Courses with CLOs written (3.e)", "Ask the Subject Expert to write the CLOs.", "/coordinator/assign-subject-experts"),
      colCheck("plo", "CLOs mapped to GAs (3.e)", "Map every CLO to one GA.", "/omc/reports/audit"),
      { label: "Industry took part in reviewing the curriculum (3.f)", done: Math.min(ev("PEO", "Review by industry").length + ev("INDUSTRY", "Advisory board meeting").length, 1), total: 1, hint: "Record the review under Accreditation Evidence.", href: EV },
      { label: "Faculty with office hours announced (3.g)", done: withOfficeHours, total: faculty.length, hint: "Ask faculty to fill in their office hours under My Profile.", href: "/faculty-report" },
      { label: "Supervised internship recorded: 6 to 8 weeks with employer feedback (3.h)", done: Math.min(ev("INTERNSHIP").length, 1), total: 1, hint: "Record where students did internships.", href: EV },
    ] },
    { no: 4, title: "Students", manual: ["Annual intake in line with the maximum NCEAC allows for your faculty strength (4.b)", "Students' workload, policies on harassment and plagiarism, student discipline", "Quality of the process for evaluating student performance and taking corrective measures (4.i)", "Student organisations that give experience in management and governance"], checks: [
      { label: "Programs whose admission criteria are set by Student Affairs (4.a)", done: admissionSet, total: admissionPrograms.length, hint: "Ask Student Affairs to set the admission criteria for this program.", href: "/admission-criteria" },
      { label: "Admission, graduation and dropout figures recorded for at least 3 intake years (4.h)", done: Math.min(outcomeRows.length, 3), total: 3, hint: "Enter the figures under Graduation and Surveys.", href: "/outcomes" },
      { label: "Student, exit, alumni and employer surveys held in the last 12 months", done: ["STUDENT", "EXIT", "ALUMNI", "EMPLOYER"].filter((k) => surveyKinds.has(k)).length, total: 4, hint: "Record each survey's results and the action taken under Graduation and Surveys.", href: "/outcomes" },
      { label: "Admission criteria with at least 50% marks in Intermediate (NCEAC minimum)", done: minAdmission, total: admissionPrograms.length, hint: "NCEAC requires at least 50% (60% for computing engineering).", href: "/admission-criteria" },
      { label: "Transfer-credit policy written: at most 50% of credit hours transferable (4.c)", done: transferSet, total: admissionPrograms.length, hint: "Write the transfer policy in the admission criteria.", href: "/admission-criteria" },
      { label: "Batches with a student count recorded", done: scopeBatches.filter((b) => b.studentCount > 0).length, total: scopeBatches.length, hint: "Record the number of students in each batch.", href: "/coordinator/batches" },
      { label: "Designated student counsellor or orientation session recorded (4.d)", done: Math.min(ev("COUNSELLING", "Designated student counsellor").length + ev("COUNSELLING", "Orientation session").length, 1), total: 1, hint: "Record the counsellor appointed or the orientation session held.", href: EV },
      { label: "Counselling sessions in the last 12 months (your target: 4)", done: Math.min(ev("COUNSELLING").filter(recent).length, 4), total: 4, hint: "Record the sessions you held.", href: EV },
      { label: "Batches with an advisor", done: scopeBatches.filter((b) => b.advisorId).length, total: scopeBatches.length, hint: "Appoint an advisor for each batch.", href: "/coordinator/batches" },
      { label: "Offered courses with at most 50 students per section (4.e)", done: classOk, total: sized.length, hint: "Open more sections, or reduce the batch size. Needs section counts under Teacher Load.", href: "/coordinator/load-report" },
      { label: `Lab seats: at most 3 students per working computer (now ${ratio.perComputer ?? "—"}) (4.e)`, done: Math.min(ratio.working, stationsNeeded), total: stationsNeeded, hint: "NCEAC expects 1 station for 3 students (1 for 5 is accepted where students bring laptops).", href: "/lab-inventory" },
      { label: "Semesters carrying 15 to 18 credit hours (4.f)", done: semInRange, total: scopeBatches.length * 8, hint: "Even out the credit hours across the 8 semesters.", href: "/coordinator/program-semester-map" },
      colCheck("deliv", "Offered courses with lectures logged: course completion (4.g)", "Instructors must log each lecture as it happens.", "/omc/delivery-completion"),
      { label: "Courses planned for 15 weeks", done: coursesWith15, total: courses.length, hint: "The lecture plan should cover 15 teaching weeks.", href: "/omc/reports/weekly-plan" },
      { label: "Offered courses with a course folder kept", done: foldersKept, total: offeredIds.size, hint: "Tick the courses whose folders are kept under Course Folders.", href: "/coordinator/course-folders" },
      { label: "Technical competitions or exhibitions in the last 12 months (4.h)", done: Math.min(activities.filter((a) => a.category === "Technical competition").length, 1), total: 1, hint: "Log competitions your students took part in.", href: "/coordinator/activities" },
      { label: "Community service in the last 12 months (4.j)", done: Math.min(activities.filter((a) => a.category === "Community service").length, 1), total: 1, hint: "Log community service activities.", href: "/coordinator/activities" },
      { label: "Other extra-curricular activities (your target: 4 in the year)", done: Math.min(activities.length, 4), total: 4, hint: "Log sports, societies, workshops and trips.", href: "/coordinator/activities" },
    ] },
    { no: 5, title: "Faculty and Support Staff", manual: ["Formal mechanism for faculty training and mentoring in outcome-based teaching (5.c)", "Effectiveness of the faculty development program and retention (5.d)", "Offer or contract letters of permanent faculty on file", "Each full-time faculty member teaches at least 9 credit hours a year (6 for those in administrative posts)"], checks: [
      { label: `Full-time faculty strength: NCEAC asks for 7 (you have ${fullTime} full-time and ${visiting} visiting; a visiting teacher counts as 0.25) (5.a)`, done: Math.min(fte, 7), total: 7, hint: "Hire or record more full-time faculty. Record each person's employment type under My Profile.", href: "/coordinator/faculty" },
      { label: "At least one full-time faculty member with a PhD (5.b)", done: Math.min(phd, 1), total: 1, hint: "Faculty should record their degrees under My Profile.", href: "/faculty-report" },
      { label: "Faculty with an 18-year degree (MS / MPhil / PhD) recorded", done: terminal, total: faculty.length, hint: "NCEAC expects full-time faculty to hold 18 years of education.", href: "/faculty-report" },
      { label: "Faculty within the maximum load of 9 credit hours a semester (5.e)", done: loadWithinNine, total: faculty.length, hint: "Some teachers carry more than 9 credit hours.", href: "/coordinator/load-report" },
      { label: "Offered courses with a course folder kept (5.f)", done: foldersKept, total: offeredIds.size, hint: "Tick the courses whose folders are kept.", href: "/coordinator/course-folders" },
      { label: "Faculty development activities recorded in the last 12 months (5.c, 5.d)", done: Math.min(q("Faculty development activity").filter(recent).length, 1), total: 1, hint: "Record trainings and workshops under Accreditation Evidence, Quality.", href: EV },
      { label: "Faculty with a paper, grant or project recorded (5.g)", done: researchers, total: faculty.length, hint: "Ask faculty to add their research under My Profile.", href: "/faculty-report" },
      { label: "Lab engineers or support staff in post (5.h)", done: Math.min(labEngineers, 1), total: 1, hint: "Add the lab engineers under Lab Engineers.", href: "/coordinator/lab-engineers" },
      colCheck("se", "Courses with a Subject Expert", "Give each course a Subject Expert.", "/coordinator/assign-subject-experts"),
      colCheck("inst", "Offered courses with an Instructor", "Assign the instructor.", "/coordinator/courses"),
      { label: "Faculty profiles 80% complete", done: facComplete, total: faculty.length, hint: "Ask faculty to complete My Profile.", href: "/faculty-report" },
    ] },
    { no: 6, title: "Facilities and Infrastructure", manual: ["Number of dedicated and shared lecture rooms, their average size and teaching aids (6.a)", "Specialised labs: general programming, systems and hardware labs, and their available hours", "Support facilities: transport, hostels, sports for male and female students, prayer areas, common rooms (6.f)", "Work-place safety (EHS) arrangements, especially in labs (6.g)", "At least 5 hard copies of IEEE/ACM transactions or proceedings in the library"], checks: [
      { label: `Lecture rooms: 3 for every 200 students (you need ${roomsNeeded})`, done: Math.min(lectureRooms, roomsNeeded), total: roomsNeeded, hint: "Add the rooms in the timetable settings.", href: "/coordinator/timetable" },
      { label: "Labs with their inventory filled in by the Lab Manager (6.b)", done: Math.min(ratio.labs, 1), total: 1, hint: "Ask the Lab Manager to enter the lab data.", href: "/lab-inventory" },
      { label: `Working computers: 1 station for 3 students (you need ${stationsNeeded}; 1 for 5 is accepted where students keep laptops) (6.d)`, done: Math.min(ratio.working, stationsNeeded), total: stationsNeeded, hint: "More working computers, or fewer students per lab.", href: "/lab-inventory" },
      { label: "Installed computers with their specification recorded", done: Math.min(pcSpecs.reduce((n, x) => n + x.quantity, 0), ratio.computers), total: ratio.computers, hint: "The Lab Manager lists each kind of PC (processor, RAM, storage) under PC specs.", href: "/lab-inventory" },
      { label: "Described computers bought in the last 5 years (average life of PCs)", done: pcSpecs.filter((x) => (x.purchaseYear || 0) >= thisYear - 5).reduce((n, x) => n + x.quantity, 0), total: pcSpecs.reduce((n, x) => n + x.quantity, 0), hint: "Older machines may need replacing.", href: "/lab-inventory" },
      { label: "Library record filled in (6.c)", done: library ? 1 : 0, total: 1, hint: "Ask the Lab Manager or the Institute Head to enter the library details.", href: "/library-inventory" },
      { label: `Computing book titles: 4 for every student (you need ${studentsAll * 4})`, done: Math.min(library?.computingTitles || 0, Math.max(studentsAll * 4, 1)), total: Math.max(studentsAll * 4, 1), hint: "NCEAC counts books; the library record holds titles, so copies count extra.", href: "/library-inventory" },
      { label: "At least 10 printed technical magazines or journals", done: Math.min(library?.printJournals || 0, 10), total: 10, hint: "Subscribe to more printed technical magazines.", href: "/library-inventory" },
      { label: "Access to IEEE / ACM and the HEC digital library", done: (/ieee|acm/i.test(library?.databases || "") ? 1 : 0) + (/hec/i.test(library?.databases || "") ? 1 : 0), total: 2, hint: "List the digital databases the library subscribes to.", href: "/library-inventory" },
      { label: "A librarian in post", done: library?.hasLibrarian ? 1 : 0, total: 1, hint: "Record whether a librarian is in post.", href: "/library-inventory" },
      { label: "Career counselling or placement service recorded (6.e)", done: Math.min(ev("COUNSELLING", "Career counselling").length + ev("INDUSTRY", "Industry-Liaison office").length, 1), total: 1, hint: "Record career counselling or the industry-liaison office.", href: EV },
    ] },
    { no: 7, title: "Institutional Support and Financial Resources", manual: ["Financial profile: total investment in the program since its start (people, equipment, labs, infrastructure, books)", "Current annual budget copy and approved rules for admissions, examinations and hiring"], checks: [
      { label: `Budget set for ${fyNow} (Institute Head's Finance page) (7.a)`, done: finance.some((x) => x.amount > 0) ? 1 : 0, total: 1, hint: "The Institute Head enters the yearly budget under Finance.", href: "/dashboard" },
      { label: `Budget did not fall compared with ${prevFy} (7.b)`, done: curBudgetTotal > 0 && curBudgetTotal >= prevBudgetTotal ? 1 : 0, total: 1, hint: "NCEAC looks for a continued and growing financial commitment.", href: "/dashboard" },
      { label: "Lab equipment budget set", done: budgetOf("Laboratory equipment and upgrades") > 0 ? 1 : 0, total: 1, hint: "Set a budget for lab equipment and upgrades.", href: "/dashboard" },
      { label: "Library budget set", done: budgetOf("Library and digital resources") > 0 ? 1 : 0, total: 1, hint: "Set a budget for the library and digital resources.", href: "/dashboard" },
      { label: "Faculty development budget set", done: budgetOf("Faculty development and training") > 0 ? 1 : 0, total: 1, hint: "Set a budget for training.", href: "/dashboard" },
      { label: "Funding for research and paper presentations (7.c)", done: budgetOf("Research and grants") > 0 ? 1 : 0, total: 1, hint: "Set a budget for research.", href: "/dashboard" },
    ] },
    { no: 8, title: "Steps to Improve the Program", manual: ["Quality Management Policy on paper: program planning, curriculum development and review, and responses to stakeholder feedback", "Improvement in faculty strength and qualifications since the last visit (8.c)", "New facilities and lab equipment added since the last visit (8.e)"], checks: [
      { label: "Reviews of POs, GAs or CLOs in the last 12 months: after every semester (8.a, target 2)", done: Math.min(q("Review of POs / GAs / CLOs").filter(recent).length, 2), total: 2, hint: "Record each review under Accreditation Evidence, Quality.", href: EV },
      { label: "Actions taken on the last visit's weaknesses (8.b)", done: Math.min(q("Action on last visit observation").length, 1), total: 1, hint: "Record each action taken on the observations of the last visit.", href: EV },
      { label: "Papers published by faculty in the last 2 years (8.d)", done: Math.min(recentPapers, 1), total: 1, hint: "Ask faculty to add their papers under My Profile.", href: "/faculty-report" },
      { label: "New initiatives recorded (8.f)", done: Math.min(q("New initiative").length, 1), total: 1, hint: "Record new teaching, assessment or evaluation initiatives.", href: EV },
      { label: "Improvement actions closed", done: closedCqi, total: cqi.length, hint: "Follow up and close the open actions.", href: "/chairman/cqi" },
      { label: "Exam papers approved", done: approvedPapers, total: papers.length, hint: "Papers waiting for the team's approval.", href: "/coordinator/courses" },
    ] },
    { no: 9, title: "Industrial Linkages", manual: ["Industrial advisory board formed by the university with formal terms", "Faculty members' consultancy or supervision work with industry, with evidence"], checks: [
      { label: "Industrial advisory board members recorded (9.a, 3 are usual)", done: Math.min(ev("INDUSTRY", "Advisory board member").length, 3), total: 3, hint: "Record the advisory board members under Accreditation Evidence.", href: EV },
      { label: "Advisory board meetings in the last 12 months", done: Math.min(ev("INDUSTRY", "Advisory board meeting").filter(recent).length, 1), total: 1, hint: "Hold and record a meeting.", href: EV },
      { label: "Formal industry feedback: employer survey answered (9.b)", done: surveyOf("EMPLOYER") > 0 ? 1 : 0, total: 1, hint: "Send the employer survey.", href: "/coordinator/surveys" },
      { label: "Industry-Liaison office recorded (9.c)", done: Math.min(ev("INDUSTRY", "Industry-Liaison office").length, 1), total: 1, hint: "Record the office that arranges internships.", href: EV },
      { label: "Internships recorded (9.c)", done: Math.min(ev("INTERNSHIP").length, 1), total: 1, hint: "Record where students did internships.", href: EV },
      { label: "Design projects sponsored or supervised jointly with industry (9.d)", done: Math.min(ev("INDUSTRY", "Jointly supervised design project").length + ev("INDUSTRY", "Industry project").length, 1), total: 1, hint: "Record the project under Accreditation Evidence.", href: EV },
      { label: "Faculty consultancy or applied research with industry (9.e)", done: Math.min(ev("INDUSTRY", "Faculty consultancy").length, 1), total: 1, hint: "Record the consultancy work.", href: EV },
      { label: "Signed MoUs or agreements with industry", done: Math.min(ev("INDUSTRY", "MoU / agreement").length, 1), total: 1, hint: "Record the agreements.", href: EV },
      { label: "Guest lectures or industrial visits in the last 12 months", done: Math.min(ev("INDUSTRY").filter((e) => ["Guest lecture", "Industrial visit"].includes(e.kind) && recent(e)).length, 2), total: 2, hint: "Invite industry speakers or arrange visits.", href: EV },
      { label: "Employers and alumni on record", done: Math.min(employers, 1) + Math.min(alumni, 1), total: 2, hint: "Record the employers and alumni.", href: "/coordinator/stakeholders" },
    ] },
  ];

  // The five qualifying requirements (Manual 2.3): failing any one can stop the assessment.
  const qualifying: Check[] = [
    { label: "130 credit hours over 8 semesters", done: perBatch.filter((b) => b.credits >= 130 && b.semesters >= 8).length, total: perBatch.length, hint: "Complete the curriculum to 130 credit hours across 8 semesters.", href: "/coordinator/courses" },
    { label: "Final year project of at least 6 credit hours", done: capstoneOk, total: scopeBatches.length, hint: "Add the FYDP course with 6 credit hours.", href: "/coordinator/courses" },
    { label: "Full-time computing faculty to the standard: 7, including a PhD", done: (fte >= 7 ? 1 : 0) + (phd >= 1 ? 1 : 0), total: 2, hint: "Hire or record the faculty.", href: "/coordinator/faculty" },
    { label: "Compliance report on the last NCEAC visit", done: Math.min(q("Compliance report submitted").length, 1), total: 1, hint: "Record that the compliance report was submitted (not needed for a first visit).", href: EV },
  ];
  const qualifyingManual = ["Legal status of the institution (charter, degree awarding institute, constituent or affiliated)"];
  const areaScore = (a: Criterion) => {
    const rated = a.checks.filter((c) => c.total > 0);
    return rated.length ? Math.round(rated.reduce((s, c) => s + (c.done / c.total) * 100, 0) / rated.length) : null;
  };
  const scored = areas.map((a) => ({ a, s: areaScore(a) }));
  const withData = scored.filter((x) => x.s !== null);
  const overall = withData.length ? Math.round(withData.reduce((s, x) => s + (x.s as number), 0) / withData.length) : null;
  const priorities = areas.flatMap((a) => a.checks.map((c) => ({ ...c, area: `Criterion ${a.no}: ${a.title}`, p: pct(c) })))
    .filter((c) => c.p !== null && c.p < 100).sort((x, y) => (x.p as number) - (y.p as number)).slice(0, 6);

  return { batches, batchId, scopeBatches, courses, plos, scored, overall, priorities, areas, areaScore, grid, COLS, qualifying, qualifyingManual };
}
