"use client";

import { useState } from "react";

type PlanRow = { courseId: string; code: string; title: string; batch: string; action: "fill" | "update" | "skip"; reason?: string; masterClos: number; courseClos: number };
type Totals = { courses: number; closAdded: number; closUpdated: number; closRemoved: number; closKept: number; topicsFilled: number; mappingsAdded: number };

// "Update my courses from this curriculum": preview first, then apply in small groups with a progress bar.
export default function MasterPushPanel({ curriculumId }: { curriculumId: string }) {
  const [plan, setPlan] = useState<PlanRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  async function preview() {
    setBusy(true); setError(""); setTotals(null);
    const r = await fetch(`/api/omc/master-curriculum/${curriculumId}/push-to-courses`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setError(d.error || "Could not prepare the update."); else setPlan(d.plan);
    setBusy(false);
  }
  async function apply() {
    if (!plan) return;
    const todo = plan.filter((p) => p.action !== "skip").map((p) => p.courseId);
    if (!confirm(`Update ${todo.length} course(s) from this curriculum? CLOs are replaced by the curriculum's CLOs (in the same order) with their PLOs.`)) return;
    setBusy(true); setError("");
    const sum: Totals = { courses: 0, closAdded: 0, closUpdated: 0, closRemoved: 0, closKept: 0, topicsFilled: 0, mappingsAdded: 0 };
    setProgress({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i += 10) {
      const r = await fetch(`/api/omc/master-curriculum/${curriculumId}/push-to-courses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseIds: todo.slice(i, i + 10) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(`${d.error || "Update stopped."} ${i} of ${todo.length} course(s) were done; press Update again to continue.`); break; }
      (Object.keys(sum) as (keyof Totals)[]).forEach((k) => { sum[k] += d[k] || 0; });
      setProgress({ done: Math.min(i + 10, todo.length), total: todo.length });
    }
    setTotals(sum); setBusy(false);
  }

  const fill = plan?.filter((p) => p.action === "fill") || [];
  const upd = plan?.filter((p) => p.action === "update") || [];
  const skip = plan?.filter((p) => p.action === "skip") || [];
  return (
    <div className="card" style={{ marginBottom: 16, borderColor: "var(--brass)" }}>
      <h3 style={{ fontSize: 14, marginTop: 0 }}>Update my courses from this curriculum</h3>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: -4 }}>
        Copies this curriculum&apos;s CLOs (with Bloom level and PLO) into every course of your batches that comes from it, shares each PLO equally between its CLOs,
        and fills the PLO–Course matrix. Lecture topics, textbook and description are filled only where a course has none yet. Approved (locked) courses and courses with student marks are left alone.
      </p>
      <button className="btn" onClick={preview} disabled={busy}>{busy && !progress ? "Checking…" : plan ? "Check again" : "Preview what will change"}</button>
      {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
      {plan && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          {plan.length === 0 ? <p>No course of your batches comes from this curriculum (matched by its lineage or by degree program and course code).</p> : <>
            <p><b>{fill.length}</b> course(s) have no CLOs yet and will be filled · <b>{upd.length}</b> will be updated · <b>{skip.length}</b> will be skipped{" "}
              {skip.length > 0 && <button type="button" onClick={() => setShowSkipped(!showSkipped)} style={{ background: "none", border: 0, color: "var(--brass-dark)", textDecoration: "underline", cursor: "pointer", fontSize: 12.5 }}>{showSkipped ? "hide" : "show"} skipped</button>}</p>
            {showSkipped && <ul style={{ fontSize: 12, maxHeight: 200, overflowY: "auto" }}>{skip.map((s) => <li key={s.courseId}>{s.code} ({s.batch}) — {s.reason}</li>)}</ul>}
            {fill.length + upd.length > 0 && <button className="btn btn-brass" onClick={apply} disabled={busy}>{busy ? "Updating…" : `Update ${fill.length + upd.length} course(s)`}</button>}
          </>}
        </div>
      )}
      {progress && busy && (
        <div style={{ marginTop: 10 }}>
          <div style={{ background: "#ECE8E0", height: 8, borderRadius: 4 }}><div style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%`, height: "100%", background: "var(--sage)", borderRadius: 4 }} /></div>
          <div style={{ fontSize: 12, color: "var(--slate)", marginTop: 4 }}>{progress.done} of {progress.total} course(s) done…</div>
        </div>
      )}
      {totals && (
        <p style={{ marginTop: 10, fontSize: 13, color: "var(--sage)" }}>
          Done: {totals.courses} course(s) updated — {totals.closAdded} CLO(s) added, {totals.closUpdated} updated, {totals.closRemoved} removed
          {totals.closKept ? `, ${totals.closKept} extra CLO(s) kept because lecture topics use them` : ""}; lecture topics filled in {totals.topicsFilled} course(s); {totals.mappingsAdded} new course-to-PLO link(s).
        </p>
      )}
    </div>
  );
}
