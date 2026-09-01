import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import WeightExceptionsManager from "../../../components/WeightExceptionsManager";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/equivalence", label: "Course Equivalence" },
  { href: "/omc/reports", label: "Reports" },
];

export default async function WeightExceptionsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const requests = await prisma.weightExceptionRequest.findMany({
    where: { status: "pending", course: { coordinatorId: { in: coordinatorIds } } },
    include: { course: { include: { subjectExpert: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Weight Exceptions</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Course weightages a Subject Expert proposed that fall outside your Weight Policy ranges.
      </p>
      <WeightExceptionsManager
        initialRequests={requests.map((r) => ({
          id: r.id, courseCode: r.course.code, courseTitle: r.course.title,
          subjectExpertName: r.course.subjectExpert?.name || "—",
          assignmentPct: r.assignmentPct, quizPct: r.quizPct, projectPct: r.projectPct,
          labPct: r.labPct, midtermPct: r.midtermPct, finalPct: r.finalPct,
        }))}
      />
    </Shell>
  );
}
