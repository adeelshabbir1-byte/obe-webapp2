import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { completeness } from "../../../lib/facultyProfile";

const NAV = [
  { href: "/coordinator/faculty", label: "Teacher Onboarding" }, { href: "/coordinator/faculty-requests", label: "Teachers from Other Departments" }, { href: "/program-moves", label: "Teacher Program Moves" }, { href: "/coordinator/lab-engineers", label: "Lab Engineers" }, { href: "/course-leads", label: "Course Leads" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/assign-subject-experts", label: "Assign Subject Experts" },
  { href: "/coordinator/elective-options", label: "Elective Options" },
  { href: "/coordinator/custom-categories", label: "Course & Teacher Categories" },
  { href: "/coordinator/out-of-batch-requests", label: "Out-of-Batch Requests" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/timetable", label: "Timetable" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/students", label: "Students" },
  { href: "/coordinator/bulk-student-upload", label: "Bulk Student Upload (Multi-Batch)" },
  { href: "/coordinator/repeat-offering", label: "Repeat/Summer Offering" },
  { href: "/coordinator/grading-scale", label: "Grading Scale" },
  { href: "/coordinator/assignment-history", label: "Assignment History" },
  { href: "/coordinator/report-bundles", label: "Report Bundles" },
  { href: "/coordinator/program-profile", label: "Program Document" },
  { href: "/coordinator/required-books", label: "Required Textbooks" },
  { href: "/coordinator/student-transcript", label: "Student Transcript" },
  { href: "/coordinator/deficiency-status", label: "Deficiency Courses Status" },
  { href: "/public-library", label: "Public Course Library" },
  { href: "/coordinator/stakeholders", label: "Alumni & Employers" },
  { href: "/coordinator/surveys", label: "Feedback Surveys" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/elective-instructor-report", label: "Elective Instructor Report" },
  { href: "/coordinator/program-semester-map", label: "Program Semester Map" },
  { href: "/coordinator/curriculum-readiness-matrix", label: "Curriculum Readiness Matrix" },
  { href: "/faculty/profile", label: "My Profile" }, { href: "/faculty-report", label: "Faculty Details Report" }, { href: "/coordinator/accreditation-status", label: "Accreditation Status" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/omc/course-repositioning", label: "Course Repositioning" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

// ---- How "ready" the program is for accreditation (NCEAC-style outcome-based review) --------------------------------
// Every number here is counted live from the app's own records. A score is the share of things that are done; half-done
// things count as half. Nothing is estimated and nothing is typed in by hand.
type State = "ok" | "partial" | "missing" | "na";
type Check = { label: string; done: number; total: number; hint: string; href: string };
type Criterion = { no: number; title: string; checks: Check[]; manual: string[] };

const pct = (c: Check) => (c.total === 0 ? null : Math.round((c.done / c.total) * 100));
// NCEAC-style quality ratings: E Exceptional, G Good, C Concern, W Weakness, D Deficient, X not measured here.
const RATINGS = [
  { code: "E", name: "Exceptional", min: 90, colour: "#1B6B3A" }, { code: "G", name: "Good", min: 75, colour: "#4F9A5E" },
  { code: "C", name: "Concern", min: 60, colour: "#C9A227" }, { code: "W", name: "Weakness", min: 40, colour: "#D9822B" },
  { code: "D", name: "Deficient", min: 0, colour: "#B3261E" },
];
const NOT_MEASURED = { code: "X", name: "Not measured here", colour: "#9AA0A6" };
const rate = (p: number | null) => (p === null ? NOT_MEASURED : RATINGS.find((r) => p >= r.min)!);
const colour = (p: number | null) => rate(p).colour;
const word = (p: number | null) => rate(p).name;
const STATE_COLOUR: Record<State, string> = { ok: "#2E7D4F", partial: "#C58A12", missing: "#B3261E", na: "#D5D8DC" };
const STATE_TEXT: Record<State, string> = { ok: "Done", partial: "Partly done", missing: "Missing", na: "Not applicable yet" };

function Donut({ value, size = 150 }: { value: number | null; size?: number }) {
  const r = size / 2 - 12, c = 2 * Math.PI * r, v = value ?? 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Overall readiness ${value === null ? "no data" : value + " percent"}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E6E2DA" strokeWidth={14} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour(value)} strokeWidth={14} strokeLinecap="round"
        strokeDasharray={`${(c * v) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="48%" textAnchor="middle" style={{ fontSize: size * 0.24, fontWeight: 700, fontFamily: "Georgia, serif", fill: "var(--ink, #222)" }}>{value === null ? "—" : `${value}%`}</text>
      <text x="50%" y="64%" textAnchor="middle" style={{ fontSize: 11, fill: "#6B7177" }}>{word(value)}</text>
    </svg>
  );
}

function Bar({ value }: { value: number | null }) {
  return (
    <div style={{ background: "#ECE8E0", borderRadius: 6, height: 10, width: "100%", overflow: "hidden" }}>
      <div style={{ width: `${value ?? 0}%`, height: "100%", background: colour(value), borderRadius: 6 }} />
    </div>
  );
}

export default async function AccreditationStatusPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const batchId = searchParams.batchId && batches.some((b) => b.id === searchParams.batchId) ? searchParams.batchId : "";
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

  const areas: Criterion[] = [
    { no: 1, title: "Admission", manual: ["Admission policy (minimum 50% in Intermediate/HSSC, Mathematics requirement)", "Yearly intake within what the infrastructure can carry", "Transfer-credit policy and graduation requirements"], checks: [
      { label: "Batches with a student count recorded", done: scopeBatches.filter((b) => b.studentCount > 0).length, total: scopeBatches.length, hint: "Record the number of students in each batch.", href: "/coordinator/batches" },
    ] },
    { no: 2, title: "Students", manual: ["Counselling and student support records"], checks: [
      { label: "Batches with an advisor", done: scopeBatches.filter((b) => b.advisorId).length, total: scopeBatches.length, hint: "Appoint an advisor for each batch.", href: "/coordinator/batches" },
      colCheck("marks", "Offered courses with marks entered (progress can be monitored)", "Enter marks so student progress can be tracked.", "/omc/reports/result-mate"),
    ] },
    { no: 3, title: "Program Educational Objectives (PEOs)", manual: ["Evidence that faculty and industry reviewed the PEOs", "Key Performance Indicators for the PEOs"], checks: [
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
    { no: 6, title: "Learning Process", manual: ["Course folders kept (hard copy or LMS)", "Office hours of faculty", "Internship / supervised project arrangements"], checks: [
      colCheck("clos", "Courses with CLOs written", "Ask the Subject Expert to write the CLOs.", "/coordinator/assign-subject-experts"),
      colCheck("plan", "Courses with a lecture plan", "The Subject Expert must build the lecture plan.", "/coordinator/assign-subject-experts"),
      colCheck("link", "Lecture plan linked to CLOs", "Each lecture should point to a CLO.", "/omc/total-summary"),
      { label: "Courses planned for at least 15 weeks", done: coursesWith15, total: courses.length, hint: "The lecture plan should cover 15 teaching weeks.", href: "/omc/reports/weekly-plan" },
      colCheck("assess", "Assessments add up to 100%", "Set quiz, assignment, midterm and final weights.", "/omc/weight-compliance"),
      colCheck("deliv", "Offered courses with lectures logged (90%+)", "Instructors must log each lecture as it happens.", "/omc/delivery-completion"),
      { label: "Exam papers approved", done: approvedPapers, total: papers.length, hint: "Papers waiting for the team's approval.", href: "/coordinator/courses" },
      { label: "Improvement actions closed", done: closedCqi, total: cqi.length, hint: "Follow up and close the open actions.", href: "/chairman/cqi" },
    ] },
    { no: 7, title: "Faculty", manual: ["Faculty-to-student ratio against the NCEAC limit", "Professional development, retention and office space"], checks: [
      colCheck("se", "Courses with a Subject Expert", "Give each course a Subject Expert.", "/coordinator/assign-subject-experts"),
      colCheck("inst", "Offered courses with an Instructor", "Assign the instructor.", "/coordinator/courses"),
      { label: "Faculty with a MS / PhD recorded", done: terminal, total: faculty.length, hint: "Faculty should record their degrees under My Profile.", href: "/faculty-report" },
      { label: "Faculty within their normal teaching load", done: loadOk, total: faculty.length, hint: "Some teachers have more courses than their normal load.", href: "/coordinator/load-report" },
      { label: "Faculty profiles 80% complete", done: facComplete, total: faculty.length, hint: "Ask faculty to complete My Profile.", href: "/faculty-report" },
    ] },
    { no: 8, title: "Infrastructure and Facilities", manual: ["Multimedia equipment and the learning environment", "Software licences, internet bandwidth, hardware per student", "Library resources, digital databases and textbooks"], checks: [
      { label: "Lecture rooms defined", done: Math.min(lectureRooms, 1), total: 1, hint: "Add the rooms in the timetable settings.", href: "/coordinator/timetable" },
      { label: "Computing labs defined", done: Math.min(labs, 1), total: 1, hint: "Add the labs in the timetable settings.", href: "/coordinator/timetable" },
    ] },
    { no: 9, title: "Industrial Linkages", manual: ["Advisory board and signed agreements with industry"], checks: [
      { label: "Employers on record (approved)", done: Math.min(employers, 1), total: 1, hint: "Record the employers your graduates work for.", href: "/coordinator/stakeholders" },
      { label: "Alumni on record (approved)", done: Math.min(alumni, 1), total: 1, hint: "Record your alumni.", href: "/coordinator/stakeholders" },
      { label: "Employer survey answered", done: surveyOf("EMPLOYER") > 0 ? 1 : 0, total: 1, hint: "Send the employer survey.", href: "/coordinator/surveys" },
      { label: "Batches with a capstone project", done: perBatch.filter((b) => b.capstone).length, total: perBatch.length, hint: "Add the final-year project course.", href: "/coordinator/courses" },
    ] },
    { no: 10, title: "Institutional Support", manual: ["Financial sustainability and budget for labs and library", "Administrative backing and departmental autonomy"], checks: [] },
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

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Accreditation Status</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        How ready your program is for an outcome-based accreditation review such as NCEAC, counted live from your own records.
        The ten criteria below follow the NCEAC program-evaluation structure as listed in the document you shared (please check the numbering against the official NCEAC manual). Each criterion gets the usual quality rating: E Exceptional (90%+), G Good (75%+), C Concern (60%+), W Weakness (40%+), D Deficient (below 40%), X not measured by this system.
      </p>
      <form method="get" style={{ marginBottom: 14, display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 13 }}>Show{" "}
          <select name="batchId" defaultValue={batchId} style={{ padding: "5px 8px" }}>
            <option value="">All batches</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
          </select>
        </label>
        <button className="btn" type="submit">Update</button>
      </form>

      <div className="card" style={{ display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
        <Donut value={overall} />
        <div style={{ flex: 1, minWidth: 260 }}>
          <h3 style={{ marginTop: 0 }}>Overall readiness</h3>
          <p style={{ fontSize: 13, color: "var(--slate)", marginTop: 0 }}>
            {courses.length} course(s) and {plos.length} PLO(s) in view. The overall figure is the average of the areas that already have data.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {scored.map(({ a, s }) => {
              const r = rate(s);
              return (
                <div key={a.no} style={{ display: "grid", gridTemplateColumns: "34px 270px 1fr 70px", gap: 10, alignItems: "center", fontSize: 13 }}>
                  <span title={r.name} style={{ background: r.colour, color: "#fff", fontWeight: 700, borderRadius: 6, textAlign: "center", padding: "3px 0" }}>{r.code}</span>
                  <span>{a.no}. {a.title}</span><Bar value={s} />
                  <b style={{ color: r.colour, textAlign: "right" }}>{s === null ? "—" : `${s}%`}</b>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {priorities.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Fix these first</h3>
          <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>The weakest items, lowest first.</p>
          {priorities.map((c, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr 70px 120px", gap: 10, alignItems: "center", padding: "7px 0", borderTop: i ? "1px solid #eee" : undefined, fontSize: 13 }}>
              <b style={{ color: colour(c.p) }}>{i + 1}</b>
              <span><b>{c.label}</b> <span style={{ color: "var(--slate)" }}>· {c.area}. {c.hint}</span></span>
              <b style={{ color: colour(c.p), textAlign: "right" }}>{c.p}%</b>
              <a href={c.href} className="btn" style={{ textAlign: "center", fontSize: 12 }}>Open</a>
            </div>
          ))}
        </div>
      )}

      {areas.map((a) => {
        const sc = areaScore(a), r = rate(sc);
        return (
          <div className="card" key={a.no}>
            <h3 style={{ marginTop: 0, display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ background: r.colour, color: "#fff", borderRadius: 6, padding: "2px 10px", fontSize: 14 }} title={r.name}>{r.code}</span>
              Criterion {a.no}: {a.title}
              <span style={{ marginLeft: "auto", fontSize: 13, color: r.colour }}>{sc === null ? "Not measured here" : `${sc}% · ${r.name}`}</span>
            </h3>
            {a.checks.map((c, i) => {
              const p = pct(c);
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(200px, 320px) 1fr 110px 80px", gap: 12, alignItems: "center", padding: "7px 0", borderTop: i ? "1px solid #eee" : undefined, fontSize: 13 }}>
                  <span>{c.label}</span><Bar value={p} />
                  <span style={{ color: "var(--slate)", textAlign: "right" }}>{c.total === 0 ? "nothing yet" : `${c.done} of ${c.total}`}</span>
                  <b style={{ color: colour(p), textAlign: "right" }}>{p === null ? "—" : `${p}%`}</b>
                </div>
              );
            })}
            {a.manual.length > 0 && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "#F4F1EA", fontSize: 12.5, color: "var(--slate)" }}>
                <b>Prepare separately (this system does not hold it):</b>
                <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{a.manual.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )}
          </div>
        );
      })}

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Course by course</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>
          {(Object.keys(STATE_COLOUR) as State[]).map((k) => (
            <span key={k} style={{ marginRight: 14 }}><i style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: STATE_COLOUR[k], marginRight: 5, verticalAlign: -1 }} />{STATE_TEXT[k]}</span>
          ))}
        </p>
        {courses.length === 0 ? <p style={{ color: "var(--slate)" }}>No courses yet.</p> : (
          <table>
            <thead><tr><th>Course</th>{COLS.map((c) => <th key={c.key} style={{ fontSize: 11, textAlign: "center", minWidth: 70 }}>{c.label}</th>)}</tr></thead>
            <tbody>
              {grid.map(({ c, st }) => (
                <tr key={c.id}>
                  <td style={{ whiteSpace: "nowrap" }}><b>{c.code}</b> <span style={{ color: "var(--slate)", fontSize: 12 }}>{c.title}</span></td>
                  {COLS.map((col) => { const state: State = st[col.key]; return (
                    <td key={col.key} style={{ textAlign: "center" }} title={`${col.label}: ${STATE_TEXT[state]}`}>
                      <i style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", background: STATE_COLOUR[state] }} />
                    </td>
                  ); })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ fontSize: 12, color: "var(--slate)" }}>
        This page measures the records this system holds. NCEAC also asks for things kept outside it (faculty contracts, budget, BOG/BOS minutes, lab and library inventory), so a full score here is not a guarantee of accreditation.
        The detailed evidence reports are in <a href="/coordinator/report-bundles">Report Bundles</a> (NCEAC Accreditation Package).
      </p>
    </Shell>
  );
}
