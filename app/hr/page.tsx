import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { erpAccess, edb, money } from "../../lib/erp";
import { staffOf, linesText } from "../../lib/hr";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";

// HR: staff directory with pay structures and contract alerts, monthly payroll; every employee sees their own payslips here.
export default async function HrPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const acc = await erpAccess(user);
  const mine = ((await edb.payslip.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 24 }).catch(() => [])) as { id: string; runId: string; net: number }[]);
  const runsOfMine = mine.length ? ((await edb.payrollRun.findMany({ where: { id: { in: mine.map((m) => m.runId) }, status: { in: ["APPROVED", "PAID"] } } })) as { id: string; month: string }[]) : [];
  const staff = acc.hr ? await staffOf(acc.chairmanId) : [];
  const q = (searchParams.q || "").toLowerCase();
  const shown = staff.filter((s) => !q || `${s.name} ${s.email} ${s.department || ""} ${s.profile?.designation || ""}`.toLowerCase().includes(q));
  const runs = acc.hr ? ((await edb.payrollRun.findMany({ where: { chairmanId: acc.chairmanId }, orderBy: { month: "desc" }, take: 12 }).catch(() => null)) as { id: string; month: string; status: string; totalsJson: string }[] | null) : [];
  const year = 365 * 86400000;
  const alerts = staff.filter((s) => ["Contract", "Visiting"].includes(s.profile?.employmentType || "") && s.profile?.dateOfJoining && Date.now() - new Date(s.profile.dateOfJoining).getTime() > year - 30 * 86400000);
  const thisMonth = new Date().toISOString().slice(0, 7);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>HR &amp; Payroll</h1>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>My payslips</h3>
        {runsOfMine.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No payslips yet.</p> : runsOfMine.sort((a, b) => b.month.localeCompare(a.month)).map((r) => { const s = mine.find((m) => m.runId === r.id)!; return <span key={r.id} style={{ marginRight: 12 }}><Link href={`/hr/payslip/${s.id}`}>{r.month}</Link> <span className="small-note">{money(s.net)}</span></span>; })}
        <p className="small-note">Leave requests and appraisals: <Link href="/my-leave">My leave</Link> · <Link href="/appraisals">Appraisals</Link></p>
      </div>
      {acc.hr && (runs === null ? <div className="err">HR is not set up yet — run prisma/migration_erp.sql.</div> : (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Payroll</h3>
            <ActionForm url="/api/hr" fixed={{ action: "createRun" }} submit="Prepare payroll" initial={{ month: thisMonth }} fields={[{ name: "month", label: "Month (YYYY-MM)", width: 110 }]} />
            {runs.length > 0 && <table style={{ marginTop: 8 }}><thead><tr><th>Month</th><th>Staff</th><th>Gross</th><th>Tax</th><th>Net</th><th>Status</th><th /></tr></thead>
              <tbody>{runs.map((r) => { const t = JSON.parse(r.totalsJson || "{}"); return (
                <tr key={r.id}><td><Link href={`/hr/payslip/${r.id}?run=1`}>{r.month}</Link></td><td>{t.people}</td><td>{money(t.gross || 0)}</td><td>{money(t.tax || 0)}</td><td><b>{money(t.net || 0)}</b></td><td>{r.status.toLowerCase()}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{r.status === "DRAFT" && <><ActionButton url="/api/hr" body={{ action: "approveRun", runId: r.id }} label="Approve" className="act act-primary" confirmText="Approve and post to the accounts?" /> <ActionButton url="/api/hr" body={{ action: "deleteRun", runId: r.id }} label="Discard" className="act act-danger" /></>}
                    {r.status === "APPROVED" && <ActionButton url="/api/hr" body={{ action: "payRun", runId: r.id }} label="Mark paid (bank)" className="act act-primary" />}</td></tr>); })}</tbody></table>}
          </div>
          {alerts.length > 0 && <div className="card" style={{ borderLeft: "4px solid #B7791F" }}><b>Contracts to renew</b>{alerts.map((s) => <div key={s.id} style={{ fontSize: 13 }}>{s.name} — {s.profile?.employmentType}, joined {s.profile?.dateOfJoining?.toISOString().slice(0, 10)}</div>)}</div>}
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Staff ({staff.length})</h3>
            <form style={{ marginBottom: 8 }}><input name="q" defaultValue={searchParams.q || ""} placeholder="Search name, department, designation" style={{ width: 300 }} /> <button className="btn btn-secondary btn-sm">Find</button> <Link href="/chairman/employees" className="act">Upload employees</Link> <Link href="/chairman/org-chart" className="act">Organisation chart</Link></form>
            <table><thead><tr><th>Name</th><th>Department</th><th>Type</th><th>Basic</th><th>Pay structure</th></tr></thead>
              <tbody>{shown.slice(0, 200).map((s) => (
                <tr key={s.id}><td>{s.name}<div className="small-note">{s.profile?.designation || s.role.toLowerCase().replace("_", " ")}</div></td><td>{s.department || "—"}</td><td>{s.profile?.employmentType || "—"}</td><td>{s.pay ? money(s.pay.basic) : "—"}</td>
                  <td><ActionForm url="/api/hr" fixed={{ action: "setPay", userId: s.id }} submit="Save" collapsed openLabel={s.pay ? "Edit" : "Set pay"}
                    initial={{ basic: s.pay?.basic || "", allowances: s.pay ? linesText(s.pay.allowancesJson) : "", deductions: s.pay ? linesText(s.pay.deductionsJson) : "", taxPct: s.pay?.taxPct || 0, bank: s.pay?.bank || "", account: s.pay?.account || "" }}
                    fields={[{ name: "basic", label: "Basic", type: "number", width: 100 }, { name: "allowances", label: "Allowances (Name: amount, …)", width: 240 }, { name: "deductions", label: "Deductions (EOBI: 370, …)", width: 200 }, { name: "taxPct", label: "Tax %", type: "number", width: 60 }, { name: "bank", label: "Bank", width: 120 }, { name: "account", label: "Account no.", width: 140 }]} /></td></tr>))}</tbody></table>
          </div>
        </>
      ))}
    </Shell>
  );
}
