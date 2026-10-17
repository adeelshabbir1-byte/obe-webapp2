import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { erpAccess, edb, money } from "../../../../lib/erp";
import PrintButton from "../../../../components/PrintButton";

export const dynamic = "force-dynamic";
type Slip = { id: string; runId: string; userId: string; gross: number; deductions: number; tax: number; net: number; linesJson: string };

// A printable payslip (?run=1 with a payroll id: every payslip of that month, for HR).
export default async function PayslipPage({ params, searchParams }: { params: { id: string }; searchParams: { run?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const acc = await erpAccess(user);
  let slips: Slip[] = [];
  if (searchParams.run) { if (!acc.hr) notFound(); slips = (await edb.payslip.findMany({ where: { runId: params.id } })) as Slip[]; }
  else { const s = (await edb.payslip.findUnique({ where: { id: params.id } })) as Slip | null; if (!s || (s.userId !== user.id && !acc.hr)) notFound(); slips = [s]; }
  const run = slips[0] ? ((await edb.payrollRun.findUnique({ where: { id: slips[0].runId } })) as { month: string; chairmanId: string; status: string }) : null;
  if (!run || run.chairmanId !== acc.chairmanId) notFound();
  const [people, head] = await Promise.all([prisma.user.findMany({ where: { id: { in: slips.map((s) => s.userId) } }, select: { id: true, name: true, email: true } }), prisma.user.findUnique({ where: { id: run.chairmanId }, select: { instituteName: true } })]);
  return (
    <main style={{ background: "#EEE", minHeight: "100vh", padding: 10 }}>
      <style>{"@media print { main { background: #fff !important } .slip { break-after: page } }"}</style>
      <div className="no-print" style={{ textAlign: "center" }}><PrintButton /></div>
      {slips.map((s) => { const l = JSON.parse(s.linesJson) as { basic: number; allowances: { name: string; amount: number }[]; deductions: { name: string; amount: number }[]; taxPct: number }; const p = people.find((x) => x.id === s.userId);
        return (
          <div key={s.id} className="slip" style={{ background: "#fff", maxWidth: 640, margin: "10px auto", padding: 28, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><b>{head?.instituteName || "Institute"}</b><span>Payslip — {run.month}{run.status === "DRAFT" ? " (draft)" : ""}</span></div>
            <h2 style={{ fontSize: 18, margin: "10px 0 2px" }}>{p?.name}</h2><div className="small-note">{p?.email}</div>
            <table style={{ width: "100%", marginTop: 12 }}><tbody>
              <tr><td>Basic pay</td><td style={{ textAlign: "right" }}>{money(l.basic)}</td></tr>
              {l.allowances.map((a) => <tr key={a.name}><td>{a.name}</td><td style={{ textAlign: "right" }}>{money(a.amount)}</td></tr>)}
              <tr><td><b>Gross</b></td><td style={{ textAlign: "right" }}><b>{money(s.gross)}</b></td></tr>
              <tr><td>Income tax ({l.taxPct}%)</td><td style={{ textAlign: "right" }}>− {money(s.tax)}</td></tr>
              {l.deductions.map((a) => <tr key={a.name}><td>{a.name}</td><td style={{ textAlign: "right" }}>− {money(a.amount)}</td></tr>)}
              <tr><td><b>Net pay</b></td><td style={{ textAlign: "right" }}><b>{money(s.net)}</b></td></tr>
            </tbody></table>
          </div>); })}
    </main>
  );
}
