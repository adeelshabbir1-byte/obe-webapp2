import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import ReportPrintHeader from "../../../components/ReportPrintHeader";
import SortableTable from "../../../components/SortableTable";
import { navForRole } from "../../../components/reportNav";


export default async function RequiredBooksPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const courses = await prisma.course.findMany({
    where: { coordinatorId: user.id, isOffered: true },
    include: { instructor: true, batch: true },
    orderBy: [{ code: "asc" }],
  });

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Required Textbooks — This Semester" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Textbook and reference material for every course offered this semester, as set by each course's Subject Expert.
      </p>
      <div className="card" style={{ overflowX: "auto" }}>
        <SortableTable>
          <thead>
            <tr><th>Course</th><th>Batch</th><th>Instructor</th><th>Textbook</th><th>Reference Material</th></tr>
          </thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No courses offered this semester yet.</td></tr>}
            {courses.map((c) => (
              <tr key={c.id}>
                <td>{c.code} — {c.title}</td>
                <td>{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—"}</td>
                <td>{c.instructor?.name || "Unassigned"}</td>
                <td>{c.textbook || <span style={{ color: "var(--rust)" }}>Not set yet</span>}</td>
                <td>{c.referenceMaterial || "—"}</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>
    </Shell>
  );
}
