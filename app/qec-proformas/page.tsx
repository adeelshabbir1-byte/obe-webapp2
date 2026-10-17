import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import QualityShell from "../../components/QualityShell";
import { PROFORMAS, REVIEW_ROLES, instituteOf } from "../../lib/quality";
import { qecStatus, leadsFor } from "../../lib/qecPack";

export const dynamic = "force-dynamic";

// The HEC QEC proformas mapped to where OBEHUB keeps each one, with what is on record and a one-file export.
export default async function QecProformasPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!REVIEW_ROLES.includes(user.role)) redirect("/dashboard");
  const cid = await instituteOf(user);
  const { count } = await qecStatus(cid || "none", await leadsFor(user, cid || "none"));
  return (
    <QualityShell user={user} title="QEC Proformas" intro="The HEC Quality Enhancement Cell's self-assessment proformas and where OBEHUB keeps each one. Download the pack for the QEC or the assessment team: one workbook with a summary and the results of each proforma the system holds. The numbering follows the HEC Self-Assessment Manual as we know it; check it against your QEC's current list.">
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <a className="btn btn-brass" href="/api/quality/proformas">⬇ Download the proforma pack (Excel)</a>
        <span className="small-note">{user.role === "PROGRAM_COORDINATOR" ? "Your programs only." : "The whole institute."}</span>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Proforma</th><th>Title</th><th>In OBEHUB</th><th>On record</th></tr></thead>
          <tbody>{PROFORMAS.map((p) => (
            <tr key={p.no}><td><b>{p.no}</b></td><td>{p.title}</td><td><Link href={p.href} style={{ color: "var(--brass-dark)" }}>{p.where}</Link></td>
              <td style={{ color: count[p.no] ? undefined : "var(--slate)" }}>{count[p.no] || p.note}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </QualityShell>
  );
}
