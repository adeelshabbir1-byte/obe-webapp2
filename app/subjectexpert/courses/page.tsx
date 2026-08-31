import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";

const NAV = [{ href: "/subjectexpert/courses", label: "My Assigned Courses" }];

function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: "Draft", submitted: "Submitted", approved: "Approved", "changes-requested": "Changes Requested",
  };
  return map[status] || status;
}

export default async function SubjectExpertCoursesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const courses = await prisma.course.findMany({
    where: { subjectExpertId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Assigned Courses</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Build the gold-standard template for each course: CLOs, the 30-lecture schedule, and assessment weights.
      </p>
      <div className="card">
        <table>
          <thead><tr><th>Code</th><th>Title</th><th>Template Status</th><th></th></tr></thead>
          <tbody>
            {courses.length === 0 && (
              <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No courses assigned to you yet.</td></tr>
            )}
            {courses.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td><td>{c.title}</td><td>{statusLabel(c.templateStatus)}</td>
                <td><a href={`/subjectexpert/courses/${c.id}/clos`} style={{ color: "var(--brass-dark)", fontSize: 12.5 }}>Open</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
