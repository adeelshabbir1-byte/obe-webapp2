import { prisma } from "./db";
import { completeness } from "./facultyProfile";
import { fiscalYearNow, labRatio } from "./resources";

// How ready one program is for an outcome-based accreditation review, counted live from that Program Lead's records.
export type State = "ok" | "partial" | "missing" | "na";
export type Check = { label: string; done: number; total: number; hint: string; href: string };
export type Criterion = { no: number; title: string; checks: Check[]; manual: string[] };

export const pct = (c: Check) => (c.total === 0 ? null : Math.round((c.done / c.total) * 100));
// NCEAC-style quality ratings: E Exceptional, G Good, C Concern, W Weakness, D Deficient, X not measured here.
export const RATINGS = [
  { code: "E", name: "Exceptional", min: 90, colour: "#1B6B3A" }, { code: "G", name: "Good", min: 75, colour: "#4F9A5E" },
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
    select: { id: true, code: true, title: true, isOffered: true, subjectExpertId: true, instructorId: true, batchId: true, isNonCredit: true },
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
    prisma.assessmentInstrument.findMany({ where: { ...inCourses, source: "SE" }, select: { courseId: true, marksPct: true } }),
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
    prisma.facultyProfile.findMany({ where: { userId: { in: facultyIds.length ? facultyIds : ["none"] } }, select: { userId: true, photo: true, designation: true, dateOfJoining: true, bloodGroup: true, phone: true, nextOfKinName: true, nextOfKinPhone: true } }),
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
    const sumPct = as.reduce((s, a) => s + a.marksPct, 0);
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

  const areas: Criterion[] = [
    { no: 1, title: "Admission", manual: ["Yearly intake within what the infrastructure can carry", "Graduation requirements"], checks: [
      { label: "Programs with admission criteria set by the Dean", done: admissionSet, total: admissionPrograms.length, hint: "Ask your Dean to set the admission criteria for this program.", href: "/admission-criteria" },
      { label: "Batches with a student count recorded", done: scopeBatches.filter((b) => b.studentCount > 0).length, total: scopeBatches.length, hint: "Record the number of students in each batch.", href: "/coordinator/batches" },
    ] },
    { no: 2, title: "Students", manual: [], checks: [
      { label: "Counselling or support sessions in the last 12 months (assumed target: 4)", done: Math.min(ev("COUNSELLING").filter(recent).length, 4), total: 4, hint: "Record the sessions you held under Accreditation Evidence.", href: "/coordinator/evidence" },
      { label: "Batches with an advisor", done: scopeBatches.filter((b) => b.advisorId).length, total: scopeBatches.length, hint: "Appoint an advisor for each batch.", href: "/coordinator/batches" },
      colCheck("marks", "Offered courses with marks entered (progress can be monitored)", "Enter marks so student progress can be tracked.", "/omc/reports/result-mate"),
      { label: "Extra-curricular activities logged in the last 12 months (your target: 4)", done: Math.min(activities.length, 4), total: 4, hint: "Log sports, societies, competitions and workshops.", href: "/coordinator/activities" },
      { label: "Kinds of activity covered (your target: 3)", done: Math.min(new Set(activities.map((a) => a.category)).size, 3), total: 3, hint: "Cover sports, cultural, technical and service activities.", href: "/coordinator/activities" },
    ] },
    { no: 3, title: "Program Educational Objectives (PEOs)", manual: [], checks: [
      { label: "PEO reviews in the last 12 months by faculty, industry, alumni or students (assumed target: 2 groups)", done: Math.min(peoReviewGroups, 2), total: 2, hint: "Record who reviewed the PEOs under Accreditation Evidence.", href: "/coordinator/evidence" },
      { label: "PEO key performance indicators that met their target", done: kpis.filter((k) => k.target !== null && k.actual !== null && (k.actual as number) >= (k.target as number)).length, total: Math.max(kpis.length, 1), hint: "Add KPIs with a target and actual value, and work on the ones that fall short.", href: "/coordinator/evidence" },
      { label: "Vision written", done: prof?.departmentVision?.trim() ? 1 : 0, total: 1, hint: "Fill in the vision on the Program Document page.", href: "/coordinator/program-profile" },
      { label: "Mission written", done: prof?.departmentMission?.trim() ? 1 : 0, total: 1, hint: "Fill in the mission on the Program Document page.", href: "/coordinator/program-profile" },
      { label: "PEOs written (at least 3)", done: Math.min(peoCount, 3), total: 3, hint: "Add the PEOs on the Program Document page.", href: "/coordinator/program-profile" },
      { label: "Alumni survey answered", done: surveyOf("ALUMNI") > 0 ? 1 : 0, total: 1, hint: "Send the alumni survey.", href: "/coordinator/surveys" },
      { label: "Employer survey answered", done: surveyOf("EMPLOYER") > 0 ? 1 : 0, total: 1, hint: "Send the employer survey.", href: "/coordinator/surveys" },
    ] },
    { no: 4, title: "Student Outcomes / Graduate Attributes (PLOs)", manual: ["Alignment of the PLOs with the Seoul Accord graduate attributes"], checks: [
      { label: "Batches that have PLOs", done: scopeBatches.filter((b) => plos.some((p) => p.batchId === b.id)).length, total: scopeBatches.length, hint: "Create or import the PLOs for each batch.", href: "/coordinator/plos" },
      { label: "PLOs approved by the Institute Head", done: plos.filter((p) => p.status === "approved").length, total: plos.length, hint: "Send the PLOs for approval.", href: "/coordinator/plos" },
      { label: "PLOs covered by at least one course", done: plos.filter((p) => coveredPlos.has(p.id)).length, total: plos.length, hint: "Some PLOs are not taught anywhere.", href: "/omc/reports/coverage" },
      colCheck("plo", "CLOs linked to a PLO", "Link every CLO to a PLO.", "/omc/reports/audit"),
      { label: "Student survey answered", done: surveyOf("STUDENT") > 0 ? 1 : 0, total: 1, hint: "Send the student survey.", href: "/coordinator/surveys" },
    ] },
    { no: 5, title: "Curriculum", manual: ["Compliance with the HEC curriculum guidelines for your discipline (core, supporting, general education, depth)"], checks: [
      { label: "Batches with at least 130 credit hours", done: perBatch.filter((b) => b.credits >= 130).length, total: perBatch.length, hint: "The usual minimum is 130 credit hours (check your discipline's guideline).", href: "/coordinator/courses" },
      { label: "Batches spread over at least 8 semesters", done: perBatch.filter((b) => b.semesters >= 8).length, total: perBatch.length, hint: "Place courses in all 8 semesters.", href: "/coordinator/program-semester-map" },
      { label: "Batches with a general education course", done: perBatch.filter((b) => b.genEd).length, total: perBatch.length, hint: "Add the general education courses.", href: "/coordinator/courses" },
      { label: "Batches with a capstone project", done: perBatch.filter((b) => b.capstone).length, total: perBatch.length, hint: "Add the final-year project course (type: Capstone Project).", href: "/coordinator/courses" },
    ] },
    { no: 6, title: "Learning Process", manual: [], checks: [
      { label: "Offered courses with a course folder kept", done: foldersKept, total: offeredIds.size, hint: "Tick the courses whose folders are kept under Course Folders.", href: "/coordinator/course-folders" },
      { label: "Faculty with office hours listed", done: withOfficeHours, total: faculty.length, hint: "Ask faculty to fill in their office hours under My Profile.", href: "/faculty-report" },
      { label: "Internships or supervised projects recorded (assumed target: 1)", done: Math.min(ev("INTERNSHIP").length, 1), total: 1, hint: "Record where students did internships under Accreditation Evidence.", href: "/coordinator/evidence" },
      colCheck("clos", "Courses with CLOs written", "Ask the Subject Expert to write the CLOs.", "/coordinator/assign-subject-experts"),
      colCheck("plan", "Courses with a lecture plan", "The Subject Expert must build the lecture plan.", "/coordinator/assign-subject-experts"),
      colCheck("link", "Lecture plan linked to CLOs", "Each lecture should point to a CLO.", "/omc/total-summary"),
      { label: "Courses planned for at least 15 weeks", done: coursesWith15, total: courses.length, hint: "The lecture plan should cover 15 teaching weeks.", href: "/omc/reports/weekly-plan" },
      colCheck("assess", "Assessments add up to 100%", "Set quiz, assignment, midterm and final weights.", "/omc/weight-compliance"),
      colCheck("deliv", "Offered courses with lectures logged (90%+)", "Instructors must log each lecture as it happens.", "/omc/delivery-completion"),
      { label: "Exam papers approved", done: approvedPapers, total: papers.length, hint: "Papers waiting for the team's approval.", href: "/coordinator/courses" },
      { label: "Improvement actions closed", done: closedCqi, total: cqi.length, hint: "Follow up and close the open actions.", href: "/chairman/cqi" },
    ] },
    { no: 7, title: "Faculty", manual: ["Professional development, retention and office space"], checks: [
      { label: `Enough teachers for the students (assumed limit: 20 students per teacher; you have ${teachingStudents} students and ${faculty.length} teachers)`, done: Math.min(faculty.length, Math.max(Math.ceil(teachingStudents / 20), 1)), total: Math.max(Math.ceil(teachingStudents / 20), 1), hint: "More teachers, or fewer students per teacher.", href: "/coordinator/faculty" },
      colCheck("se", "Courses with a Subject Expert", "Give each course a Subject Expert.", "/coordinator/assign-subject-experts"),
      colCheck("inst", "Offered courses with an Instructor", "Assign the instructor.", "/coordinator/courses"),
      { label: "Faculty with a MS / PhD recorded", done: terminal, total: faculty.length, hint: "Faculty should record their degrees under My Profile.", href: "/faculty-report" },
      { label: "Faculty within their normal teaching load", done: loadOk, total: faculty.length, hint: "Some teachers have more courses than their normal load.", href: "/coordinator/load-report" },
      { label: "Faculty profiles 80% complete", done: facComplete, total: faculty.length, hint: "Ask faculty to complete My Profile.", href: "/faculty-report" },
    ] },
    { no: 8, title: "Infrastructure and Facilities", manual: ["Multimedia equipment and the learning environment", "Software licences, internet bandwidth, hardware per student"], checks: [
      { label: "Lecture rooms defined", done: Math.min(lectureRooms, 1), total: 1, hint: "Add the rooms in the timetable settings.", href: "/coordinator/timetable" },
      { label: "Computing labs defined", done: Math.min(labs, 1), total: 1, hint: "Add the labs in the timetable settings.", href: "/coordinator/timetable" },
      { label: "Labs with their inventory filled in by the Lab Manager", done: Math.min(ratio.labs, 1), total: 1, hint: "Ask the Lab Manager to enter the lab data.", href: "/lab-inventory" },
      { label: `Working computers for your ${ratio.students} students (assumed target: 1 per 2 students; now ${ratio.perComputer ?? "—"} students per computer)`, done: Math.min(ratio.working, Math.ceil(ratio.students / 2)), total: Math.ceil(ratio.students / 2), hint: "More working computers, or fewer students per lab.", href: "/lab-inventory" },
      { label: "Installed computers with their specification recorded", done: Math.min(pcSpecs.reduce((n, x) => n + x.quantity, 0), ratio.computers), total: ratio.computers, hint: "The Lab Manager lists each kind of PC (processor, RAM, storage) under PC specs.", href: "/lab-inventory" },
      { label: `Described computers bought in the last 5 years (assumed limit)`, done: pcSpecs.filter((x) => (x.purchaseYear || 0) >= new Date().getFullYear() - 5).reduce((n, x) => n + x.quantity, 0), total: pcSpecs.reduce((n, x) => n + x.quantity, 0), hint: "Older machines may need replacing.", href: "/lab-inventory" },
      { label: "Library record filled in", done: library ? 1 : 0, total: 1, hint: "Ask the Lab Manager or the Institute Head to enter the library details.", href: "/library-inventory" },
      { label: "Computing book titles recorded", done: (library?.computingTitles || 0) > 0 ? 1 : 0, total: 1, hint: "Record how many of the library's titles are in computing.", href: "/library-inventory" },
      { label: "Digital databases listed", done: library?.databases?.trim() ? 1 : 0, total: 1, hint: "List the digital databases the library subscribes to.", href: "/library-inventory" },
      { label: "A qualified librarian in post", done: library?.hasLibrarian ? 1 : 0, total: 1, hint: "Record whether a librarian is in post.", href: "/library-inventory" },
    ] },
    { no: 9, title: "Industrial Linkages", manual: [], checks: [
      { label: "Industrial advisory board members (assumed target: 3)", done: Math.min(ev("INDUSTRY", "Advisory board member").length, 3), total: 3, hint: "Record the advisory board members under Accreditation Evidence.", href: "/coordinator/evidence" },
      { label: "Advisory board meetings in the last 12 months (assumed target: 1)", done: Math.min(ev("INDUSTRY", "Advisory board meeting").filter(recent).length, 1), total: 1, hint: "Hold and record a meeting.", href: "/coordinator/evidence" },
      { label: "Signed MoUs or agreements with industry (assumed target: 1)", done: Math.min(ev("INDUSTRY", "MoU / agreement").length, 1), total: 1, hint: "Record the agreements under Accreditation Evidence.", href: "/coordinator/evidence" },
      { label: "Industry visits, guest lectures or projects in the last 12 months (assumed target: 2)", done: Math.min(ev("INDUSTRY").filter((e) => ["Guest lecture", "Industrial visit", "Industry project"].includes(e.kind) && recent(e)).length, 2), total: 2, hint: "Invite industry speakers or arrange visits.", href: "/coordinator/evidence" },
      { label: "Employers on record (approved)", done: Math.min(employers, 1), total: 1, hint: "Record the employers your graduates work for.", href: "/coordinator/stakeholders" },
      { label: "Alumni on record (approved)", done: Math.min(alumni, 1), total: 1, hint: "Record your alumni.", href: "/coordinator/stakeholders" },
      { label: "Employer survey answered", done: surveyOf("EMPLOYER") > 0 ? 1 : 0, total: 1, hint: "Send the employer survey.", href: "/coordinator/surveys" },
      { label: "Batches with a capstone project", done: perBatch.filter((b) => b.capstone).length, total: perBatch.length, hint: "Add the final-year project course.", href: "/coordinator/courses" },
    ] },
    { no: 10, title: "Institutional Support", manual: ["Financial sustainability over several years", "Administrative backing and departmental autonomy"], checks: [
      { label: `Budget set for ${fiscalYearNow()} (Institute Head's Finance page)`, done: finance.some((x) => x.amount > 0) ? 1 : 0, total: 1, hint: "The Institute Head enters the yearly budget under Finance.", href: "/dashboard" },
      { label: "Lab equipment budget set", done: budgetOf("Laboratory equipment and upgrades") > 0 ? 1 : 0, total: 1, hint: "Set a budget for lab equipment and upgrades.", href: "/dashboard" },
      { label: "Library budget set", done: budgetOf("Library and digital resources") > 0 ? 1 : 0, total: 1, hint: "Set a budget for the library and digital resources.", href: "/dashboard" },
      { label: "Faculty development budget set", done: budgetOf("Faculty development and training") > 0 ? 1 : 0, total: 1, hint: "Set a budget for training.", href: "/dashboard" },
      { label: "Research budget set", done: budgetOf("Research and grants") > 0 ? 1 : 0, total: 1, hint: "Set a budget for research.", href: "/dashboard" },
    ] },
  ];
  const areaScore = (a: Criterion) => {
    const rated = a.checks.filter((c) => c.total > 0);
    return rated.length ? Math.round(rated.reduce((s, c) => s + (c.done / c.total) * 100, 0) / rated.length) : null;
  };
  const scored = areas.map((a) => ({ a, s: areaScore(a) }));
  const withData = scored.filter((x) => x.s !== null);
  const overall = withData.length ? Math.round(withData.reduce((s, x) => s + (x.s as number), 0) / withData.length) : null;
  const priorities = areas.flatMap((a) => a.checks.map((c) => ({ ...c, area: `Criterion ${a.no}: ${a.title}`, p: pct(c) })))
    .filter((c) => c.p !== null && c.p < 100).sort((x, y) => (x.p as number) - (y.p as number)).slice(0, 6);

  return { batches, batchId, scopeBatches, courses, plos, scored, overall, priorities, areas, areaScore, grid, COLS };
}
