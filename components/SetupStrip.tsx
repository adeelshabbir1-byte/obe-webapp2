import Link from "next/link";
import { flowOf, TOTAL_STEPS, stepHref } from "../lib/batchFlow";
import SetupStepButton from "./SetupStepButton";

// The progress strip of a batch's guided set-up, on every page that does one of its steps (?setup=<batchId>):
// "Batch set-up · BSCS Spring 2027 · step 8 of 13", a dot per step (✓ done · ● this one · ○ to do, each clickable),
// "← Previous step" and "Next step →". `finish` replaces "Next step →" with the page's own finishing button label
// (e.g. "Positions are final →"); `hideNext` leaves the finishing to the page.
export default async function SetupStrip({ batchId, step, finish, hideNext, canAct = true }: { batchId: string; step: number; finish?: string; hideNext?: boolean; canAct?: boolean }) {
  const f = await flowOf(batchId).catch(() => null);
  if (!f) return null;
  const has = f.steps[3].done;
  const s = f.steps[step - 1];
  const prev = step > 1 ? stepHref(step - 1, batchId, has) : null;
  const next = step < TOTAL_STEPS ? stepHref(step + 1, batchId, has) : null;
  return (
    <div className="card" role="navigation" aria-label="Batch set-up steps" style={{ borderLeft: "5px solid #0D2A4A", padding: "10px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>Batch set-up · {f.label} · step {step} of {TOTAL_STEPS}: {s.title}</b>
        <span className="small-note" style={{ margin: 0 }}>{f.done} of {TOTAL_STEPS} done{s.note ? ` · ${s.note}` : ""}{s.mark ? ` · marked final by ${s.mark.byName}, ${new Date(s.mark.at).toLocaleDateString("en-GB")}` : ""}</span>
        <Link href="/coordinator/batches" className="small-note" style={{ marginLeft: "auto" }}>All batches</Link>
      </div>
      <ol style={{ display: "flex", gap: 4, listStyle: "none", padding: 0, margin: "8px 0", flexWrap: "wrap" }}>
        {f.steps.map((x) => {
          const here = x.n === step;
          const mark = x.done ? "✓" : here ? "●" : "○";
          return (
            <li key={x.n}>
              <Link href={x.href} title={`${x.n}. ${x.title}${x.note ? ` — ${x.note}` : ""}`} aria-current={here ? "step" : undefined}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, fontSize: 12, textDecoration: "none", border: `1.5px solid ${here ? "#0D2A4A" : x.done ? "#2E7D32" : "#C9CED6"}`, background: here ? "#EAF1FA" : x.done ? "#EEF7EF" : "#fff", color: x.done ? "#1E6B34" : "#0D2A4A", fontWeight: here ? 700 : 500 }}>
                <span aria-hidden>{mark}</span>{x.n}<span className="setup-strip-title"> {x.title}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {prev && <Link href={prev} className="btn btn-secondary btn-sm">← Previous step</Link>}
        {canAct && !hideNext && next && <SetupStepButton batchId={batchId} step={step} label={finish || "Next step →"} href={next} />}
        {canAct && s.mark && !s.auto && <SetupStepButton batchId={batchId} step={step} label="Reopen this step" reopen primary={false} />}
        {!s.done && step < TOTAL_STEPS && <span className="small-note" style={{ margin: 0 }}>You can go on — later steps don&apos;t wait for this one; only opening registration does.</span>}
      </div>
    </div>
  );
}
