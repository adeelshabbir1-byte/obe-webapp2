import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { adminCan, adminNavFor } from "../../../lib/platformTeam";
import { usageOverview } from "../../../lib/aiChecks";
import { ActionForm } from "../../../components/fyp/FypClient";

export const dynamic = "force-dynamic";

// Platform → AI usage: each institute's AI checks this month (runs, tokens, cost against its budget), and its settings —
// the monthly cap, the model for paper checks (cheaper) and for plan reviews (stronger).
export default async function AiUsagePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!(await adminCan(user, "BILLING"))) redirect("/dashboard");
  const { perInst, rows } = await usageOverview();
  const name = new Map(perInst.map((p) => [p.id, p.name]));
  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={await adminNavFor(user)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>AI usage</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Paper checks and plan reviews run on the university&apos;s own key (ANTHROPIC_API_KEY in Vercel, or the institute&apos;s AI Configuration). No personal data is sent. A run of the same version comes from the cache at no cost.</p>
      <div className="card" style={{ overflowX: "auto" }}>
        <table><thead><tr><th>Institute</th><th>This month</th><th>Budget</th><th>Runs</th><th>Paper model</th><th>Plan model</th><th>Settings</th></tr></thead>
          <tbody>{perInst.map((p) => (
            <tr key={p.id}><td>{p.name}</td><td style={{ color: p.spent >= p.settings.monthlyBudgetUsd ? "#B3261E" : undefined }}>US$ {p.spent.toFixed(4)}</td><td>US$ {p.settings.monthlyBudgetUsd}</td><td>{p.runs}</td><td>{p.settings.paperModel}</td><td>{p.settings.planModel}</td>
              <td><ActionForm url="/api/admin/ai-usage" fixed={{ chairmanId: p.id }} collapsed openLabel="Change" submit="Save" initial={{ monthlyBudgetUsd: p.settings.monthlyBudgetUsd, paperModel: p.settings.paperModel, planModel: p.settings.planModel }} fields={[{ name: "monthlyBudgetUsd", label: "Monthly budget (US$)", type: "number", width: 110 }, { name: "paperModel", label: "Model for paper checks", width: 170 }, { name: "planModel", label: "Model for plan reviews", width: 170 }]} /></td></tr>))}</tbody></table>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Runs this month</h3>
        {rows.length === 0 ? <p className="small-note">None yet.</p> : (
          <table data-ai-usage><thead><tr><th>When</th><th>Institute</th><th>Kind</th><th>Model</th><th>Tokens in / out</th><th>Cost</th><th /></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td style={{ fontSize: 12 }}>{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td><td>{name.get(r.chairmanId) || "—"}</td><td>{r.kind === "PAPER" ? "Paper check" : "Plan review"}</td><td>{r.model}</td><td>{r.inputTokens} / {r.outputTokens}</td><td>US$ {r.costUsd.toFixed(4)}</td><td className="small-note">{r.cached ? "cache" : r.error ? `failed: ${r.error}` : ""}</td></tr>)}</tbody></table>
        )}
      </div>
    </Shell>
  );
}
