import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import CreateCourseForm from "../../../components/CreateCourseForm";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/courses", label: "Courses" },
];

export default async function CoordinatorCoursesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const courses = await prisma.course.findMany({
    where: { coordinatorId: user.id },
    orderBy: { createdAt: "desc" },
    include: { subjectExpert: true, masterCourse: true },
  });

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Courses</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Baseline course details — adopted from the HEC Master Curriculum where applicable.
      </p>

      <div className="card">
        <table>
          <thead><tr><th>Code</th><th>Title</th><th>Credit Hours</th><th>Source</th><th>Subject Expert</th></tr></thead>
          <tbody>
            {courses.length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No courses yet.</td></tr>
            )}
            {courses.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td><td>{c.title}</td><td>{c.creditHours}</td>
                <td>{c.masterCourse ? <span style={{ color: "var(--sage)" }}>HEC {c.masterCourse.category}</span> : "Manual entry"}</td>
                <td>{c.subjectExpert?.name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateCourseForm />
    </Shell>
  );
}
