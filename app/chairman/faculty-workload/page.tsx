import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { courseScopeFor } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import Link from "next/link";
import { buildSeProgress, buildInstructorProgress, progressPct, ProgressStep } from "../../../lib/courseProgress";
import ProgressBar from "../../../components/ProgressBar";

const NAV = [
  { href: "/chairman/faculty-workload", label: "Teacher Work Progress" },
  { href: "/chairman/coordinators", label: "Program Leads" }, { href: "/course-split", label: "Course Split" }, { href: "/faculty-report", label: "Faculty Details Report" }, { href: "/lab-inventory", label: "Lab Inventory" }, { href: "/library-inventory", label: "Library Inventory" }, { href: "/chairman/finance", label: "Finance" }, { href: "/accreditation-overview", label: "Accreditation Overview" }, { href: "/deadlines", label: "Deadlines" }, { href: "/academic-calendar", label: "Academic Calendar" }, { href: "/admission-criteria", label: "Admission Criteria" }, { href: "/move-program", label: "Move Program Data" },
  { href: "/chairman/plos", label: "Program Learning Outcomes" },
  { href: "/chairman/omc", label: "OMC Members" }, { href: "/chairman/people", label: "All Users and Roles" },
  { href: "/chairman/assigners", label: "Course Assigners" }, { href: "/chairman/hierarchy", label: "Institute Chart" }, { href: "/chairman/faculties", label: "Faculties & Deans" }, { href: "/course-leads", label: "Course Leads" }, { href: "/chairman/departments", label: "Departments" },
  { href: "/chairman/cqi", label: "CQI Records" },
  { href: "/chairman/audit-log", label: "Audit Log" }, { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" }, { href: "/omc/course-repositioning", label: "Course Repositioning" }, { href: "/coordinator/program-semester-map", label: "Program Semester Map" },
  { href: "/chairman/report-access", label: "Report Access Control" },
  { href: "/chairman/alumni-custodian", label: "Alumni Data Custodian" },
  { href: "/chairman/ai-configuration", label: "AI Configuration" },
  { href: "/omc/reports", label: "Reports" },
];

function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: "Draft", submitted: "Submitted", approved: "Approved", "changes-requested": "Changes Requested",
  };
  return map[status] || status;
}

// Gives the chairman one place to see, per faculty member, which courses
// they're carrying and how far along each one is — as both Subject Expert
// (template building) and Instructor (actual delivery) work, since the
// same person can hold both roles on different courses. Doubles as the
// raw material for writing a faculty member's annual report: what were
// they assigned, and did they actually get it done.
export default async function FacultyWorkloadPage({ searchParams }: { searchParams: { faculty?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const scope = courseScopeFor(user);
  const allCourses = await prisma.course.findMany({
    where: scope,
    include: {
      batch: true,
      subjectExpert: true,
      instructor: true,
      contentSyncMember: true,
    },
  });

  // --- Subject Expert side: only base/standalone courses are real work
  // items (followers just copy the base automatically) — same rule as
  // the SE's own "My Assigned Courses" list.
  const seCourses = allCourses.filter((c) => c.subjectExpertId && (!c.contentSyncMember || c.contentSyncMember.isBase));
  const seCourseIds = seCourses.map((c) => c.id);

  // --- Instructor side: every course actually assigned to an instructor
  // (delivery is always a real, independent copy — no base/follower
  // concept applies to it).
  const instrCourses = allCourses.filter((c) => c.instructorId);
  const instrCourseIds = instrCourses.map((c) => c.id);

  const [seClos, seLectures, seInstruments, seLinks, sePaperItems] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId: { in: seCourseIds }, source: "SE" } }),
    prisma.lectureRow.findMany({ where: { courseId: { in: seCourseIds }, source: "SE" } }),
    prisma.assessmentInstrument.findMany({ where: { courseId: { in: seCourseIds }, source: "SE" } }),
    prisma.lectureRowInstrument.findMany({ where: { instrument: { courseId: { in: seCourseIds }, source: "SE" } }, select: { instrumentId: true } }),
    prisma.paperDistributionItem.findMany({ where: { courseId: { in: seCourseIds }, source: "SE" }, select: { courseId: true, examType: true } }),
  ]);
  const seLinkedInstrumentIds = new Set(seLinks.map((l) => l.instrumentId));

  const [instrLectures, instrMarks, instrAttendance, instrPaperItems] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId: { in: instrCourseIds }, source: "INSTRUCTOR" }, select: { courseId: true, actualDate: true } }),
    prisma.studentMark.findMany({ where: { courseId: { in: instrCourseIds } }, select: { courseId: true } }),
    prisma.attendanceRecord.findMany({ where: { courseId: { in: instrCourseIds } }, select: { courseId: true } }),
    prisma.paperDistributionItem.findMany({ where: { courseId: { in: instrCourseIds }, source: "INSTRUCTOR" }, select: { courseId: true, examType: true } }),
  ]);

  const seProgressByCourse = new Map<string, ProgressStep[]>();
  for (const c of seCourses) {
    const cClos = seClos.filter((x) => x.courseId === c.id);
    const cLectures = seLectures.filter((x) => x.courseId === c.id);
    const cInstruments = seInstruments.filter((x) => x.courseId === c.id);
    const instrumentsWithNoLink = cInstruments.filter((i) => !seLinkedInstrumentIds.has(i.id)).length;
    const cPaperItems = sePaperItems.filter((x) => x.courseId === c.id);
    seProgressByCourse.set(c.id, buildSeProgress({
      cloCount: cClos.length,
      lectureCount: cLectures.length,
      lectureMappedCount: cLectures.filter((r) => !!r.cloId).length,
      instrumentCount: cInstruments.length,
      instrumentsWithNoLink,
      midtermPaperCount: cPaperItems.filter((p) => p.examType === "Midterm").length,
      finalPaperCount: cPaperItems.filter((p) => p.examType === "Final").length,
      templateStatus: c.templateStatus,
    }));
  }

  const instrProgressByCourse = new Map<string, ProgressStep[]>();
  for (const c of instrCourses) {
    const cLectures = instrLectures.filter((x) => x.courseId === c.id);
    const cPaperItems = instrPaperItems.filter((x) => x.courseId === c.id);
    instrProgressByCourse.set(c.id, buildInstructorProgress({
      lectureCount: cLectures.length,
      lectureDeliveredCount: cLectures.filter((r) => !!r.actualDate).length,
      marksEnteredCount: instrMarks.filter((m) => m.courseId === c.id).length,
      attendanceRecordCount: instrAttendance.filter((a) => a.courseId === c.id).length,
      midtermPaperCount: cPaperItems.filter((p) => p.examType === "Midterm").length,
      finalPaperCount: cPaperItems.filter((p) => p.examType === "Final").length,
    }));
  }

  type FacultyGroup = { id: string; name: string; email: string; courses: { id: string; code: string; title: string; batchLabel: string; steps: ProgressStep[]; openHref: string; statusLabel: string }[] };

  function groupByFaculty(
    courses: typeof allCourses,
    pickFaculty: (c: (typeof allCourses)[number]) => { id: string; name: string; email: string } | null,
    progressMap: Map<string, ProgressStep[]>,
    openHrefFor: (courseId: string) => string,
    statusFor: (c: (typeof allCourses)[number]) => string
  ): FacultyGroup[] {
    const byId = new Map<string, FacultyGroup>();
    for (const c of courses) {
      const f = pickFaculty(c);
      if (!f) continue;
      const group = byId.get(f.id) || { id: f.id, name: f.name, email: f.email, courses: [] };
      const batchLabel = c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—";
      group.courses.push({
        id: c.id, code: c.code, title: c.title, batchLabel,
        steps: progressMap.get(c.id) || [], openHref: openHrefFor(c.id), statusLabel: statusFor(c),
      });
      byId.set(f.id, group);
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  const seGroups = groupByFaculty(
    seCourses, (c) => c.subjectExpert ? { id: c.subjectExpert.id, name: c.subjectExpert.name, email: c.subjectExpert.email } : null,
    seProgressByCourse, (id) => `/subjectexpert/courses/${id}/clos`,
    (c) => statusLabel(c.templateStatus)
  );
  const instrGroups = groupByFaculty(
    instrCourses, (c) => c.instructor ? { id: c.instructor.id, name: c.instructor.name, email: c.instructor.email } : null,
    instrProgressByCourse, (id) => `/instructor/courses/${id}/clos`,
    () => "" // statusLabel isn't shown on the Instructor side (see showStatus=false below)
  );

  function renderFacultyGroup(g: FacultyGroup, showStatus: boolean) {
    const overall = g.courses.length > 0
      ? Math.round(g.courses.reduce((s, c) => s + progressPct(c.steps), 0) / g.courses.length)
      : 0;
    return (
      <div key={g.id} className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div>
            <b style={{ fontSize: 14 }}>{g.name}</b>
            <span style={{ color: "var(--slate)", fontSize: 11.5, marginLeft: 8 }}>{g.email}</span>
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: overall === 100 ? "var(--sage)" : "var(--brass-dark)" }}>
            {g.courses.length} course{g.courses.length !== 1 ? "s" : ""} · {overall}% overall
          </span>
        </div>
        <table style={{ width: "100%", fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--slate)", fontSize: 11 }}>
              <th style={{ padding: "3px 6px" }}>Course</th>
              <th style={{ padding: "3px 6px" }}>Batch / Semester</th>
              <th style={{ padding: "3px 6px" }}>Progress</th>
              {showStatus && <th style={{ padding: "3px 6px" }}>Status</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {g.courses.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                <td style={{ padding: "5px 6px" }}>{c.code} — {c.title}</td>
                <td style={{ padding: "5px 6px" }}>{c.batchLabel}</td>
                <td style={{ padding: "5px 6px" }}><ProgressBar steps={c.steps} width={90} /></td>
                {showStatus && <td style={{ padding: "5px 6px" }}>{c.statusLabel}</td>}
                <td style={{ padding: "5px 6px" }}><Link href={c.openHref} className="act act-primary">Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // One row per person, combining the Subject Expert and Instructor work they carry.
  const people = new Map<string, { id: string; name: string; email: string; se?: FacultyGroup; instr?: FacultyGroup }>();
  for (const g of seGroups) people.set(g.id, { id: g.id, name: g.name, email: g.email, se: g });
  for (const g of instrGroups) people.set(g.id, { ...(people.get(g.id) || { id: g.id, name: g.name, email: g.email }), instr: g });
  const avg = (g?: FacultyGroup) => (g && g.courses.length ? Math.round(g.courses.reduce((n, c) => n + progressPct(c.steps), 0) / g.courses.length) : null);
  const summary = Array.from(people.values()).map((p) => {
    const all = [...(p.se?.courses || []), ...(p.instr?.courses || [])];
    const overall = all.length ? Math.round(all.reduce((n, c) => n + progressPct(c.steps), 0) / all.length) : 0;
    return { ...p, courses: all.length, seAvg: avg(p.se), instrAvg: avg(p.instr), overall };
  }).sort((x, y) => x.name.localeCompare(y.name));
  const tone = (v: number | null) => (v === null ? "#9AA0A6" : v >= 75 ? "#2E7D4F" : v >= 40 ? "#B7791F" : "#B3261E");
  const selected = summary.find((p) => p.id === searchParams.faculty);
  const instituteAvg = summary.length ? Math.round(summary.reduce((n, p) => n + p.overall, 0) / summary.length) : null;

  if (selected) {
    return (
      <Shell roleLabel="Institute Head" userName={user.name} navLinks={NAV}>
        <Link href="/chairman/faculty-workload" className="btn" style={{ marginBottom: 10, display: "inline-block" }}>← All faculty</Link>
        <h1 style={{ fontSize: 22, marginBottom: 2 }}>{selected.name}</h1>
        <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
          {selected.email} · {selected.courses} course{selected.courses !== 1 ? "s" : ""} ·{" "}
          <b style={{ color: tone(selected.overall) }}>{selected.overall}% overall</b>
          {selected.seAvg !== null && <> · Subject Expert work {selected.seAvg}%</>}
          {selected.instrAvg !== null && <> · Teaching {selected.instrAvg}%</>}
          {" · "}<Link href={`/faculty-report/${selected.id}`} style={{ color: "var(--brass-dark)" }}>Faculty profile report</Link>
        </p>
        {selected.se && (<><h2 style={{ fontSize: 15, marginBottom: 8 }}>As Subject Expert</h2>{renderFacultyGroup(selected.se, true)}</>)}
        {selected.instr && (<><h2 style={{ fontSize: 15, margin: "20px 0 8px" }}>As Instructor</h2>{renderFacultyGroup(selected.instr, false)}</>)}
      </Shell>
    );
  }

  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty Work Progress</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        Overall percentage of work done by each faculty member, across the courses they build as Subject Expert and the courses they teach.
        Click "View details" to see every course of that person and which steps are still open.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        {([["Faculty with work assigned", summary.length], ["Average progress", instituteAvg === null ? "—" : `${instituteAvg}%`], ["Below 40%", summary.filter((p) => p.overall < 40).length]] as [string, string | number][]).map(([l, v]) => (
          <div key={l} style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 18px", minWidth: 150 }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "Georgia, serif" }}>{v}</div>
            <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{l}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        {summary.length === 0 ? <p style={{ color: "var(--slate)" }}>No faculty have courses assigned yet.</p> : (
          <table style={{ width: "100%" }}>
            <thead><tr style={{ textAlign: "left" }}><th>Faculty</th><th>Courses</th><th>Subject Expert work</th><th>Teaching</th><th style={{ minWidth: 170 }}>Overall</th><th></th></tr></thead>
            <tbody>
              {summary.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b><div style={{ fontSize: 11.5, color: "var(--slate)" }}>{p.email}</div></td>
                  <td>{p.courses}</td>
                  <td style={{ color: tone(p.seAvg) }}>{p.seAvg === null ? "—" : `${p.seAvg}%`}</td>
                  <td style={{ color: tone(p.instrAvg) }}>{p.instrAvg === null ? "—" : `${p.instrAvg}%`}</td>
                  <td>
                    <b style={{ color: tone(p.overall) }}>{p.overall}%</b>
                    <div style={{ background: "#ECE8E0", borderRadius: 6, height: 8, marginTop: 3 }}><div style={{ width: `${p.overall}%`, height: "100%", background: tone(p.overall), borderRadius: 6 }} /></div>
                  </td>
                  <td><Link className="btn" style={{ fontSize: 12 }} href={`/chairman/faculty-workload?faculty=${p.id}`}>View details</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 10 }}>
          Overall is the average of every course's progress, each course counting equally. Subject Expert steps: CLOs, lecture plan, assessments, paper distribution, submission. Teaching steps: lectures delivered, paper distribution, marks, attendance.
        </p>
      </div>
    </Shell>
  );
}
