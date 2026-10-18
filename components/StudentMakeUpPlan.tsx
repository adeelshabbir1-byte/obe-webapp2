import { makeUpPlan } from "../lib/studentMakeUp";

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-US")}`;

/** On the student's OBE page: what can still be made up by later courses, what needs remediation, and what blocks registration. */
export default async function StudentMakeUpPlan({ student }: { student: { id: string; batchId: string; currentSemesterNumber: number } }) {
  const p = await makeUpPlan(student).catch(() => null);
  if (!p) return null;
  const nothing = !p.plos.length && !p.clos.length && !p.blocks.length && !p.remediation.length;
  return (
    <div style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 17, marginBottom: 6 }}>Make-up plan</h2>
      {nothing && <div className="card"><p style={{ margin: 0, fontSize: 13 }}>You are on target on every outcome measured so far — nothing to make up.</p></div>}

      {p.blocks.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid var(--rust)" }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Held up by strong prerequisites</h3>
          {p.blocks.map((b) => <div key={b.code} style={{ fontSize: 13, marginBottom: 6 }}><b>{b.code} {b.title}</b><ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>{b.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></div>)}
          <p className="small-note" style={{ marginBottom: 0 }}>Talk to your advisor: the OMC can enrol you in a remediation tutorial for the topic.</p>
        </div>
      )}

      {p.plos.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Outcomes below target (GA target {p.ploPct}%)</h3>
          <table>
            <thead><tr><th>GA</th><th>You</th><th>What happens next</th></tr></thead>
            <tbody>{p.plos.map((x) => (
              <tr key={x.number}>
                <td>GA-{x.number}</td><td>{x.pct}%</td>
                <td>{x.verdict === "COMPENSABLE"
                  ? <span><span className="badge badge-warn">Can be made up</span> <span className="small-note">in {x.makeUp.map((c) => `${c.code}${c.semester ? ` (sem ${c.semester})` : ""}`).join(", ")}</span></span>
                  : <span><span className="badge badge-no">Remediation needed</span> <span className="small-note">no course ahead of you covers it</span></span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {p.clos.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Course outcomes not attained (CLO target {p.cloPct}%)</h3>
          <table>
            <thead><tr><th>Course</th><th>CLO</th><th>You</th><th>Next</th></tr></thead>
            <tbody>{p.clos.map((x, i) => (
              <tr key={i}>
                <td>{x.course}<div className="small-note">{x.title}</div></td><td>{x.clo}{x.plo ? <div className="small-note">GA-{x.plo}</div> : null}</td><td>{x.pct}%</td>
                <td>{x.verdict === "COMPENSABLE" ? <span className="small-note">Made up in {x.makeUp.join(", ")}</span> : <span className="badge badge-no">Remediation needed</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {p.remediation.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Your remediation</h3>
          {p.remediation.map((r) => (
            <div key={r.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0", fontSize: 13 }}>
              <b>{r.title}</b> {r.result === "CLEARED" ? <span className="badge badge-ok">Cleared{r.scorePct !== null ? ` · ${r.scorePct}%` : ""}</span> : r.result === "NOT_CLEARED" ? <span className="badge badge-no">Not cleared{r.scorePct !== null ? ` · ${r.scorePct}%` : ""}</span> : <span className="badge badge-warn">{r.status === "RUNNING" ? "Running" : "Planned"}</span>}
              <div className="small-note">{r.courseCode}: {r.topics.join(", ")}</div>
              {r.kind === "JUNIOR_SITTING" && r.host && <div>Attend lecture{r.lectures.length > 1 ? "s" : ""} {r.lectures.join(", ")} of {r.host}.</div>}
              {r.schedule && <div style={{ whiteSpace: "pre-wrap" }}>{r.schedule}</div>}
              {r.startDate && <div className="small-note">Starts {r.startDate.toISOString().slice(0, 10)}</div>}
              {r.feeAmount > 0 && <div className="small-note">Fee {pkr(r.feeAmount)}: {r.feeStatus === "PAID" ? "paid" : r.feeStatus === "WAIVED" ? "waived" : "due — pay at the accounts office before the micro-assessment"}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
