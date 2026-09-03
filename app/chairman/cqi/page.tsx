import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import CqiManager from "../../../components/CqiManager";

export default async function CqiPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!["CHAIRMAN", "OMC"].includes(user.role)) redirect("/dashboard");

  const chairmanId = await chairmanIdFor(user);
  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const [records, batches, courses] = await Promise.all([
    prisma.cqiRecord.findMany({ where: { chairmanId }, include: { batch: true, course: true }, orderBy: { createdAt: "desc" } }),
    prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: { batchName: "desc" } }),
    prisma.course.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: { code: "asc" } }),
  ]);

  const nav = user.role === "CHAIRMAN"
    ? [
        { href: "/chairman/coordinators", label: "Program Coordinators" },
        { href: "/chairman/plos", label: "Program Learning Outcomes" },
        { href: "/chairman/omc", label: "OMC Members" },
        { href: "/chairman/assigners", label: "Course Assigners" },
        { href: "/chairman/cqi", label: "CQI Records" },
        { href: "/chairman/audit-log", label: "Audit Log" },
        { href: "/omc/reports", label: "Reports" },
      ]
    : [
        { href: "/omc/queue", label: "Review Queue" },
        { href: "/omc/instructor-review", label: "Instructor Delivery Review" },
        { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
        { href: "/omc/weight-policy", label: "Weight Policy" },
        { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
        { href: "/omc/equivalence", label: "Course Equivalence" },
        { href: "/chairman/cqi", label: "CQI Records" },
        { href: "/omc/reports", label: "Reports" },
      ];

  return (
    <Shell roleLabel={user.role === "CHAIRMAN" ? "Chairman" : "OMC Member"} userName={user.name} navLinks={nav}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Continuous Quality Improvement</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Log findings from reports or audits, track the action taken, and close the loop.
      </p>
      <CqiManager
        initialRecords={records.map((r) => ({
          id: r.id, finding: r.finding, actionTaken: r.actionTaken, status: r.status, createdAt: r.createdAt.toISOString(),
          batchLabel: r.batch ? `${r.batch.degreeProgram} — ${r.batch.batchName}` : null,
          courseLabel: r.course ? `${r.course.code} — ${r.course.title}` : null,
        }))}
        batches={batches.map((b) => ({ id: b.id, label: `${b.degreeProgram} — ${b.batchName}` }))}
        courses={courses.map((c) => ({ id: c.id, label: `${c.code} — ${c.title}` }))}
      />
    </Shell>
  );
}
