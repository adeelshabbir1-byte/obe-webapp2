import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { edb, money } from "../../../lib/erp";
import { balanceOf } from "../../../lib/fees";
import { financeSetting, METHODS } from "../../../lib/feeClearance";
import { ActionForm } from "../../../components/fyp/FypClient";
import { prisma } from "../../../lib/db";

export const dynamic = "force-dynamic";

export default async function StudentFeesPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  const invs = ((await edb.feeInvoice.findMany({ where: { studentId: student.id }, orderBy: { createdAt: "desc" } }).catch(() => [])) as { id: string; termName: string; termYear: number; amount: number; discount: number; fine: number; paid: number; dueDate: Date; status: string }[]);
  const sb = await prisma.student.findUnique({ where: { id: student.id }, select: { batch: { select: { coordinator: { select: { managedById: true } } } } } });
  const fs = await financeSetting(sb?.batch.coordinator.managedById);
  const claims = ((await edb.paymentClaim.findMany({ where: { studentId: student.id }, orderBy: { createdAt: "desc" }, take: 20 }).catch(() => [])) as { id: string; amount: number; method: string; reference: string; status: string; note: string | null; createdAt: Date }[]);
  const open = invs.filter((i) => balanceOf(i) > 0);
  return (
    <StudentShell studentName={student.name}>
      <h1 style={{ fontSize: 22 }}>My Fees</h1>
      <div className="card">
        {invs.length === 0 ? <p style={{ margin: 0 }}>No fee invoices yet.</p> : (
          <table><thead><tr><th>Term</th><th>Amount</th><th>Balance</th><th>Due</th><th /></tr></thead>
            <tbody>{invs.map((i) => <tr key={i.id}><td>{i.termName} {i.termYear}</td><td>{money(i.amount - i.discount + i.fine)}</td><td style={{ color: balanceOf(i) > 0 ? "#B3261E" : "#1F5E36", fontWeight: 700 }}>{money(balanceOf(i))}</td><td>{i.dueDate.toISOString().slice(0, 10)}</td><td><a href={`/fees/challan/${i.id}`} target="_blank" rel="noopener noreferrer">{i.status === "PAID" ? "Receipt" : "Challan"}</a></td></tr>)}</tbody></table>
        )}
      </div>
      {open.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pay</h3>
          <div style={{ fontSize: 13 }}>
            {fs.bank.bank && <div><b>Bank:</b> {fs.bank.bank}{fs.bank.branch ? `, ${fs.bank.branch}` : ""} — {fs.bank.title} — A/c {fs.bank.account}{fs.bank.iban ? ` (IBAN ${fs.bank.iban})` : ""}</div>}
            {fs.bank.jazzcash && <div><b>JazzCash:</b> {fs.bank.jazzcash}</div>}
            {fs.bank.easypaisa && <div><b>Easypaisa:</b> {fs.bank.easypaisa}</div>}
            {fs.bank.onebill && <div><b>1Bill:</b> {fs.bank.onebill} (pay from any bank app with your invoice number)</div>}
            {!fs.bank.bank && !fs.bank.jazzcash && !fs.bank.easypaisa && <div className="small-note">Pay at the bank with the challan; payment details will appear here when Finance adds them.</div>}
          </div>
          <p className="small-note">Paid already? Enter the transaction / deposit slip number — Finance checks it and your balance is updated.</p>
          <ActionForm url="/api/student/fee-claim" fixed={{}} submit="I have paid" initial={{ invoiceId: open[0].id, method: "BANK", amount: balanceOf(open[0]), paidOn: new Date().toISOString().slice(0, 10) }}
            fields={[{ name: "invoiceId", label: "Invoice", type: "select", options: open.map((i) => [i.id, `${i.termName} ${i.termYear} — balance ${money(balanceOf(i))}`] as [string, string]) }, { name: "method", label: "Paid by", type: "select", options: METHODS }, { name: "reference", label: "Transaction / slip no." }, { name: "amount", label: "Amount", type: "number" }, { name: "paidOn", label: "Paid on", type: "date" }]} />
        </div>
      )}
      {claims.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>Payments I reported</h3><table style={{ fontSize: 12.5 }}><tbody>{claims.map((c) => <tr key={c.id}><td>{c.createdAt.toISOString().slice(0, 10)}</td><td>{c.method} {c.reference}</td><td>{money(c.amount)}</td><td><b style={{ color: c.status === "VERIFIED" ? "#1F5E36" : c.status === "REJECTED" ? "#B3261E" : "#B26A00" }}>{c.status === "PENDING" ? "Being checked" : c.status.toLowerCase()}</b>{c.note ? ` — ${c.note}` : ""}</td></tr>)}</tbody></table></div>}
    </StudentShell>
  );
}
