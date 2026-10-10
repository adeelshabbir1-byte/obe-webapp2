"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Shows how the Final paper splits before/after the midterm against the OMC's suggestion, and lets the SE set the midterm week. */
export default function FinalBoundaryPanel({ courseId, midtermWeek, defaultWeek, maxWeek, beforePct, afterPct, unlinked, suggestedBefore }: {
  courseId: string; midtermWeek: number; defaultWeek: number; maxWeek: number; beforePct: number | null; afterPct: number | null; unlinked: number; suggestedBefore: number | null;
}) {
  const router = useRouter();
  const [week, setWeek] = useState(midtermWeek);
  const [busy, setBusy] = useState(false);
  const TOLERANCE = 10; // percentage points
  const off = suggestedBefore !== null && beforePct !== null && Math.abs(beforePct - suggestedBefore) > TOLERANCE;

  async function save(value: number | null) {
    setBusy(true);
    await fetch(`/api/subjectexpert/courses/${courseId}/midterm-week`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week: value }) });
    setBusy(false); router.refresh();
  }

  return (
    <div className="card" style={{ borderColor: off ? "var(--rust)" : undefined }}>
      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Final paper: before vs after the midterm</h3>
      <p style={{ fontSize: 12.5, marginBottom: 8 }}>
        {suggestedBefore !== null
          ? <>The OMC suggests about <b>{suggestedBefore}%</b> of the Final from topics up to the midterm and <b>{100 - suggestedBefore}%</b> from after it.</>
          : <>The OMC has not set a before/after split for this course type.</>}
      </p>
      <p style={{ fontSize: 12.5, marginBottom: 8 }}>
        {beforePct === null
          ? <>Your Final questions are not linked to topics yet, so the split can't be worked out. Link them on the Assessments &amp; Submit tab.</>
          : <>Your Final paper: <b>{beforePct}%</b> before the midterm · <b>{afterPct}%</b> after{unlinked > 0 ? ` (${unlinked} question(s) not linked to a topic are left out)` : ""}.</>}
      </p>
      {off && <p style={{ fontSize: 12.5, color: "var(--rust)", fontWeight: 600, marginBottom: 8 }}>⚠ Your Final is more than {TOLERANCE} points away from the OMC's suggested split.</p>}
      <div style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        Topics up to and including week
        <input type="number" min={1} max={maxWeek || 30} value={week} onChange={(e) => setWeek(parseInt(e.target.value, 10) || 1)} style={{ width: 56, padding: "4px 6px", border: "1px solid var(--line)" }} />
        count as before the midterm.
        <button className="btn btn-brass" disabled={busy || week === midtermWeek} onClick={() => save(week)} style={{ padding: "4px 10px", fontSize: 11.5 }}>{busy ? "Saving…" : "Save"}</button>
        {midtermWeek !== defaultWeek && <button className="btn" disabled={busy} onClick={() => save(null)} style={{ padding: "4px 10px", fontSize: 11.5 }}>Use automatic (week {defaultWeek})</button>}
      </div>
    </div>
  );
}
