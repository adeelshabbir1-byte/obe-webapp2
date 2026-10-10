import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";


export default async function BatchComparisonPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({
    where: { coordinatorId: user.id },
    orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }],
    include: { courses: true, plos: true },
  });

  const rows = await Promise.all(batches.map(async (b) => {
    const approvedPlos = b.plos.filter((p) => p.status === "approved").length;
    const studentsOnRoll = await prisma.student.count({ where: { batchId: b.id } });
    const coursesWithPlo = await prisma.coursePloMapping.groupBy({ by: ["courseId"], where: { course: { batchId: b.id } } });
    return {
      batch: b, studentsOnRoll, totalPlos: b.plos.length, approvedPlos,
      totalCourses: b.courses.length, coursesWithPloCount: coursesWithPlo.length,
    };
  }));

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Batch Comparison</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Side-by-side comparison of every batch — useful for spotting drift between cohorts of the same degree. "Students on Roll" is the number of students actually uploaded into the batch; "Intake Size" is the number typed in when the batch was created, and is flagged when the two differ.
      </p>
      <div className="card" style={{ overflowX: "auto" }}>
        <SortableTable>
          <thead><tr><th>Degree Program</th><th>Batch</th><th>Semester 1 Starts</th><th>Students on Roll</th><th>Intake Size (entered)</th><th>Courses</th><th>PLOs Defined</th><th>PLOs Approved</th><th>Courses with a PLO Assigned</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} style={{ color: "var(--slate)" }}>No batches yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.batch.id}>
                <td>{r.batch.degreeProgram}</td><td>{r.batch.batchName}</td><td>{r.batch.startTerm} {r.batch.startYear}</td>
                <td><b>{r.studentsOnRoll}</b></td><td>{r.batch.studentCount}{r.studentsOnRoll !== r.batch.studentCount && <span style={{ color: "var(--rust)", fontSize: 10.5, marginLeft: 6 }}>differs</span>}</td><td>{r.totalCourses}</td><td>{r.totalPlos}</td>
                <td>{r.approvedPlos} / {r.totalPlos}</td><td>{r.coursesWithPloCount} / {r.totalCourses}</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>
    </Shell>
  );
}
