import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
];

export default async function PrerequisiteMapPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const courses = await prisma.course.findMany({
    where: { coordinatorId: user.id },
    include: { batch: true, prerequisiteCourse: true, postrequisiteCourses: true },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
  });

  const withPrereq = courses.filter((c) => c.prerequisiteCourseId);
  const withoutFollowOn = courses.filter((c) => c.postrequisiteCourses.length === 0 && !withPrereq.some((w) => w.prerequisiteCourseId === c.id));

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Prerequisite Map</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Which courses feed into which — good for spotting a missing or mismatched prerequisite link.
      </p>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Batch</th><th>Course</th><th>Semester</th><th>Prerequisite</th><th>Feeds Into</th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No courses yet.</td></tr>}
            {courses.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 11.5 }}>{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—"}</td>
                <td><b>{c.code}</b> {c.title}</td><td>{c.semesterNumber ?? "—"}</td>
                <td>{c.prerequisiteCourse ? `${c.prerequisiteCourse.code} — ${c.prerequisiteCourse.title}` : <span style={{ color: "var(--slate)" }}>None set</span>}</td>
                <td style={{ fontSize: 11.5 }}>{c.postrequisiteCourses.length > 0 ? c.postrequisiteCourses.map((p) => p.code).join(", ") : <span style={{ color: "var(--slate)" }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <p style={{ fontSize: 12.5, color: "var(--slate)" }}>
          {courses.length} course(s) total, {withPrereq.length} with a prerequisite set. This report doesn't flag
          "missing" prerequisites automatically — no prerequisite is often correct (e.g. a first-semester course) —
          just gives you the full chain to review manually.
        </p>
      </div>
    </Shell>
  );
}
