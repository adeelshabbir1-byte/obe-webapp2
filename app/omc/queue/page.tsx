import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";

const NAV = [
  { href: "/omc/queue", label: "Review Queue" },
  { href: "/omc/plo-matrix", label: "PLO–Course Matrix" },
  { href: "/omc/weight-policy", label: "Weight Policy" },
  { href: "/omc/weight-exceptions", label: "Weight Exceptions" },
  { href: "/omc/reports", label: "Reports" },
];

function statusBadge(status: string) {
  const map: Record<string, [string, string]> = {
    submitted: ["#F4EFE1", "#8A6B2E"], approved: ["#E4EEE8", "#4B7A63"], "changes-requested": ["#F5EAE5", "#B1512E"],
  };
  const [bg, fg] = map[status] || ["#EFECE3", "#5B6B7C"];
  return <span style={{ background: bg, color: fg, fontSize: 10, textTransform: "uppercase", padding: "2px 8px", borderRadius: 2, fontWeight: 600 }}>{status.replace("-", " ")}</span>;
}

export default async function OmcQueuePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinators = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: user.managedById || "" } });
  const coordinatorIds = coordinators.map((c) => c.id);

  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, templateStatus: { not: "draft" } },
    include: { subjectExpert: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Review Queue</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Subject Expert course templates submitted for review.
      </p>
      <div className="card">
        <table>
          <thead><tr><th>Code</th><th>Title</th><th>Subject Expert</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {courses.length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--slate)" }}>Nothing submitted for review yet.</td></tr>
            )}
            {courses.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td><td>{c.title}</td><td>{c.subjectExpert?.name || "—"}</td>
                <td>{statusBadge(c.templateStatus)}</td>
                <td><a href={`/omc/templates/${c.id}`} style={{ color: "var(--brass-dark)", fontSize: 12.5 }}>Review</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
