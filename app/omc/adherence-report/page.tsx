import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { getCourseFamily } from "../../../lib/varianceReport";
import Shell from "../../../components/Shell";
import AutoSubmitSelect from "../../../components/AutoSubmitSelect";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/instructor-review", label: "Instructor Delivery Review" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/equivalence", label: "Course Equivalence" },
  { href: "/omc/adherence-report", label: "Cross-Instructor Comparison" },
  { href: "/omc/reports", label: "Reports" },
];

export default async function AdherenceReportPage({ searchParams }: { searchParams: { courseId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const instructorCourses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, instructorId: { not: null } },
    include: { batch: true },
    orderBy: { code: "asc" },
    distinct: ["code"],
  });

  const selectedCourseId = searchParams.courseId || instructorCourses[0]?.id || "";
  const family = selectedCourseId ? await getCourseFamily(selectedCourseId) : [];

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Cross-Instructor Comparison</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Compares instructors teaching the same course — across batches and semesters — by how closely each
        followed the Subject Expert's plan.
      </p>

      {instructorCourses.length === 0 ? (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No instructor-assigned courses yet.</p></div>
      ) : (
        <>
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em" }}>Course</label>
            <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={instructorCourses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))} />
          </div>

          <div className="card">
            <table>
              <thead><tr><th>Instructor</th><th>Batch</th><th>Term</th><th>Adherence %</th><th>Topics Missed</th></tr></thead>
              <tbody>
                {family.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No instructor deliveries found for this course.</td></tr>}
                {family.map((r) => (
                  <tr key={r.courseId}>
                    <td>{r.instructorName}</td><td style={{ fontSize: 11.5 }}>{r.batchLabel}</td><td>{r.term}</td>
                    <td style={{ fontWeight: 600, color: r.adherencePct >= 80 ? "var(--sage)" : "var(--rust)" }}>{r.adherencePct}%</td>
                    <td>{r.topicsMissed} / {r.totalTopics}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
