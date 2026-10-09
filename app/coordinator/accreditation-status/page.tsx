import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";

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
type Area = { key: string; title: string; checks: Check[] };

const pct = (c: Check) => (c.total === 0 ? null : Math.round((c.done / c.total) * 100));
const colour = (p: number | null) => (p === null ? "#9AA0A6" : p >= 80 ? "#2E7D4F" : p >= 50 ? "#C58A12" : "#B3261E");
const word = (p: number | null) => (p === null ? "No data yet" : p >= 80 ? "On track" : p >= 50 ? "Needs work" : "Weak");
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

  const [profile, plos, clos, seRows, instRows, instruments, marks, ploMaps, papers, cqi, templates, chairmanAlumni] = await Promise.all([
    prisma.programProfile.findMany({ where: { coordinatorId: user.id } }),
    prisma.pLO.findMany({ where: { coordinatorId: user.id, ...(batchId ? { batchId } : {}) }, select: { id: true, status: true, batchId: true } }),
    prisma.cLO.findMany({ where: { ...inCourses, source: "SE" }, select: { courseId: true, mappedPloId: true } }),
    prisma.lectureRow.findMany({ where: { ...inCourses, source: "SE" }, select: { courseId: true, cloId: true } }),
    prisma.lectureRow.findMany({ where: { ...inCourses, source: "INSTRUCTOR" }, select: { courseId: true, actualDate: true } }),
    prisma.assessmentInstrument.findMany({ where: { ...inCourses, source: "SE" }, select: { courseId: true, marksPct: true } }),
    prisma.studentMark.groupBy({ by: ["courseId"], where: inCourses, _count: { _all: true } }),
    prisma.coursePloMapping.findMany({ where: inCourses, select: { ploId: true } }),
    prisma.paperSubmission.findMany({ where: { leadCourseId: { in: courseIds.length ? courseIds : ["none"] } }, select: { status: true } }),
    prisma.cqiRecord.findMany({ where: { chairmanId: user.managedById || "none", OR: [{ courseId: { in: courseIds.length ? courseIds : ["none"] } }, { batchId: { in: batchIds.length ? batchIds : ["none"] } }] }, select: { status: true } }),
    prisma.surveyTemplate.findMany({ where: { coordinatorId: user.id }, select: { stakeholderType: true, responses: { where: { submittedAt: { not: null } }, select: { id: true } } } }),
    Promise.resolve(null),
  ]);
  void chairmanAlumni;

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

  const areas: Area[] = [
    { key: "peo", title: "Program objectives", checks: [
      { label: "Vision written", done: prof?.departmentVision?.trim() ? 1 : 0, total: 1, hint: "Fill in the vision on the Program Document page.", href: "/coordinator/program-profile" },
      { label: "Mission written", done: prof?.departmentMission?.trim() ? 1 : 0, total: 1, hint: "Fill in the mission on the Program Document page.", href: "/coordinator/program-profile" },
      { label: "Program Educational Objectives (at least 3)", done: Math.min(peoCount, 3), total: 3, hint: "Add the PEOs on the Program Document page.", href: "/coordinator/program-profile" },
    ] },
    { key: "plo", title: "Graduate attributes (PLOs)", checks: [
      { label: "Batches that have PLOs", done: scopeBatches.filter((b) => plos.some((p) => p.batchId === b.id)).length, total: scopeBatches.length, hint: "Create or import the PLOs for each batch.", href: "/coordinator/plos" },
      { label: "PLOs approved by the Institute Head", done: plos.filter((p) => p.status === "approved").length, total: plos.length, hint: "Send the PLOs for approval.", href: "/coordinator/plos" },
      { label: "PLOs covered by at least one course", done: plos.filter((p) => coveredPlos.has(p.id)).length, total: plos.length, hint: "Some PLOs are not taught anywhere. See the PLO coverage report.", href: "/omc/reports/coverage" },
    ] },
    { key: "cur", title: "Curriculum and course design", checks: [
      colCheck("clos", "Courses with CLOs written", "Ask the Subject Expert to write the CLOs.", "/coordinator/assign-subject-experts"),
      colCheck("plo", "CLOs linked to a PLO", "Link every CLO to a PLO.", "/omc/reports/audit"),
      colCheck("plan", "Courses with a lecture plan", "The Subject Expert must build the lecture plan.", "/coordinator/assign-subject-experts"),
      colCheck("link", "Lecture plan linked to CLOs", "Each lecture should point to a CLO.", "/omc/total-summary"),
      colCheck("assess", "Assessments add up to 100%", "Set quiz, assignment, midterm and final weights.", "/omc/weight-compliance"),
    ] },
    { key: "fac", title: "Faculty and delivery", checks: [
      colCheck("se", "Courses with a Subject Expert", "Give each course a Subject Expert.", "/coordinator/assign-subject-experts"),
      colCheck("inst", "Offered courses with an Instructor", "Assign the instructor.", "/coordinator/courses"),
      colCheck("deliv", "Offered courses with lectures logged (90%+)", "Instructors must log each lecture as it happens.", "/omc/delivery-completion"),
    ] },
    { key: "res", title: "Assessment and results", checks: [
      colCheck("marks", "Offered courses with marks entered", "Enter marks so attainment can be calculated.", "/omc/reports/result-mate"),
      { label: "Exam papers approved", done: approvedPapers, total: papers.length, hint: "Papers waiting for the team's approval.", href: "/coordinator/courses" },
    ] },
    { key: "cqi", title: "Continuous improvement", checks: [
      { label: "At least one improvement action recorded", done: cqi.length > 0 ? 1 : 0, total: 1, hint: "Record actions for weak CLOs or PLOs.", href: "/omc/reports/pass-rates" },
      { label: "Improvement actions closed", done: closedCqi, total: cqi.length, hint: "Follow up and close the open actions.", href: "/chairman/cqi" },
    ] },
    { key: "fb", title: "Stakeholder feedback", checks: [
      { label: "Student survey answered", done: surveyOf("STUDENT") > 0 ? 1 : 0, total: 1, hint: "Send the student survey.", href: "/coordinator/surveys" },
      { label: "Alumni survey answered", done: surveyOf("ALUMNI") > 0 ? 1 : 0, total: 1, hint: "Send the alumni survey.", href: "/coordinator/surveys" },
      { label: "Employer survey answered", done: surveyOf("EMPLOYER") > 0 ? 1 : 0, total: 1, hint: "Send the employer survey.", href: "/coordinator/surveys" },
    ] },
  ];
  const areaScore = (a: Area) => {
    const rated = a.checks.filter((c) => c.total > 0);
    return rated.length ? Math.round(rated.reduce((s, c) => s + (c.done / c.total) * 100, 0) / rated.length) : null;
  };
  const scored = areas.map((a) => ({ a, s: areaScore(a) }));
  const withData = scored.filter((x) => x.s !== null);
  const overall = withData.length ? Math.round(withData.reduce((s, x) => s + (x.s as number), 0) / withData.length) : null;
  const priorities = areas.flatMap((a) => a.checks.map((c) => ({ ...c, area: a.title, p: pct(c) })))
    .filter((c) => c.p !== null && c.p < 100).sort((x, y) => (x.p as number) - (y.p as number)).slice(0, 6);

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Accreditation Status</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        How ready your program is for an outcome-based accreditation review such as NCEAC, counted live from your own records.
        A score is the share of work that is done; half-done work counts as half. Green is 80% or more, amber 50–79%, red below 50%.
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
            {scored.map(({ a, s }) => (
              <div key={a.key} style={{ display: "grid", gridTemplateColumns: "210px 1fr 90px", gap: 10, alignItems: "center", fontSize: 13 }}>
                <span>{a.title}</span><Bar value={s} />
                <b style={{ color: colour(s), textAlign: "right" }}>{s === null ? "no data" : `${s}%`}</b>
              </div>
            ))}
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

      {areas.map((a) => (
        <div className="card" key={a.key}>
          <h3 style={{ marginTop: 0 }}>{a.title}</h3>
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
        </div>
      ))}

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
