import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { adminCan, adminNavFor } from "../../../lib/platformTeam";
import { listReports, pilotOf } from "../../../lib/problemReports";
import ProblemReportsAdmin from "../../../components/ProblemReportsAdmin";

export const dynamic = "force-dynamic";

// Platform → Problem reports: what pilot users reported from the "Report a problem" button, with filters, a status and
// a reply each (the reporter hears it in the bell), the per-institute pilot switch, and Excel for the builders.
export default async function ProblemReportsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!(await adminCan(user, "SUPPORT"))) redirect("/dashboard");
  const filters = { status: searchParams.status || "", kind: searchParams.kind || "", role: searchParams.role || "", page: searchParams.page || "" };
  const [rows, heads] = await Promise.all([
    listReports({ status: filters.status || undefined, kind: filters.kind || undefined, role: filters.role || undefined, page: filters.page || undefined }),
    prisma.user.findMany({ where: { role: "CHAIRMAN" as never, isActive: true }, orderBy: { instituteName: "asc" }, select: { id: true, name: true, instituteName: true } }),
  ]);
  const insts = await Promise.all(heads.map(async (h) => ({ id: h.id, name: h.instituteName || h.name, ...(await pilotOf(h.id)), departments: await prisma.department.findMany({ where: { chairmanId: h.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }) })));
  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={await adminNavFor(user)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Problem reports</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>From the “Report a problem” button on every page (pilot). Each has the page, the person, their browser and a screenshot.</p>
      <ProblemReportsAdmin rows={JSON.parse(JSON.stringify(rows))} insts={insts} filters={filters} />
    </Shell>
  );
}
