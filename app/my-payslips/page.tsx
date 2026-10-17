import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { edb, money } from "../../lib/erp";

export const dynamic = "force-dynamic";

// Every staff member's own payslips (approved or paid runs only).
export default async function MyPayslips() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const slips = ((await edb.payslip.findMany({ where: { userId: user.id } }).catch(() => [])) as { id: string; runId: string; gross: number; net: number }[]);
  const runs = slips.length ? ((await edb.payrollRun.findMany({ where: { id: { in: slips.map((s) => s.runId) }, status: { in: ["APPROVED", "PAID"] } } })) as { id: string; month: string; status: string }[]) : [];
  const rOf = new Map(runs.map((r) => [r.id, r]));
  const mine = slips.filter((s) => rOf.has(s.runId)).sort((a, b) => rOf.get(b.runId)!.month.localeCompare(rOf.get(a.runId)!.month));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22 }}>My Payslips</h1>
      <div className="card">
        {mine.length ? <table><thead><tr><th>Month</th><th>Gross</th><th>Net</th><th>Status</th><th></th></tr></thead>
          <tbody>{mine.map((s) => { const r = rOf.get(s.runId)!; return <tr key={s.id}><td>{r.month}</td><td>{money(s.gross)}</td><td><b>{money(s.net)}</b></td><td>{r.status === "PAID" ? "Paid" : "Approved"}</td><td><Link href={`/hr/payslip/${s.id}`}>View / print</Link></td></tr>; })}</tbody></table>
          : <p className="small-note">No payslips yet.</p>}
      </div>
    </Shell>
  );
}
