import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { coordinatorIdsFor } from "../../lib/reportScope";
import { BULK_CLO_ROLES } from "../../lib/cloBulk";
import { navForRole } from "../../components/reportNav";
import { ROLE_TEXT } from "../../lib/institutePeople";
import Shell from "../../components/Shell";
import BulkCloImport from "../../components/BulkCloImport";

export default async function BulkCloImportPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!BULK_CLO_ROLES.includes(user.role)) redirect("/dashboard");

  const ids = await coordinatorIdsFor(user);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: ids.length ? ids : ["none"] } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const counts = await prisma.course.groupBy({ by: ["batchId"], where: { batchId: { in: batches.map((b) => b.id) } }, _count: { _all: true } });
  const withClos = await prisma.course.groupBy({ by: ["batchId"], where: { batchId: { in: batches.map((b) => b.id) }, clos: { some: { source: "SE" } } }, _count: { _all: true } });

  return (
    <Shell roleLabel={ROLE_TEXT[user.role] || "Program Lead"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Bulk CLO Import</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Upload the CLOs of all courses of a batch at once, each with its PLO. The course-to-PLO mapping (PLO–Course matrix) is worked out from the CLOs, so you don&apos;t have to tick it separately.
      </p>
      <BulkCloImport batches={batches.map((b) => ({ id: b.id, label: `${b.degreeProgram} — ${b.batchName}`, courses: counts.find((c) => c.batchId === b.id)?._count._all || 0, withClos: withClos.find((c) => c.batchId === b.id)?._count._all || 0 }))} />
    </Shell>
  );
}
