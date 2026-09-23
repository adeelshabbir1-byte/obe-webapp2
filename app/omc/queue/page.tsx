import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import Link from "next/link";



function statusBadge(status: string) {
  const map: Record<string, [string, string]> = {
    submitted: ["#E8E6FB", "#8A6B2E"], approved: ["#CCFBF1", "#4B7A63"], "changes-requested": ["#FFE4DC", "#B1512E"],
  };
  const [bg, fg] = map[status] || ["#EFECE3", "#5B6B7C"];
  return <span style={{ background: bg, color: fg, fontSize: 10, textTransform: "uppercase", padding: "2px 8px", borderRadius: 2, fontWeight: 600 }}>{status.replace("-", " ")}</span>;
}

export default async function OmcQueuePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, templateStatus: { not: "draft" } },
    include: { subjectExpert: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Review Queue</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Subject Expert course templates submitted for review.
      </p>
      <div className="card">
        <SortableTable>
          <thead><tr><th>Code</th><th>Title</th><th>Subject Expert</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {courses.length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--slate)" }}>Nothing submitted for review yet.</td></tr>
            )}
            {courses.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td><td>{c.title}</td><td>{c.subjectExpert?.name || "—"}</td>
                <td>{statusBadge(c.templateStatus)}</td>
                <td><Link href={`/omc/templates/${c.id}`} style={{ color: "var(--brass-dark)", fontSize: 12.5 }}>Review</Link></td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>
    </Shell>
  );
}
