import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { def as taskDefOf } from "../../../lib/accreditation/governance";
import { StatusChip } from "../../../components/accreditation/Visuals";

export const dynamic = "force-dynamic";
export const metadata = { title: "My accreditation tasks" };

// The accreditation tasks given to the signed-in person.
export default async function MyAccreditationTasks() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  let missing = false;
  const tasks = await prisma.accreditationTask.findMany({ where: { assigneeId: user.id }, orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }] }).catch(() => { missing = true; return []; });
  const cycles = tasks.length ? await prisma.accreditationCycle.findMany({ where: { id: { in: tasks.map((t) => t.cycleId) } } }) : [];
  const cyc = new Map(cycles.map((c) => [c.id, c]));
  const now = new Date();
  const active = tasks.filter((t) => ["ASSIGNED", "RETURNED"].includes(t.status) && cyc.get(t.cycleId)?.status === "OPEN");
  const done = tasks.filter((t) => !active.includes(t));
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
  const row = (t: (typeof tasks)[number]) => {
    const c = cyc.get(t.cycleId)!, d = taskDefOf(c.body, t.code);
    const expired = t.accessUntil && t.accessUntil < now;
    return (
      <tr key={t.id}>
        <td><Link href={`/accreditation/tasks/${t.id}`}><b>{t.code}</b> {d?.title || ""}</Link></td>
        <td>{c.program}<div className="small-note">{c.body} · {c.title}</div></td>
        <td><StatusChip status={t.status} /></td>
        <td style={{ color: t.dueDate && t.dueDate < now && active.includes(t) ? "#B3261E" : undefined }}>{day(t.dueDate)}</td>
        <td style={{ color: expired ? "#B3261E" : undefined }}>{t.accessUntil ? `${expired ? "ended " : ""}${day(t.accessUntil)}` : "—"}</td>
      </tr>
    );
  };
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My accreditation tasks</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, margin: "0 0 12px", maxWidth: 860 }}>
        Parts of an accreditation visit your Chairman or Dean has given you. Each one shows the data the system already holds: check it, add what is missing and sign off. Your access to a task ends when you sign off, when it is withdrawn, or on its access date.
      </p>
      {missing && <div className="err">Accreditation tasks need prisma/migration_accreditation_governance.sql to be run in Supabase.</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>To do ({active.length})</h3>
        {active.length === 0 ? <p className="small-note" style={{ margin: 0 }}>Nothing waiting for you.</p> : (
          <table style={{ fontSize: 12.5 }}><thead><tr><th>Task</th><th>Program</th><th>Status</th><th>Due</th><th>Access until</th></tr></thead><tbody>{active.map(row)}</tbody></table>
        )}
      </div>
      {done.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Signed off or closed ({done.length})</h3>
          <table style={{ fontSize: 12.5 }}><thead><tr><th>Task</th><th>Program</th><th>Status</th><th>Due</th><th>Access until</th></tr></thead><tbody>{done.map(row)}</tbody></table>
        </div>
      )}
    </Shell>
  );
}
