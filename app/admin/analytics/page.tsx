import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { adminCan, adminNavFor } from "../../../lib/platformTeam";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform Analytics" };

const xdb = prisma as unknown as Record<string, any>;
const safe = <T,>(p: Promise<T>, d: T) => p.catch(() => d);

// Read-only platform figures for the Super Admin and the Analytics role.
export default async function PlatformAnalytics() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!(await adminCan(user, "ANALYTICS"))) redirect("/dashboard");
  const adminNav = await adminNavFor(user);
  const since = new Date(Date.now() - 30 * 86400000);
  const [heads, byRole, batches, courses, offered, students, marks, active, members, offerings, applications, curricula, shared, imports] = await Promise.all([
    prisma.user.count({ where: { role: "CHAIRMAN" } }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true }, where: { isActive: true } }),
    prisma.batch.count(), prisma.course.count(), prisma.course.count({ where: { isOffered: true } }), prisma.student.count(), prisma.studentMark.count({ where: { updatedAt: { gte: since } } }),
    safe(prisma.session.groupBy({ by: ["userId"], where: { createdAt: { gte: since } } }).then((r) => r.length), 0),
    safe(xdb.consortiumMember.count({ where: { status: "ACTIVE" } }) as Promise<number>, 0), safe(xdb.consortiumOffering.count({}) as Promise<number>, 0), safe(xdb.consortiumApplication.count({}) as Promise<number>, 0),
    prisma.masterCurriculum.count(), prisma.publicCourse.count({ where: { status: "PUBLIC" } }), prisma.publicCourseImport.count(),
  ]);
  const tiles: [string, number | string][] = [["Institutes", heads], ["People signed in, last 30 days", active], ["Batches", batches], ["Courses (offered now)", `${courses} (${offered})`], ["Students", students], ["Marks entered, last 30 days", marks], ["Curricula", curricula], ["Shared Courses / imports", `${shared} / ${imports}`], ["Consortium members", members], ["Consortium courses / applications", `${offerings} / ${applications}`]];
  return (
    <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : "Platform Team"} userName={user.name} navLinks={adminNav}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Platform Analytics</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Read-only figures across every institute. No personal data is shown here.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
        {tiles.map(([l, v]) => <div key={l} className="card" style={{ margin: 0 }}><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><div className="small-note" style={{ margin: 0 }}>{l}</div></div>)}
      </div>
      <div className="card" style={{ marginTop: 12 }}><h3 style={{ marginTop: 0 }}>Active accounts by role</h3>
        <table style={{ fontSize: 13 }}><tbody>{byRole.sort((a, b) => b._count._all - a._count._all).map((r) => <tr key={r.role}><td>{r.role.replace(/_/g, " ").toLowerCase()}</td><td style={{ textAlign: "right", fontWeight: 700 }}>{r._count._all}</td></tr>)}</tbody></table></div>
    </Shell>
  );
}
