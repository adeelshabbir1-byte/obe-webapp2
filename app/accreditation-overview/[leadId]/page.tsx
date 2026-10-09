import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import ReadinessReport from "../../../components/ReadinessReport";
import { computeReadiness } from "../../../lib/readiness";
import { OVERVIEW_ROLES, leadsInScope } from "../../../lib/readinessScope";
import { prisma } from "../../../lib/db";
import SnapshotButton from "../../../components/SnapshotButton";
import RemoveButton from "../../../components/RemoveButton";
import { requestRecipients } from "../../../lib/requests";

export default async function ProgramReadinessPage({ params, searchParams }: { params: { leadId: string }; searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!OVERVIEW_ROLES.includes(user.role)) redirect("/dashboard");
  const { chairmanId, leads } = await leadsInScope(user);
  const lead = leads.find((l) => l.id === params.leadId);
  if (!lead) notFound();
  const data = await computeReadiness({ id: lead.id, managedById: chairmanId, departmentId: lead.departmentId }, searchParams.batchId || "");
  const snaps = (await prisma.readinessSnapshot.findMany({ where: { leadId: lead.id } as never, orderBy: { createdAt: "desc" }, take: 12 })) as unknown as { id: string; label: string; overall: number | null; areas: string; createdAt: Date }[];
  const now = data.scored.map((x: { a: { no: number }; s: number | null }) => [x.a.no, x.s] as [number, number | null]);
  const recipients = await requestRecipients(chairmanId, lead);
  return (
    <Shell roleLabel="Accreditation" userName={user.name} navLinks={navForRole(user.role)}>
      <a className="btn" href="/accreditation-overview" style={{ marginBottom: 10, display: "inline-block" }}>← All programs</a>
      <a className="btn" href={`/accreditation-overview/${lead.id}/hec`} style={{ marginLeft: 8, marginBottom: 10, display: "inline-block" }}>Curriculum vs HEC</a>
      <h2 style={{ fontSize: 16, margin: "6px 0 2px", color: "var(--slate)" }}>{lead.leadProgram || "Program"} · {lead.department_?.name || ""} · Program Lead: {lead.name}</h2>
      <ReadinessReport data={data} sarHref={`/accreditation-overview/${lead.id}/sar`} ask={{ leadId: lead.id, programName: lead.leadProgram || "the program", recipients }} />
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Progress over time</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Save today's scores to compare with later. Each saved set is compared with the scores now.</p>
        <SnapshotButton leadId={lead.id} />
        {snaps.length > 0 && (
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Saved</th><th>Name</th><th>Overall then</th><th>Overall now</th>{now.map(([no]) => <th key={no}>C{no}</th>)}<th></th></tr></thead>
            <tbody>{snaps.map((sn) => {
              const old = new Map<number, number | null>((JSON.parse(sn.areas) as { no: number; score: number | null }[]).map((a) => [a.no, a.score]));
              const diff = (cur: number | null, prev: number | null | undefined) => (cur === null || prev === null || prev === undefined ? "—" : cur - prev === 0 ? "0" : `${cur - prev > 0 ? "+" : ""}${cur - prev}`);
              const col = (v: string) => (v.startsWith("+") ? "#2E7D4F" : v.startsWith("-") ? "#B3261E" : "inherit");
              return (
                <tr key={sn.id}>
                  <td>{sn.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td><td>{sn.label}</td><td>{sn.overall ?? "—"}%</td>
                  <td>{data.overall ?? "—"}% <span style={{ color: col(diff(data.overall, sn.overall)) }}>({diff(data.overall, sn.overall)})</span></td>
                  {now.map(([no, cur]) => { const d = diff(cur, old.get(no)); return <td key={no} style={{ color: col(d) }}>{old.get(no) ?? "—"} → {cur ?? "—"} ({d})</td>; })}
                  <td><RemoveButton url={`/api/snapshots?id=${sn.id}`} confirmText="Remove this saved set?" /></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
