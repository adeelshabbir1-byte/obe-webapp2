import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";

const NAV = [{ href: "/instructor/courses", label: "My Semester Courses" }];

export default async function InstructorCoursesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");

  const [directCourses, sectionAssignments] = await Promise.all([
    prisma.course.findMany({
      where: { instructorId: user.id, isOffered: true },
      orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
      include: { batch: true, subjectExpert: true },
    }),
    prisma.courseSectionAssignment.findMany({
      where: { instructorId: user.id, course: { isOffered: true } },
      include: { course: { include: { batch: true, subjectExpert: true } } },
    }),
  ]);

  const byId = new Map<string, (typeof directCourses)[number] & { sectionCount?: number }>();
  for (const c of directCourses) byId.set(c.id, c);
  for (const a of sectionAssignments) {
    const existing = byId.get(a.course.id);
    byId.set(a.course.id, { ...(existing || a.course), sectionCount: a.sectionCount });
  }
  const courses = Array.from(byId.values());

  return (
    <Shell roleLabel="Faculty / Lecturer" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Semester Courses</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Courses currently offered and assigned to you.
      </p>
      <div className="card">
        <table>
          <thead><tr><th>Batch</th><th>Code</th><th>Title</th><th>Semester</th><th>Sections</th><th>Subject Expert</th></tr></thead>
          <tbody>
            {courses.length === 0 && (
              <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No courses assigned to you for the current semester yet.</td></tr>
            )}
            {courses.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 11.5 }}>{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—"}</td>
                <td>{c.code}</td><td>{c.title}</td><td>{c.semesterNumber ?? "—"}</td>
                <td>{c.sectionCount ?? "—"}</td>
                <td>{c.subjectExpert?.name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ borderColor: "var(--brass)" }}>
        <p style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>
          Course delivery screens (logging actual lecture dates, entering marks, attendance) aren't built yet —
          this page currently just confirms what you're assigned to teach this semester.
        </p>
      </div>
    </Shell>
  );
}
