import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import CqiManager from "../../../components/CqiManager";
import { navForRole } from "../../../components/reportNav";

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

  const peopleIds = Array.from(new Set(records.flatMap((r) => [r.authorId, r.lastUpdatedById]).filter((id): id is string => !!id)));
  const people = peopleIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: peopleIds } } }) : [];
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  const nav = navForRole(user.role);

  return (
    <Shell roleLabel={user.role === "CHAIRMAN" ? "Institute Head" : "OMC Member"} userName={user.name} navLinks={nav}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Continuous Quality Improvement</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Log findings from reports or audits, track the action taken, and close the loop.
      </p>
      <CqiManager
        initialRecords={records.map((r) => ({
          id: r.id, finding: r.finding, actionTaken: r.actionTaken, status: r.status, createdAt: r.createdAt.toISOString(),
          authorName: nameById.get(r.authorId) || null,
          lastUpdatedByName: r.lastUpdatedById ? nameById.get(r.lastUpdatedById) || null : null,
          batchLabel: r.batch ? `${r.batch.degreeProgram} — ${r.batch.batchName}` : null,
          courseLabel: r.course ? `${r.course.code} — ${r.course.title}` : null,
          sourceType: r.sourceType, sourceReference: r.sourceReference, metricBefore: r.metricBefore, metricAfter: r.metricAfter,
        }))}
        batches={batches.map((b) => ({ id: b.id, label: `${b.degreeProgram} — ${b.batchName}` }))}
        courses={courses.map((c) => ({ id: c.id, label: `${c.code} — ${c.title}` }))}
      />
    </Shell>
  );
}
