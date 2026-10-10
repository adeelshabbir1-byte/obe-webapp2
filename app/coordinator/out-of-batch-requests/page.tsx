import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import OutOfBatchRequestsManager from "../../../components/OutOfBatchRequestsManager";
import { navForRole } from "../../../components/reportNav";


export default async function OutOfBatchRequestsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const requests = await prisma.outOfBatchRequest.findMany({
    where: { course: { coordinatorId: user.id } },
    include: { student: { include: { batch: true } }, course: { include: { batch: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Out-of-Batch Requests</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Students requesting to enroll in a course belonging to a different batch than their own.
      </p>
      <OutOfBatchRequestsManager
        initialRequests={requests.map((r) => ({
          id: r.id, status: r.status, reason: r.reason, reviewNote: r.reviewNote, createdAt: r.createdAt.toISOString(),
          studentName: r.student.name, studentRollNumber: r.student.rollNumber, studentBatchLabel: `${r.student.batch.degreeProgram} — ${r.student.batch.batchName}`,
          courseCode: r.course.code, courseTitle: r.course.title, courseBatchLabel: r.course.batch ? `${r.course.batch.degreeProgram} — ${r.course.batch.batchName}` : "—",
        }))}
      />
    </Shell>
  );
}
