import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { MODULES } from "../../lib/modules";
import { bdb, BILL_HINT, PERIODS, usageOf, type Plan, type Sub, type Invoice } from "../../lib/billing";
import { itAccess } from "../../lib/itManager";

export const dynamic = "force-dynamic";
const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

// The Institute Head: our OBEHUB plan, invoices (PDF) and payment history.
export default async function BillingPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const it = await itAccess(user);
  if (!it) redirect("/home");
  const cid = it.chairmanId;
  let missing = false, sub: Sub | null = null, plan: Plan | null = null, invoices: Invoice[] = [], pays: { invoiceId: string; amount: number; method: string; reference: string | null; paidOn: Date }[] = [];
  try {
    sub = await bdb.subscription.findUnique({ where: { chairmanId: cid } });
    plan = sub ? await bdb.billingPlan.findUnique({ where: { id: sub.planId } }) : null;
    invoices = await bdb.billingInvoice.findMany({ where: { chairmanId: cid, status: { not: "VOID" } }, orderBy: { issuedAt: "desc" } });
    pays = await bdb.billingPayment.findMany({ where: { chairmanId: cid }, orderBy: { paidOn: "desc" } });
  } catch { missing = true; }
  const usage = await usageOf(cid);
  const mods = plan ? (JSON.parse(plan.modulesJson) as string[]) : [];
  const numOf = new Map(invoices.map((i) => [i.id, i.number]));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>OBEHUB Plan &amp; Invoices</h1>{!it.canAct && <div className="card" style={{ borderLeft: "5px solid #1565C0", padding: "8px 12px", fontSize: 13 }}><b>Read-only.</b> {it.manager?.name} is the IT Manager and runs this page.</div>}
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{BILL_HINT}</p></div>}
      {!missing && !sub && <div className="card"><p style={{ margin: 0 }}>No subscription is set up for your institute yet — every module is available. Contact OBEHUB for a plan.</p></div>}
      {sub && plan && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{plan.name}</h3>
          <p style={{ margin: "0 0 6px" }}>{rs(plan.price)} {plan.pricing === "FLAT" ? "flat" : "per active student"}, billed {PERIODS[plan.period].toLowerCase()}{sub.discountPct ? ` · ${sub.discountPct}% discount${sub.discountNote ? ` (${sub.discountNote})` : ""}` : ""}.</p>
          <p style={{ margin: "0 0 6px" }}>Status: <b>{sub.status.toLowerCase()}</b>{sub.status === "TRIAL" ? ` until ${day(sub.trialEndsAt)}` : ""} · modules <b style={{ color: sub.lockState === "NONE" ? "#1E6B3A" : "#B3261E" }}>{sub.lockState === "NONE" ? "all open" : sub.lockState === "READ_ONLY" ? "read-only (nothing can be saved)" : "locked"}</b></p>
          <p className="small-note" style={{ margin: "0 0 6px" }}>Included besides core OBE: {mods.map((k) => MODULES.find((m) => m.key === k)?.label || k).join(", ") || "core OBE only"}.</p>
          <p className="small-note" style={{ margin: 0 }}>Usage now: {usage.students} active students · {usage.staff} staff · {usage.storageMb} MB of files. If an invoice is unpaid {sub.graceDays} days after its due date, the plan&apos;s modules become read-only; {sub.readOnlyDays} days later they are locked. Paying opens them again at once.</p>
        </div>
      )}
      <h2 style={{ fontSize: 17, margin: "14px 0 6px" }}>Invoices</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        {invoices.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No invoices yet.</p> : (
          <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Invoice</th><th>Period</th><th>Students</th><th>Total</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>{invoices.map((i) => <tr key={i.id}><td><a href={`/api/billing?invoice=${i.id}`}><b>{i.number}</b></a> (PDF)</td><td>{day(i.periodStart)} – {day(i.periodEnd)}</td><td>{i.students}</td><td>{rs(i.total)}</td><td>{day(i.dueAt)}</td><td style={{ fontWeight: 700, color: i.status === "PAID" ? "#1E6B3A" : i.status === "OVERDUE" ? "#B3261E" : "#B45309" }}>{i.status === "PAID" ? `paid ${day(i.paidAt)}` : i.status.toLowerCase()}</td></tr>)}</tbody></table>
        )}
      </div>
      <h2 style={{ fontSize: 17, margin: "14px 0 6px" }}>Payments</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        {pays.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No payments recorded.</p> : (
          <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Date</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead>
            <tbody>{pays.map((p, i) => <tr key={i}><td>{day(p.paidOn)}</td><td>{numOf.get(p.invoiceId) || "—"}</td><td>{p.method.replace("_", " ").toLowerCase()}</td><td>{p.reference || "—"}</td><td>{rs(p.amount)}</td></tr>)}</tbody></table>
        )}
      </div>
    </Shell>
  );
}
