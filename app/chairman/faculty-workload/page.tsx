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
  { href: "/chairman/coordinators", label: "Program Coordinators" },
  { href: "/chairman/plos", label: "Program Learning Outcomes" },
  { href: "/chairman/omc", label: "OMC Members" },
  { href: "/chairman/assigners", label: "Course Assigners" }, { href: "/chairman/hierarchy", label: "Institute Chart" }, { href: "/chairman/faculties", label: "Faculties & Deans" }, { href: "/chairman/departments", label: "Departments" },
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
export default async function FacultyWorkloadPage() {
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
                <td style={{ padding: "5px 6px" }}><Link href={c.openHref} style={{ color: "var(--brass-dark)" }}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty Work Progress</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        What each faculty member is currently assigned, and how far along it is — as Subject Expert (building the
        course template) and as Instructor (delivering it this semester). Useful raw material when writing a
        faculty member's annual report.
      </p>

      <h2 style={{ fontSize: 15, marginBottom: 8 }}>As Subject Expert</h2>
      {seGroups.length === 0 ? <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No Subject Expert assignments in scope.</p> : seGroups.map((g) => renderFacultyGroup(g, true))}

      <h2 style={{ fontSize: 15, margin: "24px 0 8px" }}>As Instructor</h2>
      {instrGroups.length === 0 ? <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No Instructor assignments in scope.</p> : instrGroups.map((g) => renderFacultyGroup(g, false))}
    </Shell>
  );
}
