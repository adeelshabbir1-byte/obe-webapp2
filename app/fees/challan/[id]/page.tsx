import { financeSetting } from "../../../../lib/feeClearance";
import { notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { prisma } from "../../../../lib/db";
import { erpAccess, edb, money } from "../../../../lib/erp";
import { balanceOf, type FeeLine } from "../../../../lib/fees";
import PrintButton from "../../../../components/PrintButton";

export const dynamic = "force-dynamic";

// Printable fee challan / receipt — for the student and for Finance.
export default async function ChallanPage({ params }: { params: { id: string } }) {
  const inv = (await edb.feeInvoice.findUnique({ where: { id: params.id } }).catch(() => null)) as { id: string; chairmanId: string; studentId: string; termName: string; termYear: number; linesJson: string; amount: number; discount: number; fine: number; paid: number; dueDate: Date; status: string } | null;
  if (!inv) notFound();
  const student = await getAuthenticatedStudent().catch(() => null);
  let ok = student?.id === inv.studentId;
  if (!ok) { const u = await getAuthenticatedUser().catch(() => null); if (u) { const a = await erpAccess(u); ok = a.finance && a.chairmanId === inv.chairmanId; } }
  if (!ok) notFound();
  const [st, head, pays] = await Promise.all([
    prisma.student.findUnique({ where: { id: inv.studentId }, select: { name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true } } } }),
    prisma.user.findUnique({ where: { id: inv.chairmanId }, select: { instituteName: true } }),
    edb.feePayment.findMany({ where: { invoiceId: inv.id }, orderBy: { paidAt: "asc" } }) as Promise<{ amount: number; method: string; reference: string | null; paidAt: Date }[]>,
  ]);
  const lines = JSON.parse(inv.linesJson) as FeeLine[];
  const fs = await financeSetting(inv.chairmanId);
  return (
    <main style={{ background: "#EEE", minHeight: "100vh", padding: 10 }}>
      <div className="no-print" style={{ textAlign: "center" }}><PrintButton /></div>
      <div style={{ background: "#fff", maxWidth: 640, margin: "10px auto", padding: 28, fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><b style={{ fontSize: 16 }}>{head?.instituteName || "Institute"}</b><span>Fee {inv.status === "PAID" ? "receipt" : "challan"} · {inv.termName} {inv.termYear}</span></div>
        <p>{st?.name} · {st?.rollNumber}<br /><span className="small-note">{st?.batch.degreeProgram} — {st?.batch.batchName} · Invoice {inv.id.slice(-8).toUpperCase()} · Due {inv.dueDate.toISOString().slice(0, 10)}</span></p>
        <table style={{ width: "100%" }}><tbody>
          {lines.map((l) => <tr key={l.name}><td>{l.name}</td><td style={{ textAlign: "right" }}>{money(l.amount)}</td></tr>)}
          {inv.discount > 0 && <tr><td>Concession / scholarship</td><td style={{ textAlign: "right" }}>− {money(inv.discount)}</td></tr>}
          {inv.fine > 0 && <tr><td>Late fine</td><td style={{ textAlign: "right" }}>{money(inv.fine)}</td></tr>}
          {pays.map((p, i) => <tr key={i}><td className="small-note">Paid {p.paidAt.toISOString().slice(0, 10)} ({p.method.toLowerCase()}{p.reference ? `, ${p.reference}` : ""})</td><td style={{ textAlign: "right" }}>− {money(p.amount)}</td></tr>)}
          <tr><td><b>Balance</b></td><td style={{ textAlign: "right" }}><b>{money(balanceOf(inv))}</b></td></tr>
        </tbody></table>
        {balanceOf(inv) > 0 && (fs.bank.bank || fs.bank.jazzcash || fs.bank.easypaisa || fs.bank.onebill) && <div style={{ marginTop: 12, borderTop: "1px dashed #999", paddingTop: 8, fontSize: 12 }}>
          {fs.bank.bank && <div>Deposit at <b>{fs.bank.bank}</b>{fs.bank.branch ? `, ${fs.bank.branch}` : ""} — {fs.bank.title}, A/c <b>{fs.bank.account}</b>{fs.bank.iban ? `, IBAN ${fs.bank.iban}` : ""}</div>}
          {fs.bank.jazzcash && <div>JazzCash: {fs.bank.jazzcash}</div>}{fs.bank.easypaisa && <div>Easypaisa: {fs.bank.easypaisa}</div>}{fs.bank.onebill && <div>1Bill: {fs.bank.onebill} — reference {inv.id.slice(-8).toUpperCase()}</div>}
          <div className="small-note">After paying online, enter the transaction number in the student portal (My Fees).</div></div>}
      </div>
    </main>
  );
}
