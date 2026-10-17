import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import QualityShell from "../../components/QualityShell";
import { ActionForm } from "../../components/fyp/FypClient";
import { programsFor, canEditProgram, peoAttainment, QUALITY_HINT } from "../../lib/quality";

export const dynamic = "force-dynamic";

// PEO attainment: alumni and employer survey answers mapped to each PEO, against a target, with the action taken when missed.
export default async function PeoAttainmentPage({ searchParams }: { searchParams: { p?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const programs = await programsFor(user);
  if (!programs.length) redirect("/dashboard");
  const sel = programs.find((p) => p.key === searchParams.p) || programs[0];
  const d = await peoAttainment(sel.coordinatorId, sel.degreeProgram);
  const edit = canEditProgram(user, sel.coordinatorId);
  const cell = (s: { n: number; pct: number; avg: number } | null) => (s ? <>{s.pct}% <span className="small-note">avg {s.avg}/5 · {s.n}</span></> : <span className="small-note">no answers</span>);
  return (
    <QualityShell user={user} title="PEO Attainment" intro="How far graduates reach each Program Educational Objective a few years after graduating, measured from the Alumni and Employer surveys (questions mapped to PEOs). Attainment is the share of answers rated 3 or more out of 5. Every council asks for this; set a target per PEO and record what was done when one is missed.">
      <form className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select name="p" defaultValue={sel.key}>{programs.map((p) => <option key={p.key} value={p.key}>{p.degreeProgram} — {p.lead}</option>)}</select>
        <button className="btn btn-secondary btn-sm">Show</button>
        <Link href="/coordinator/surveys" className="act">Alumni &amp; employer surveys</Link>
      </form>
      {!d.ready && <div className="err">{QUALITY_HINT}</div>}
      {d.peos.length === 0 ? <div className="card">No PEOs are entered for this program yet. Add them in the Program Profile, then create the standard Alumni and Employer surveys — they ask one question per PEO.</div> : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>PEO</th><th>Alumni</th><th>Employers</th><th>Overall</th><th>Target</th><th>Status</th><th>Action when missed</th></tr></thead>
            <tbody>{d.rows.map((r) => (
              <tr key={r.label}>
                <td style={{ maxWidth: 320 }}><b>{r.label}</b> <span className="small-note">{r.text}</span></td>
                <td>{cell(r.alumni)}</td><td>{cell(r.employer)}</td><td style={{ fontWeight: 700 }}>{cell(r.all)}</td>
                <td>{r.target}%</td>
                <td style={{ color: r.met === null ? "var(--slate)" : r.met ? "#2E7D4F" : "#B3261E", fontWeight: 700 }}>{r.met === null ? "Not measured" : r.met ? "Attained" : "Not attained"}</td>
                <td style={{ fontSize: 12, maxWidth: 260 }}>{r.actionTaken || (r.met === false ? <span style={{ color: "#B3261E" }}>Record an action</span> : "—")}
                  {edit && d.ready && <ActionForm url="/api/quality" fixed={{ action: "peoTarget", program: sel.key, peoLabel: r.label }} submit="Save" collapsed openLabel="Edit" initial={{ target: r.target, actionTaken: r.actionTaken || "" }} fields={[{ name: "target", label: "Target %", type: "number", width: 80 }, { name: "actionTaken", label: "Action taken / planned", type: "textarea", full: true }]} />}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="small-note">Alumni surveys are usually run 3–5 years after graduation and employer surveys every one to two years. Results include every submitted answer for this program so far.</p>
        </div>
      )}
    </QualityShell>
  );
}
