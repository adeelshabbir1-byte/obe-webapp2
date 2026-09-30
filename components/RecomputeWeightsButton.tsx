"use client";

import { useState } from "react";

// One-off repair tool for the weight-rounding bug fix: every lecture
// row's weightPct only gets recomputed when something changes on that
// exact row, so rows nobody has touched since the old buggy version wrote
// their number are stuck showing a stale weight forever, even with
// nothing currently mapped to them. Running this once, after the fix is
// deployed, walks every row and forces a fresh, correct number. Safe to
// run more than once — it doesn't change what's mapped, only recomputes
// the resulting weights.
export default function RecomputeWeightsButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [count, setCount] = useState<number | null>(null);

  async function run() {
    if (!confirm("This recalculates the weight % for every lecture row in every course, using the corrected split logic. It doesn't change any quiz/assignment mapping — only fixes weight numbers. Continue?")) return;
    setState("loading");
    try {
      const res = await fetch("/api/chairman/maintenance/recompute-weights", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCount(data.rowsRecomputed ?? 0);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: 15, marginBottom: 6 }}>Fix Weight Numbers</h3>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>
        If any course is showing old or stuck weight percentages (from before the weight-splitting fix), run this once to
        recompute every lecture row's weight across every course with the corrected logic. This does not touch any mapping
        — it only recalculates the numbers.
      </p>
      <button className="btn btn-brass" type="button" onClick={run} disabled={state === "loading"}>
        {state === "loading" ? "Recomputing…" : "Recompute All Weights"}
      </button>
      {state === "done" && (
        <div style={{ background: "#CCFBF1", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginTop: 10 }}>
          Done — recomputed {count} lecture row(s) across every course.
        </div>
      )}
      {state === "error" && (
        <div style={{ background: "#FEE2E2", color: "#B91C1C", padding: "8px 12px", fontSize: 12.5, marginTop: 10 }}>
          Something went wrong — try again.
        </div>
      )}
    </div>
  );
}
