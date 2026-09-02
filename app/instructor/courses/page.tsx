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
        Courses currently offered and assigned to you. Click "Open" to record your actual delivery — starts as
        an editable copy of the Subject Expert's plan.
      </p>
      <div className="card">
        <table>
          <thead><tr><th>Batch</th><th>Code</th><th>Title</th><th>Semester</th><th>Sections</th><th>Subject Expert</th><th></th></tr></thead>
          <tbody>
            {courses.length === 0 && (
              <tr><td colSpan={7} style={{ color: "var(--slate)" }}>No courses assigned to you for the current semester yet.</td></tr>
            )}
            {courses.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 11.5 }}>{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—"}</td>
                <td>{c.code}</td><td>{c.title}</td><td>{c.semesterNumber ?? "—"}</td>
                <td>{c.sectionCount ?? "—"}</td>
                <td>{c.subjectExpert?.name || "—"}</td>
                <td><a href={`/instructor/courses/${c.id}/clos`} style={{ color: "var(--brass-dark)", fontSize: 12.5 }}>Open</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}