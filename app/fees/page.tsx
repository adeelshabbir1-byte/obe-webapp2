import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { erpAccess, edb, money } from "../../lib/erp";
import { balanceOf } from "../../lib/fees";
import { ActionForm } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
type Inv = { id: string; studentId: string; termName: string; termYear: number; amount: number; discount: number; fine: number; paid: number; dueDate: Date; status: string };

// Student fees: issue term invoices per batch, concessions, late fines, payments, defaulters, collection.
export default async function FeesPage({ searchParams }: { searchParams: { status?: string; batch?: string; q?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const acc = await erpAccess(user);
  if (!acc.finance) redirect("/dashboard");
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: acc.chairmanId } }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }], select: { id: true, degreeProgram: true, batchName: true } });
  const sts = searchParams.batch ? (await prisma.student.findMany({ where: { batchId: searchParams.batch }, select: { id: true } })).map((s) => s.id) : null;
  const invs = ((await edb.feeInvoice.findMany({ where: { chairmanId: acc.chairmanId, ...(searchParams.status ? { status: searchParams.status } : {}), ...(sts ? { studentId: { in: sts } } : {}) }, orderBy: { createdAt: "desc" }, take: 3000 }).catch(() => null)) as Inv[] | null);
  if (invs === null) return <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><div className="err">Fees are not set up yet — run prisma/migration_erp.sql.</div></Shell>;
  const students = await prisma.student.findMany({ where: { id: { in: invs.map((i) => i.studentId) } }, select: { id: true, name: true, rollNumber: true } });
  const sOf = new Map(students.map((s) => [s.id, s]));
  const q = (searchParams.q || "").toLowerCase();
  const shown = invs.filter((i) => !q || `${sOf.get(i.studentId)?.name} ${sOf.get(i.studentId)?.rollNumber}`.toLowerCase().includes(q));
  const billed = invs.reduce((t, i) => t + i.amount - i.discount + i.fine, 0), got = invs.reduce((t, i) => t + i.paid, 0);
  const overdue = invs.filter((i) => i.status !== "PAID" && i.dueDate < new Date());
  const y = new Date().getFullYear();
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Student Fees</h1>
      <p className="small-note">Fee amounts come from <Link href="/chairman/finance">Finance → Fees &amp; scholarships</Link> (per program and intake). Every invoice, concession, fine and payment is posted to the accounts automatically.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        {[["Billed", money(billed)], ["Collected", money(got)], ["Outstanding", money(billed - got)], ["Overdue invoices", String(overdue.length)]].map(([l, v]) => <div key={l} className="card" style={{ margin: 0 }}><div className="small-note">{l}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div></div>)}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Issue invoices</h3>
        <ActionForm url="/api/fees" fixed={{ action: "issue" }} submit="Issue for the batch" initial={{ termName: "Fall", termYear: y, dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), batchId: batches[0]?.id || "" }}
          fields={[{ name: "batchId", label: "Batch", type: "select", options: batches.map((b) => [b.id, `${b.degreeProgram} — ${b.batchName}`] as [string, string]) }, { name: "termName", label: "Term", type: "select", options: [["Fall", "Fall"], ["Spring", "Spring"], ["Summer", "Summer"]] }, { name: "termYear", label: "Year", type: "number", width: 80 }, { name: "dueDate", label: "Due date", type: "date" }]} />
        <div style={{ marginTop: 8 }}><ActionForm url="/api/fees" fixed={{ action: "lateFines" }} submit="Add fine to overdue invoices" initial={{ fine: 1000 }} fields={[{ name: "fine", label: "Late fine (PKR)", type: "number", width: 100 }]} /></div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <select name="batch" defaultValue={searchParams.batch || ""}><option value="">All batches</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select>
          <select name="status" defaultValue={searchParams.status || ""}><option value="">Any status</option>{["UNPAID", "PARTIAL", "PAID"].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select>
          <input name="q" defaultValue={searchParams.q || ""} placeholder="Student name or roll no." /><button className="btn btn-secondary btn-sm">Filter</button>
        </form>
        <table><thead><tr><th>Student</th><th>Term</th><th>Amount</th><th>Concession</th><th>Fine</th><th>Paid</th><th>Balance</th><th>Due</th><th /></tr></thead>
          <tbody>{shown.slice(0, 300).map((i) => { const s = sOf.get(i.studentId); const bal = balanceOf(i); return (
            <tr key={i.id} style={{ background: bal > 0 && i.dueDate < new Date() ? "rgba(179,38,30,.06)" : undefined }}>
              <td>{s?.name}<div className="small-note">{s?.rollNumber}</div></td><td>{i.termName} {i.termYear}</td><td>{money(i.amount)}</td><td>{i.discount ? money(i.discount) : "—"}</td><td>{i.fine ? money(i.fine) : "—"}</td><td>{money(i.paid)}</td>
              <td><b style={{ color: bal > 0 ? "#B3261E" : "#1F5E36" }}>{money(bal)}</b></td><td className="small-note">{i.dueDate.toISOString().slice(0, 10)}</td>
              <td style={{ whiteSpace: "nowrap" }}><a href={`/fees/challan/${i.id}`} target="_blank" rel="noopener noreferrer" className="act">Challan</a>
                {bal > 0 && <ActionForm url="/api/fees" fixed={{ action: "pay", invoiceId: i.id }} submit="Record" collapsed openLabel="Payment" initial={{ amount: bal, method: "BANK" }} fields={[{ name: "amount", label: "Amount", type: "number", width: 100 }, { name: "method", label: "Method", type: "select", options: [["BANK", "Bank"], ["CASH", "Cash"], ["ONLINE", "Online"]] }, { name: "reference", label: "Ref / challan no.", width: 120 }]} />}
                {i.paid === 0 && <ActionForm url="/api/fees" fixed={{ action: "discount", invoiceId: i.id }} submit="Apply" collapsed openLabel="Concession" initial={{ pct: i.amount ? Math.round((100 * i.discount) / i.amount) : 0 }} fields={[{ name: "pct", label: "Concession %", type: "number", width: 70 }, { name: "reason", label: "Scholarship / reason", width: 160 }]} />}</td>
            </tr>); })}</tbody></table>
        {shown.length === 0 && <p className="small-note">No invoices.</p>}
      </div>
    </Shell>
  );
}
