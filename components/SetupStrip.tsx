import Link from "next/link";
import { setupProgress, type StepKey } from "../lib/setupProgress";
import SetupStepDone from "./SetupStepDone";

// The slim progress strip shown on every page of a batch's guided set-up (?setup=<batchId>): the steps as dots
// (✓ done · ● this one · ○ to do, each a link), "← Previous step" / "Next step →", and — on a step the Program Lead
// finishes by hand — the "… are final →" button that ticks it and moves on.
export default async function SetupStrip({ batchId, step }: { batchId: string; step: StepKey }) {
  const p = await setupProgress(batchId).catch(() => null);
  if (!p) return null;
  const i = p.steps.findIndex((s) => s.key === step);
  const me = p.steps[i], prev = p.steps[i - 1], next = p.steps[i + 1];
  return (
    <div className="card no-print" style={{ padding: "8px 12px", borderLeft: "5px solid #0D2A4A", marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>Batch set-up · {p.batch.degreeProgram} — {p.batch.batchName} · step {me?.n} of {p.total}: {me?.label}</b>
        <div style={{ flex: "1 1 220px", height: 6, background: "#E8ECF1", borderRadius: 4, overflow: "hidden" }} aria-label={`${p.doneCount} of ${p.total} steps done`}><div style={{ width: `${Math.round((100 * p.doneCount) / p.total)}%`, height: "100%", background: "#2E7D32" }} /></div>
        <span className="small-note" style={{ margin: 0 }}>{p.doneCount} of {p.total} done</span>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "6px 0" }}>
        {p.steps.map((s) => <Link key={s.key} href={s.url} title={`${s.n}. ${s.label}${s.note ? ` — ${s.note}` : ""}`} style={{ fontSize: 11.5, textDecoration: "none", padding: "2px 7px", borderRadius: 999, border: `1px solid ${s.key === step ? "#0D2A4A" : "#DDE2E8"}`, background: s.key === step ? "#0D2A4A" : s.done ? "#E6F4EA" : "#fff", color: s.key === step ? "#fff" : s.done ? "#1E6B34" : "#556" }}>{s.done ? "✓" : s.key === step ? "●" : "○"} {s.n} {s.label}</Link>)}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {prev && <Link className="btn btn-secondary btn-sm" href={prev.url}>← Previous step</Link>}
        {me?.manual && <SetupStepDone batchId={batchId} step={step} label={me.doneLabel || `${me.label} done`} nextUrl={next?.url || "/coordinator/batches"} done={me.done} />}
        {next && <Link className="btn btn-sm" href={next.url}>Next step →</Link>}
        {me?.done && me.note && <span className="small-note" style={{ margin: 0 }}>✓ {me.note}</span>}
      </div>
    </div>
  );
}
