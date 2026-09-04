import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor, chairmanIdFor } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import DegreeBatchFilter from "../../../components/DegreeBatchFilter";

type Status = "none" | "draft" | "approved-unassigned" | "healthy";
const STATUS_STYLE: Record<Status, { label: string; bg: string; color: string }> = {
  none: { label: "Not Defined", bg: "#F1F1F1", color: "#8A8A8A" },
  draft: { label: "Draft", bg: "#E8E6FB", color: "#4338CA" },
  "approved-unassigned": { label: "Approved, No Course Assigned", bg: "#FFE4DC", color: "#F0653E" },
  healthy: { label: "Approved & Assigned", bg: "#CCFBF1", color: "#0D9488" },
};

export default async function PloReadinessPage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);

  let batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" } ] });
  const allBatches = batches;
  if (searchParams.batchId) batches = batches.filter((b) => b.id === searchParams.batchId);
  else if (searchParams.degree) batches = batches.filter((b) => b.degreeProgram === searchParams.degree);
  const plos = await prisma.pLO.findMany({
    where: { coordinatorId: { in: coordinatorIds } },
    include: { ploMappings: true },
  });

  const maxNumber = plos.length > 0 ? Math.max(...plos.map((p) => p.number), 10) : 10;
  const numbers = Array.from({ length: maxNumber }, (_, i) => i + 1);

  function statusFor(batchId: string, number: number): { status: Status; title: string } {
    const plo = plos.find((p) => p.batchId === batchId && p.number === number);
    if (!plo) return { status: "none", title: "" };
    if (plo.status !== "approved") return { status: "draft", title: plo.title };
    if (plo.ploMappings.length === 0) return { status: "approved-unassigned", title: plo.title };
    return { status: "healthy", title: plo.title };
  }

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>PLO Readiness Matrix</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every PLO number, across every batch, color-coded by status.
      </p>

      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
      </div>

      <div className="card">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
          {(Object.keys(STATUS_STYLE) as Status[]).map((s) => (
            <span key={s} style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 12, height: 12, background: STATUS_STYLE[s].bg, display: "inline-block", border: "1px solid var(--line)" }} />
              {STATUS_STYLE[s].label}
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ width: 70 }}>PLO #</th>
              {batches.map((b) => <th key={b.id} style={{ minWidth: 130, fontSize: 10.5 }}>{b.degreeProgram}<br />{b.batchName}</th>)}
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 && <tr><td colSpan={1} style={{ color: "var(--slate)" }}>No batches yet.</td></tr>}
            {numbers.map((n) => (
              <tr key={n}>
                <td style={{ fontWeight: 600 }}>PLO-{n}</td>
                {batches.map((b) => {
                  const { status, title } = statusFor(b.id, n);
                  const style = STATUS_STYLE[status];
                  return (
                    <td key={b.id} title={title} style={{ background: style.bg, color: style.color, textAlign: "center", fontSize: 10.5, fontWeight: 600 }}>
                      {status !== "none" ? style.label : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
