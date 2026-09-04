import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";



export default async function InstructorReviewListPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true, instructorId: { not: null } },
    include: { batch: true, instructor: true },
    orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
  });

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Instructor Delivery Review</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        See how each instructor's actual delivery compares to the Subject Expert's plan, and guide them directly.
      </p>
      <div className="card">
        <table>
          <thead><tr><th>Batch</th><th>Code</th><th>Title</th><th>Instructor</th><th></th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No instructor-assigned courses yet.</td></tr>}
            {courses.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 11.5 }}>{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—"}</td>
                <td>{c.code}</td><td>{c.title}</td><td>{c.instructor?.name || "—"}</td>
                <td><a href={`/omc/instructor-review/${c.id}`} style={{ color: "var(--brass-dark)", fontSize: 12.5 }}>Review</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
