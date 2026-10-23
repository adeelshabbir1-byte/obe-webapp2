import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs, rdb, staffOf, day } from "../../lib/registers";
import { BEN_HINT, KINDS, CLAIM, canManageBenefits, type Plan } from "../../lib/benefits";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const rs = (n: number | null | undefined) => (n || n === 0 ? `Rs ${Math.round(n).toLocaleString("en-PK")}` : "—");

// Employee benefits: plans, enrolment and claims (HR / Finance), and each member of staff's own benefits.
export default async function BenefitsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w || user.role === "SUPER_USER") redirect("/dashboard");
  const manage = canManageBenefits(w);
  let plans: Plan[] | null = null;
  try { plans = (await rdb.benefitPlan.findMany({ where: { chairmanId: w.chairmanId }, orderBy: [{ active: "desc" }, { kind: "asc" }] })) as Plan[]; } catch { plans = null; }
  const enr = (await rdb.benefitEnrolment.findMany({ where: { planId: { in: (plans || []).map((p) => p.id).concat(["none"]) }, ...(manage ? {} : { userId: w.id }) } }).catch(() => [])) as { id: string; planId: string; userId: string; dependantsCount: number | null; amount: number | null; startDate: Date | null; endDate: Date | null }[];
  const claims = (await rdb.benefitClaim.findMany({ where: { planId: { in: (plans || []).map((p) => p.id).concat(["none"]) }, ...(manage ? {} : { userId: w.id }) }, orderBy: { createdAt: "desc" }, take: 200 }).catch(() => [])) as { id: string; planId: string; userId: string; date: Date; amount: number; description: string; status: string; note: string | null }[];
  const staff = await staffOf(w.chairmanId);
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name || "—";
  const mine = enr.filter((e) => e.userId === w.id && !e.endDate);
  const planFields = [{ name: "kind", label: "Benefit", type: "select" as const, options: Object.entries(KINDS) }, { name: "name", label: "Plan name", width: 200 }, { name: "provider", label: "Insurer / provider", width: 170 }, { name: "policyNo", label: "Policy no.", width: 120 }, { name: "coverage", label: "Coverage", width: 220 }, { name: "limitAmount", label: "Limit (Rs)", type: "number" as const, width: 110 }, { name: "dependants", label: "Dependants covered", placeholder: "spouse + 3 children", width: 160 }, { name: "premium", label: "Annual premium (Rs)", type: "number" as const, width: 110 }, { name: "employerSharePct", label: "Employer share %", type: "number" as const, width: 80 }, { name: "employeeSharePct", label: "Employee share %", type: "number" as const, width: 80 }, { name: "eligibility", label: "Who is eligible", width: 200 }, { name: "renewalDate", label: "Renews on", type: "date" as const }];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{manage ? "Employee Benefits" : "My Benefits"}</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>{manage ? "The institute's benefit plans, who is enrolled and the claims. The summary is what NBEAC's Form 7 asks for." : "The benefits you are enrolled in, and your claims."}</p>
      <HowCalculated shows="Enrolled share = staff currently enrolled in a plan ÷ all members of staff. Plans renewing within 30 days are flagged and the Finance Officer is reminded.">{null}</HowCalculated>
      {plans === null && <div className="err">{BEN_HINT}</div>}
      {!manage && <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Your benefits</h3>
        <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Benefit</th><th>Coverage</th><th>Your details</th><th /></tr></thead>
          <tbody>{mine.map((e) => { const p = (plans || []).find((x) => x.id === e.planId)!; return <tr key={e.id}><td><b>{KINDS[p.kind]}</b><div className="small-note" style={{ margin: 0 }}>{[p.name, p.provider, p.policyNo ? `policy ${p.policyNo}` : ""].filter(Boolean).join(" · ")}</div></td><td>{p.coverage || "—"}{p.limitAmount ? ` · limit ${rs(p.limitAmount)}` : ""}{p.dependants ? ` · ${p.dependants}` : ""}</td><td>{[e.amount ? rs(e.amount) : "", e.dependantsCount !== null ? `${e.dependantsCount} dependant(s)` : "", `since ${day(e.startDate)}`].filter(Boolean).join(" · ")}</td>
            <td>{["HEALTH", "FEE_CONCESSION", "OTHER"].includes(p.kind) && <ActionForm url="/api/benefits" fixed={{ action: "claim", planId: p.id }} submit="Send claim" collapsed openLabel="Make a claim" fields={[{ name: "date", label: "Date", type: "date" }, { name: "amount", label: "Amount (Rs)", type: "number", width: 110 }, { name: "description", label: "What for", width: 220 }]} />}</td></tr>; })}
            {!mine.length && <tr><td colSpan={4}>You are not enrolled in any benefit yet — ask the Finance Officer.</td></tr>}</tbody></table></div>}
      {manage && <div className="card"><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><ActionForm url="/api/benefits" fixed={{ action: "plan" }} submit="Save plan" collapsed openLabel="Add a benefit plan" fields={planFields} /><a className="btn btn-brass btn-sm" style={{ marginLeft: "auto" }} href="/api/benefits">⬇ Benefits summary (NBEAC Form 7, Word)</a></div></div>}
      {manage && (plans || []).map((p) => { const en = enr.filter((e) => e.planId === p.id && !e.endDate); const soon = p.renewalDate && new Date(p.renewalDate).getTime() - Date.now() < 30 * 864e5; return (
        <div key={p.id} className="card" style={{ overflowX: "auto", opacity: p.active ? 1 : 0.6 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}><h3 style={{ margin: 0 }}>{p.name}</h3><span className="small-note">{KINDS[p.kind]}{p.provider ? ` · ${p.provider}` : ""}{p.policyNo ? ` · policy ${p.policyNo}` : ""}{!p.active ? " · inactive" : ""}</span>{p.renewalDate && <span style={{ fontSize: 12.5, fontWeight: 700, color: soon ? "#B3261E" : "#5C5356" }}>renews {day(p.renewalDate)}</span>}</div>
          <p style={{ fontSize: 13, margin: "6px 0" }}>{[p.coverage, p.limitAmount ? `limit ${rs(p.limitAmount)}` : "", p.dependants ? `dependants: ${p.dependants}` : "", p.premium ? `premium ${rs(p.premium)} a year` : "", p.employerSharePct !== null ? `employer ${p.employerSharePct}% / employee ${p.employeeSharePct ?? 0}%` : "", p.eligibility ? `eligible: ${p.eligibility}` : ""].filter(Boolean).join(" · ") || "—"}</p>
          <p style={{ fontSize: 13, margin: "4px 0" }}><b>{en.length}</b> of {staff.length} staff enrolled ({staff.length ? Math.round((100 * en.length) / staff.length) : 0}%)</p>
          <details><summary style={{ cursor: "pointer", fontSize: 13 }}>Enrolled staff</summary>{en.map((e) => <div key={e.id} style={{ fontSize: 13, margin: "3px 0", display: "flex", gap: 6, alignItems: "center" }}>{nameOf(e.userId)} <span className="small-note">{e.amount ? rs(e.amount) : ""}{e.dependantsCount !== null ? ` · ${e.dependantsCount} dependant(s)` : ""}</span><ActionButton url="/api/benefits" body={{ action: "unenrol", enrolmentId: e.id }} label="End" className="act" confirmText="End this enrolment today?" /></div>)}</details>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <ActionForm url="/api/benefits" fixed={{ action: "enrol", planId: p.id }} submit="Enrol" collapsed openLabel="Enrol staff" fields={[{ name: "userId", label: "Member of staff", type: "select", options: [["ALL", "Everyone"], ...staff.map((s) => [s.id, s.name] as [string, string])] }, { name: "amount", label: "Amount / allowance (Rs)", type: "number", width: 120 }, { name: "dependantsCount", label: "Dependants", type: "number", width: 80 }, { name: "startDate", label: "From", type: "date" }]} />
            <ActionForm url="/api/benefits" fixed={{ action: "plan", id: p.id }} submit="Save" collapsed openLabel="Edit plan" initial={{ ...p, renewalDate: p.renewalDate ? new Date(p.renewalDate).toISOString().slice(0, 10) : "" } as unknown as Record<string, unknown>} fields={[...planFields, { name: "active", label: "Active", type: "checkbox" }]} />
          </div>
        </div>); })}
      {claims.length > 0 && <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Claims</h3>
        <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Date</th>{manage && <th>Member of staff</th>}<th>Benefit</th><th>For</th><th>Amount</th><th>Status</th>{manage && <th />}</tr></thead>
          <tbody>{claims.map((c) => <tr key={c.id}><td>{day(c.date)}</td>{manage && <td>{nameOf(c.userId)}</td>}<td>{(plans || []).find((p) => p.id === c.planId)?.name}</td><td>{c.description}</td><td>{rs(c.amount)}</td><td style={{ fontWeight: 700, color: c.status === "PAID" ? "#1E6B3A" : c.status === "REJECTED" ? "#6B7177" : "#9A3412" }}>{CLAIM[c.status]}{c.note && <div className="small-note" style={{ margin: 0, fontWeight: 400 }}>{c.note}</div>}</td>
            {manage && <td>{c.status !== "PAID" && c.status !== "REJECTED" && <ActionForm url="/api/benefits" fixed={{ action: "decide", claimId: c.id }} submit="Save" collapsed openLabel="Decide" initial={{ status: c.status === "SUBMITTED" ? "APPROVED" : "PAID", note: "" }} fields={[{ name: "status", label: "Status", type: "select", options: Object.entries(CLAIM) }, { name: "note", label: "Note", width: 180 }]} />}</td>}</tr>)}</tbody></table></div>}
    </Shell>
  );
}
