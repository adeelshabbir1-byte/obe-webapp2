import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import HowCalculated from "../../../components/HowCalculated";
import { navForRole } from "../../../components/reportNav";
import { MODULES } from "../../../lib/modules";
import { bdb, BILL_HINT, PERIODS, usageOf, revenue, type Plan, type Sub, type Invoice } from "../../../lib/billing";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const TABS: [string, string][] = [["institutes", "Institutes"], ["invoices", "Invoices"], ["plans", "Plans"], ["revenue", "Revenue"]];
const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const LOCK: Record<string, [string, string]> = { NONE: ["open", "#1E6B3A"], READ_ONLY: ["read-only", "#B45309"], LOCKED: ["locked", "#B3261E"] };

// Super User: plans, each institute's subscription and usage, invoices and payments, revenue.
export default async function AdminBilling({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "SUPER_USER") redirect("/dashboard");
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "institutes";
  let missing = false, plans: Plan[] = [], subs: Sub[] = [], invoices: Invoice[] = [];
  try {
    plans = await bdb.billingPlan.findMany({ orderBy: { createdAt: "asc" } });
    subs = await bdb.subscription.findMany({});
    invoices = await bdb.billingInvoice.findMany({ orderBy: { issuedAt: "desc" }, take: 300 });
  } catch { missing = true; }
  const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN", isActive: true }, select: { id: true, name: true, instituteName: true }, orderBy: { name: "asc" } });
  const inst = (id: string) => { const h = heads.find((x) => x.id === id); return h ? h.instituteName || h.name : "—"; };
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const usage = tab === "institutes" && !missing ? new Map(await Promise.all(heads.map(async (h) => [h.id, await usageOf(h.id)] as const))) : new Map();
  const rev = tab === "revenue" && !missing ? await revenue() : null;
  const planOpts = plans.filter((p) => p.active).map((p) => [p.id, p.name] as [string, string]);
  const payments = tab === "invoices" && !missing ? ((await bdb.billingPayment.findMany({ where: { invoiceId: { in: invoices.map((i) => i.id).concat(["none"]) } } })) as { invoiceId: string; amount: number }[]) : [];

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Billing</h1>
      <p className="small-note" style={{ marginBottom: 8 }}>Plans, each institute&apos;s subscription, invoices made each period, payments, and the automatic locks: unpaid past the grace period → the plan&apos;s modules turn read-only; after the read-only days → locked (using the module locks); paying opens them again at once.</p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{BILL_HINT}</p></div>}
      <div className="no-print" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>{TABS.map(([k, l]) => <Link key={k} href={`/admin/billing?tab=${k}`} className={`btn btn-sm ${tab === k ? "btn-brass" : "btn-secondary"}`}>{l}</Link>)}</div>

      {tab === "institutes" && !missing && (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>Institute</th><th>Plan</th><th>Status</th><th>Usage</th><th>Unpaid</th><th></th></tr></thead>
            <tbody>{heads.map((h) => { const s = subs.find((x) => x.chairmanId === h.id); const u = usage.get(h.id); const unpaid = invoices.filter((i) => i.chairmanId === h.id && ["DUE", "OVERDUE"].includes(i.status)); return (
              <tr key={h.id}>
                <td><b>{h.instituteName || h.name}</b><div className="small-note" style={{ margin: 0 }}>{h.name}</div></td>
                <td>{s ? planName.get(s.planId) : <span className="small-note">no subscription</span>}{s?.discountPct ? <div className="small-note" style={{ margin: 0 }}>{s.discountPct}% discount{s.discountNote ? ` (${s.discountNote})` : ""}</div> : null}</td>
                <td>{s ? <><b>{s.status.toLowerCase()}</b>{s.status === "TRIAL" ? ` until ${day(s.trialEndsAt)}` : ""}<div style={{ fontSize: 12, fontWeight: 700, color: LOCK[s.lockState][1] }}>modules {LOCK[s.lockState][0]}</div></> : "—"}</td>
                <td style={{ fontSize: 12 }}>{u ? `${u.students} students · ${u.staff} staff · ${u.storageMb} MB files` : "—"}</td>
                <td style={{ color: unpaid.some((i) => i.status === "OVERDUE") ? "#B3261E" : undefined, fontWeight: unpaid.length ? 700 : 400 }}>{unpaid.length ? rs(unpaid.reduce((t, i) => t + i.total, 0)) : "—"}</td>
                <td style={{ display: "grid", gap: 4 }}>
                  <ActionForm url="/api/billing" fixed={{ action: "subscribe", chairmanId: h.id }} collapsed openLabel={s ? "Change…" : "Subscribe…"} submit="Save" initial={s ? { ...s, trialEndsAt: s.trialEndsAt ? new Date(s.trialEndsAt).toISOString().slice(0, 10) : "" } as never : { planId: planOpts[0]?.[0] || "", status: "TRIAL", graceDays: 15, readOnlyDays: 15, discountPct: 0 }}
                    fields={[{ name: "planId", label: "Plan", type: "select", options: planOpts }, { name: "status", label: "Status", type: "select", options: [["TRIAL", "Trial"], ["ACTIVE", "Active"], ["SUSPENDED", "Suspended"], ["CANCELLED", "Cancelled"]] }, { name: "trialEndsAt", label: "Trial ends", type: "date" }, { name: "discountPct", label: "Discount (%)", type: "number" }, { name: "discountNote", label: "Why the discount", type: "text" }, { name: "graceDays", label: "Grace days after the due date", type: "number" }, { name: "readOnlyDays", label: "Read-only days before locking", type: "number" }, { name: "billingEmail", label: "Billing email", type: "text" }]} />
                  {s && s.status !== "TRIAL" && <ActionButton url="/api/billing" body={{ action: "invoiceNow", chairmanId: h.id }} label="Invoice this period" className="btn btn-secondary btn-sm" />}
                </td>
              </tr>
            ); })}</tbody>
          </table>
        </div>
      )}

      {tab === "invoices" && !missing && (
        <div className="card" style={{ overflowX: "auto" }}>
          {invoices.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No invoices yet — they are made each period for subscribed institutes (not during a trial).</p> : (
            <table className="table" style={{ fontSize: 13 }}>
              <thead><tr><th>Invoice</th><th>Institute</th><th>Period</th><th>Total</th><th>Paid</th><th>Status</th><th></th></tr></thead>
              <tbody>{invoices.map((i) => { const paid = payments.filter((p) => p.invoiceId === i.id).reduce((t, p) => t + p.amount, 0); return (
                <tr key={i.id}>
                  <td><a href={`/api/billing?invoice=${i.id}`}><b>{i.number}</b></a><div className="small-note" style={{ margin: 0 }}>issued {day(i.issuedAt)} · due {day(i.dueAt)}</div></td>
                  <td>{inst(i.chairmanId)}</td><td>{day(i.periodStart)} – {day(i.periodEnd)}<div className="small-note" style={{ margin: 0 }}>{i.students} students</div></td>
                  <td>{rs(i.total)}</td><td>{paid ? rs(paid) : "—"}</td>
                  <td style={{ fontWeight: 700, color: i.status === "PAID" ? "#1E6B3A" : i.status === "OVERDUE" ? "#B3261E" : i.status === "VOID" ? "#777" : "#B45309" }}>{i.status.toLowerCase()}{i.paidAt ? <div className="small-note" style={{ margin: 0 }}>{day(i.paidAt)}</div> : null}</td>
                  <td style={{ display: "grid", gap: 4 }}>
                    {["DUE", "OVERDUE"].includes(i.status) && <ActionForm url="/api/billing" fixed={{ action: "pay", invoiceId: i.id }} collapsed openLabel="Record payment…" submit="Record" initial={{ amount: Math.max(0, i.total - paid), method: "BANK_TRANSFER", paidOn: new Date().toISOString().slice(0, 10) }} fields={[{ name: "amount", label: "Amount (Rs)", type: "number" }, { name: "method", label: "Method", type: "select", options: [["BANK_TRANSFER", "Bank transfer"], ["CHEQUE", "Cheque"], ["CASH", "Cash"], ["GATEWAY", "Online gateway"]] }, { name: "reference", label: "Bank reference", type: "text" }, { name: "paidOn", label: "Received on", type: "date" }]} />}
                    {["DUE", "OVERDUE"].includes(i.status) && !paid && <ActionButton url="/api/billing" body={{ action: "void", invoiceId: i.id }} label="Cancel invoice" className="btn btn-secondary btn-sm" askNote="Why is it cancelled?" noteRequired />}
                  </td>
                </tr>
              ); })}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === "plans" && !missing && (
        <>
          <div className="card"><ActionForm url="/api/billing" fixed={{ action: "plan" }} collapsed openLabel="New plan…" submit="Save plan" initial={{ pricing: "PER_STUDENT", period: "TERM" }} fields={[{ name: "name", label: "Name", type: "text" }, { name: "modules", label: `Modules (comma separated keys: ${MODULES.map((m) => m.key).join(", ")})`, type: "textarea" }, { name: "pricing", label: "Pricing", type: "select", options: [["PER_STUDENT", "Per active student"], ["FLAT", "Flat fee"]] }, { name: "price", label: "Price (Rs)", type: "number" }, { name: "period", label: "Billing period", type: "select", options: Object.entries(PERIODS) as [string, string][] }, { name: "note", label: "Note", type: "text" }]} /></div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Plan</th><th>Modules (core OBE always included)</th><th>Price</th><th>Institutes</th><th></th></tr></thead>
              <tbody>{plans.map((p) => { const mods = JSON.parse(p.modulesJson) as string[]; return <tr key={p.id}><td><b>{p.name}</b>{!p.active && <span className="small-note"> (not offered)</span>}</td><td style={{ fontSize: 12 }}>{mods.map((k) => MODULES.find((m) => m.key === k)?.label || k).join(", ") || "core only"}</td><td>{rs(p.price)} {p.pricing === "FLAT" ? "flat" : "per student"} · {PERIODS[p.period].toLowerCase()}</td><td>{subs.filter((s) => s.planId === p.id).length}</td>
                <td><ActionForm url="/api/billing" fixed={{ action: "plan", id: p.id }} collapsed openLabel="Edit" submit="Save" initial={{ ...p, modules: mods.join(", ") } as never} fields={[{ name: "name", label: "Name", type: "text" }, { name: "modules", label: "Modules (comma separated keys)", type: "textarea" }, { name: "pricing", label: "Pricing", type: "select", options: [["PER_STUDENT", "Per active student"], ["FLAT", "Flat fee"]] }, { name: "price", label: "Price (Rs)", type: "number" }, { name: "period", label: "Period", type: "select", options: Object.entries(PERIODS) as [string, string][] }, { name: "active", label: "Offered", type: "checkbox" }]} /></td></tr>; })}</tbody></table>
          </div>
        </>
      )}

      {rev && (
        <div className="card" style={{ overflowX: "auto" }}>
          <p style={{ fontSize: 14, margin: "0 0 8px" }}>Outstanding <b>{rs(rev.outstanding)}</b>, of which overdue <b style={{ color: "#B3261E" }}>{rs(rev.overdue)}</b>. {rev.byPlan.map((p) => `${p.name}: ${rs(p.invoiced)}`).join(" · ")}</p>
          <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Month</th><th>Invoiced</th><th>Received</th></tr></thead><tbody>{rev.months.map((m) => <tr key={m.label}><td>{m.label}</td><td>{m.invoiced ? rs(m.invoiced) : "—"}</td><td>{m.received ? rs(m.received) : "—"}</td></tr>)}</tbody></table>
          <HowCalculated shows="How revenue is counted."><p style={{ margin: 0 }}>Invoiced is the total of invoices issued in the month (cancelled ones left out); received is the payments recorded with that date.</p></HowCalculated>
        </div>
      )}
    </Shell>
  );
}
