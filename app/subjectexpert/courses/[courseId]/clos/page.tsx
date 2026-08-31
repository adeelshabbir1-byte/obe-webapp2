import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import AddCloForm from "../../../../../components/AddCloForm";
import DeleteButton from "../../../../../components/DeleteButton";

const NAV = [{ href: "/subjectexpert/courses", label: "My Assigned Courses" }];

export default async function ClosPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: { clos: { orderBy: { code: "asc" } } },
  });
  if (!course || course.subjectExpertId !== user.id) notFound();

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={NAV}>
      <CourseSubNav courseId={course.id} active="clos" code={course.code} title={course.title} status={course.templateStatus} />

      <div className="card">
        <table>
          <thead><tr><th>Code</th><th>Outcome</th><th>Bloom Level</th><th></th></tr></thead>
          <tbody>
            {course.clos.length === 0 && (
              <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No CLOs yet.</td></tr>
            )}
            {course.clos.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td><td>{c.statement}</td><td>{c.bloomLevel}</td>
                <td><DeleteButton endpoint={`/api/subjectexpert/courses/${course.id}/clo/${c.id}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddCloForm courseId={course.id} />
    </Shell>
  );
}
