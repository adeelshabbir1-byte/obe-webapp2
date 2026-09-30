import { ProgressStep, progressPct } from "../lib/courseProgress";

export default function ProgressBar({ steps, width = 110 }: { steps: ProgressStep[]; width?: number }) {
  const doneCount = steps.filter((s) => s.done).length;
  const pct = progressPct(steps);
  const pending = steps.filter((s) => !s.done).map((s) => s.label);
  return (
    <div title={pending.length > 0 ? `Still pending: ${pending.join(", ")}` : "All steps complete"}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--slate)", marginBottom: 2 }}>
        <span>{doneCount}/{steps.length} steps</span><span>{pct}%</span>
      </div>
      <div style={{ width, height: 7, background: "#EEE", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--sage)" : "var(--brass)" }} />
      </div>
    </div>
  );
}
