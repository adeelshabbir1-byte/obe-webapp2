import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { erpAccess, edb, ensureAccounts, money } from "../../lib/erp";
import { ActionForm } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
type Acct = { id: string; code: string; name: string; type: string };

// Accounts: chart of accounts, trial balance, income & expenditure and balance sheet for a period, the journal.
export default async function AccountsPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const acc = await erpAccess(user);
  if (!acc.finance) redirect("/dashboard");
  try { await ensureAccounts(acc.chairmanId); } catch { return <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><div className="err">Accounts are not set up yet — run prisma/migration_erp.sql.</div></Shell>; }
  const y = new Date().getUTCFullYear();
  const from = searchParams.from || `${new Date().getUTCMonth() >= 6 ? y : y - 1}-07-01`, to = searchParams.to || new Date().toISOString().slice(0, 10);
  const accounts = (await edb.ledgerAccount.findMany({ where: { chairmanId: acc.chairmanId }, orderBy: { code: "asc" } })) as Acct[];
  const entries = (await edb.journalEntry.findMany({ where: { chairmanId: acc.chairmanId, date: { gte: new Date(from + "T00:00:00Z"), lte: new Date(to + "T23:59:59Z") } }, orderBy: { date: "desc" } })) as { id: string; date: Date; memo: string; source: string | null }[];
  const lines = (await edb.journalLine.findMany({ where: { entryId: { in: entries.map((e) => e.id) } } })) as { entryId: string; accountId: string; debit: number; credit: number }[];
  const bal = new Map<string, { dr: number; cr: number }>();
  for (const l of lines) { const x = bal.get(l.accountId) || { dr: 0, cr: 0 }; x.dr += l.debit; x.cr += l.credit; bal.set(l.accountId, x); }
  const net = (a: Acct) => { const x = bal.get(a.id) || { dr: 0, cr: 0 }; return ["ASSET", "EXPENSE"].includes(a.type) ? x.dr - x.cr : x.cr - x.dr; };
  const sum = (t: string) => accounts.filter((a) => a.type === t).reduce((s, a) => s + net(a), 0);
  const income = sum("INCOME"), expense = sum("EXPENSE");
  const tDr = Array.from(bal.values()).reduce((s, x) => s + x.dr, 0), tCr = Array.from(bal.values()).reduce((s, x) => s + x.cr, 0);
  const opts = accounts.map((a) => [a.code, `${a.code} ${a.name}`] as [string, string]);
  const Table = ({ type, title }: { type: string; title: string }) => (
    <div><b>{title}</b><table style={{ width: "100%", fontSize: 12.5 }}><tbody>{accounts.filter((a) => a.type === type && net(a) !== 0).map((a) => <tr key={a.id}><td>{a.code} {a.name}</td><td style={{ textAlign: "right" }}>{money(net(a))}</td></tr>)}<tr><td><b>Total</b></td><td style={{ textAlign: "right" }}><b>{money(sum(type))}</b></td></tr></tbody></table></div>
  );
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Accounts</h1>
      <p className="small-note">Fee invoices, concessions, fines, payments, payroll and purchases are posted here automatically. Period defaults to the fiscal year (1 July).</p>
      <form className="card" style={{ display: "flex", gap: 8, alignItems: "center" }}>From <input type="date" name="from" defaultValue={from} /> to <input type="date" name="to" defaultValue={to} /> <button className="btn btn-secondary btn-sm">Show</button></form>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        {[["Income", money(income)], ["Expenditure", money(expense)], [income - expense >= 0 ? "Surplus" : "Deficit", money(Math.abs(income - expense))], ["Cash + bank", money(accounts.filter((a) => ["1000", "1010"].includes(a.code)).reduce((s, a) => s + net(a), 0))], ["Fee receivable", money(accounts.filter((a) => a.code === "1100").reduce((s, a) => s + net(a), 0))]].map(([l, v]) => <div key={l} className="card" style={{ margin: 0 }}><div className="small-note">{l}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div></div>)}
      </div>
      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
        <div><h3 style={{ marginTop: 0 }}>Income &amp; expenditure</h3><Table type="INCOME" title="Income" /><div style={{ height: 8 }} /><Table type="EXPENSE" title="Expenditure" /></div>
        <div><h3 style={{ marginTop: 0 }}>Balance sheet (period movement)</h3><Table type="ASSET" title="Assets" /><div style={{ height: 8 }} /><Table type="LIABILITY" title="Liabilities" /><div style={{ height: 8 }} /><Table type="EQUITY" title="Fund" /></div>
      </div>
      <div className="card"><h3 style={{ marginTop: 0 }}>Record an entry</h3>
        <ActionForm url="/api/accounts" fixed={{ action: "journal" }} submit="Post" initial={{ date: to, debit: "5300", credit: "1010" }} fields={[{ name: "date", label: "Date", type: "date" }, { name: "memo", label: "Description", width: 220 }, { name: "debit", label: "Debit", type: "select", options: opts }, { name: "credit", label: "Credit", type: "select", options: opts }, { name: "amount", label: "Amount", type: "number", width: 110 }]} />
        <div style={{ marginTop: 8 }}><ActionForm url="/api/accounts" fixed={{ action: "addAccount" }} submit="Add account" collapsed openLabel="Add an account" initial={{ type: "EXPENSE" }} fields={[{ name: "code", label: "Code", width: 70 }, { name: "name", label: "Name", width: 200 }, { name: "type", label: "Type", type: "select", options: [["ASSET", "Asset"], ["LIABILITY", "Liability"], ["EQUITY", "Fund"], ["INCOME", "Income"], ["EXPENSE", "Expense"]] }]} /></div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Trial balance <span className="small-note">{Math.abs(tDr - tCr) < 1 ? "balanced ✓" : "not balanced"}</span></h3>
        <table style={{ fontSize: 12.5 }}><thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{accounts.filter((a) => bal.has(a.id)).map((a) => <tr key={a.id}><td>{a.code} {a.name}</td><td>{money(bal.get(a.id)!.dr)}</td><td>{money(bal.get(a.id)!.cr)}</td></tr>)}<tr><td><b>Total</b></td><td><b>{money(tDr)}</b></td><td><b>{money(tCr)}</b></td></tr></tbody></table>
      </div>
      <details className="card"><summary style={{ cursor: "pointer" }}><b>Journal</b> ({entries.length} entries)</summary>
        <table style={{ fontSize: 12.5, marginTop: 6 }}><tbody>{entries.slice(0, 200).map((e) => <tr key={e.id}><td className="small-note">{e.date.toISOString().slice(0, 10)}</td><td>{e.memo}</td><td className="small-note">{(e.source || "").toLowerCase().replace("_", " ")}</td><td>{lines.filter((l) => l.entryId === e.id).map((l) => { const a = accounts.find((x) => x.id === l.accountId); return <div key={l.accountId + l.debit}>{l.debit ? `Dr ${a?.code} ${money(l.debit)}` : `Cr ${a?.code} ${money(l.credit)}`}</div>; })}</td></tr>)}</tbody></table>
      </details>
    </Shell>
  );
}
