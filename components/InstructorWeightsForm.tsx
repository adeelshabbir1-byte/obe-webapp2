"use client";

import { useState } from "react";

type Weights = { assignmentPct: number; quizPct: number; projectPct: number; labPct: number; midtermPct: number; finalPct: number };
type Policy = {
  assignmentMin: number; assignmentMax: number; quizMin: number; quizMax: number;
  projectMin: number; projectMax: number; labMin: number; labMax: number;
  midtermMin: number; midtermMax: number; finalMin: number; finalMax: number;
} | null;

type Counts = { assignmentCount: number | null; quizCount: number | null; projectCount: number | null; labCount: number | null; midtermCount: number | null; finalCount: number | null };
type BestOf = { quizBestOf: number | null; assignmentBestOf: number | null };
type PolicyMinCount = { assignmentMinCount: number; quizMinCount: number; projectMinCount: number; labMinCount: number; midtermMinCount: number; finalMinCount: number } | null;

const ROWS: { key: keyof Weights; countKey: keyof Counts; bestOfKey?: keyof BestOf; label: string; minKey: string; maxKey: string; minCountKey: string; itemNoun: string }[] = [
  { key: "assignmentPct", countKey: "assignmentCount", bestOfKey: "assignmentBestOf", label: "Assignment", minKey: "assignmentMin", maxKey: "assignmentMax", minCountKey: "assignmentMinCount", itemNoun: "assignment(s)" },
  { key: "quizPct", countKey: "quizCount", bestOfKey: "quizBestOf", label: "Quiz", minKey: "quizMin", maxKey: "quizMax", minCountKey: "quizMinCount", itemNoun: "quiz(zes)" },
  { key: "projectPct", countKey: "projectCount", label: "Project", minKey: "projectMin", maxKey: "projectMax", minCountKey: "projectMinCount", itemNoun: "project(s)" },
  { key: "labPct", countKey: "labCount", label: "Lab", minKey: "labMin", maxKey: "labMax", minCountKey: "labMinCount", itemNoun: "lab task(s)" },
  { key: "midtermPct", countKey: "midtermCount", label: "Midterm", minKey: "midtermMin", maxKey: "midtermMax", minCountKey: "midtermMinCount", itemNoun: "question(s)" },
  { key: "finalPct", countKey: "finalCount", label: "Final", minKey: "finalMin", maxKey: "finalMax", minCountKey: "finalMinCount", itemNoun: "question(s)" },
];

export default function InstructorWeightsForm({ courseId, current, sePlanned, policy, hasLab, approved = false, seApproved = false, currentCounts, currentBestOf, seCounts, policyMinCount = null }: {
  courseId: string; current: Weights; sePlanned: Weights; policy: Policy; hasLab: boolean; approved?: boolean; seApproved?: boolean;
  currentCounts?: Counts; currentBestOf?: BestOf; seCounts?: Counts; policyMinCount?: PolicyMinCount;
}) {
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState<{ violations: string[]; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<{ values: Weights; violations: string[] } | null>(null);
  const [values, setValues] = useState<Weights>(current);
  // Number of items per category: your own, else the Subject Expert's, else the OMC minimum (or 1).
  const [counts, setCounts] = useState<Counts>(() => Object.fromEntries(ROWS.map((r) => {
    const min = policyMinCount ? policyMinCount[r.minCountKey as keyof NonNullable<PolicyMinCount>] : null;
    return [r.countKey, currentCounts?.[r.countKey] ?? (min ?? 1)];
  })) as Counts);
  // Best-of starts equal to the number of items (count every item).
  const [bestOf, setBestOfState] = useState<BestOf>(() => ({
    quizBestOf: currentBestOf?.quizBestOf ?? currentCounts?.quizCount ?? null,
    assignmentBestOf: currentBestOf?.assignmentBestOf ?? currentCounts?.assignmentCount ?? null,
  }));

  function setCount(key: keyof Counts, raw: string, min: number) {
    const n = raw === "" ? min : Math.max(min, Number(raw) || 0);
    setCounts((prev) => ({ ...prev, [key]: n }));
    const bestOfKey = key === "quizCount" ? "quizBestOf" : key === "assignmentCount" ? "assignmentBestOf" : null;
    if (bestOfKey) setBestOfState((prev) => ({ ...prev, [bestOfKey]: Math.min(prev[bestOfKey] ?? n, n) }));
  }
  function setBestOf(key: keyof BestOf, raw: string, count: number) {
    const n = raw === "" ? count : Math.max(1, Math.min(count, Number(raw) || 1));
    setBestOfState((prev) => ({ ...prev, [key]: n }));
  }

  function setField(key: keyof Weights, raw: string) {
    setValues((prev) => ({ ...prev, [key]: raw === "" ? 0 : Number(raw) }));
  }

  function checkViolations(vals: Weights): string[] {
    if (!policy) return [];
    const violations: string[] = [];
    for (const r of ROWS) {
      if (r.key === "labPct" && !hasLab) continue;
      const min = (policy as any)[r.minKey], max = (policy as any)[r.maxKey];
      const v = vals[r.key];
      if (v < min || v > max) violations.push(`${r.label}: ${v}% is outside the allowed ${min}–${max}%`);
    }
    return violations;
  }

  async function submitValues(vals: Weights) {
    setLoading(true); setError(""); setOk(false); setPending(null); setConfirming(null);
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/weights`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...vals, ...counts, ...(hasLab ? {} : { labCount: 0 }), ...bestOf }),
      });
      const data = await res.json();
      if (res.status === 202 && data.pendingApproval) {
        setPending({ violations: data.violations || [], message: data.message });
        setLoading(false);
        return;
      }
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOk(true); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setOk(false); setPending(null);
    const same = (a: Weights) => (Object.keys(a) as (keyof Weights)[]).every((k) => values[k] === a[k]);
    const unchanged = (approved && same(current)) || (seApproved && same(sePlanned));
    const violations = unchanged ? [] : checkViolations(values);
    if (violations.length > 0) {
      setConfirming({ values, violations });
      return;
    }
    submitValues(values);
  }

  const total = ROWS.reduce((s, r) => s + (values[r.key] ?? 0), 0);
  const sePlannedTotal = ROWS.reduce((s, r) => s + (sePlanned[r.key] ?? 0), 0);

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 6 }}>Assessment Weights</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 12 }}>
        Your weights, number of items and &quot;best of&quot; start out equal to the Subject Expert&apos;s plan — adjust any that need to differ for your actual delivery.
        Saving sets up exactly that many quizzes, assignments and exam questions on your Assessments tab (items that already have marks are never removed);
        with &quot;best of&quot; only the best ones count toward the grade.
        Going outside the OMC's allowed range asks for confirmation before it's sent for approval. The total below updates as you type.
      </p>
      {error && <div className="err">{error}</div>}
      {ok && <div style={{ background: "#E2F4E8", color: "var(--sage)", border: "1px solid #B8E0C4", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}
      {pending && (
        <div style={{ background: "#FBE2DF", color: "var(--rust)", border: "1px solid #FBC4B4", padding: "10px 12px", fontSize: 12.5, marginBottom: 12 }}>
          <b>Not saved — held for OMC approval.</b> {pending.message}
          {pending.violations.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {pending.violations.map((v) => <li key={v}>{v}</li>)}
            </ul>
          )}
        </div>
      )}

      {confirming && (
        <div style={{ background: "#FBE2DF", color: "var(--rust)", border: "1px solid #FBC4B4", padding: "12px 14px", fontSize: 12.5, marginBottom: 12 }}>
          <b>These are outside the OMC's allowed range:</b>
          <ul style={{ margin: "6px 0 10px", paddingLeft: 18 }}>{confirming.violations.map((v) => <li key={v}>{v}</li>)}</ul>
          <p style={{ marginBottom: 10 }}>Do you want to send this for OMC approval, or go back and adjust the values to stay within range?</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => submitValues(confirming.values)} disabled={loading} className="btn btn-brass">
              {loading ? "Sending…" : "Send for OMC Approval"}
            </button>
            <button type="button" onClick={() => setConfirming(null)} style={{ background: "none", border: "1px solid var(--line)", padding: "6px 12px", cursor: "pointer" }}>
              Go Back and Adjust
            </button>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} style={{ display: confirming ? "none" : undefined }}>
        <table>
          <thead>
            <tr>
              <th>Assessment Tool</th>
              <th>OMC Min %</th>
              <th>OMC Max %</th>
              <th>Subject Expert's %</th>
              <th>Your %</th>
              <th># of Items</th>
              <th>Best Of</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => {
              const min = policy ? (policy as any)[r.minKey] : null;
              const max = policy ? (policy as any)[r.maxKey] : null;
              const isLabLocked = r.key === "labPct" && !hasLab;
              const minCount = policyMinCount ? policyMinCount[r.minCountKey as keyof NonNullable<PolicyMinCount>] : 0;
              const count = counts[r.countKey] ?? minCount ?? 1;
              const seCount = seCounts?.[r.countKey];
              return (
                <tr key={r.key} style={isLabLocked ? { opacity: 0.55 } : undefined}>
                  <td style={{ fontWeight: 600 }}>{r.label}{isLabLocked && <span style={{ fontWeight: 400, fontSize: 10.5, color: "var(--slate)" }}> (no lab component)</span>}</td>
                  <td style={{ color: "var(--slate)" }}>{isLabLocked ? "—" : (min !== null ? `${min}%` : "—")}</td>
                  <td style={{ color: "var(--slate)" }}>{isLabLocked ? "—" : (max !== null ? `${max}%` : "—")}</td>
                  <td style={{ color: "var(--slate)" }}>{isLabLocked ? "—" : `${sePlanned[r.key]}%`}</td>
                  <td>
                    <input
                      name={r.key} type="number" min={0} max={100} value={isLabLocked ? 0 : values[r.key]}
                      disabled={isLabLocked} readOnly={isLabLocked}
                      onChange={(e) => setField(r.key, e.target.value)}
                      style={{ width: 70, padding: "5px 6px", border: "1px solid var(--line)", background: isLabLocked ? "var(--paper)" : undefined }}
                    />
                  </td>
                  <td>
                    <input
                      name={r.countKey} type="number" min={minCount || 0} value={isLabLocked ? 0 : count}
                      disabled={isLabLocked} readOnly={isLabLocked}
                      onChange={(e) => setCount(r.countKey, e.target.value, minCount || 0)}
                      title={minCount ? `OMC minimum: ${minCount} ${r.itemNoun}` : undefined}
                      style={{ width: 60, padding: "5px 6px", border: "1px solid var(--line)", background: isLabLocked ? "var(--paper)" : undefined }}
                    />
                    {!isLabLocked && <div style={{ fontSize: 10, color: "var(--slate)", marginTop: 2 }}>{[minCount ? `min ${minCount}` : "", seCount != null ? `SE: ${seCount}` : ""].filter(Boolean).join(" · ")}</div>}
                  </td>
                  <td>
                    {r.bestOfKey && !isLabLocked ? (
                      <input
                        name={r.bestOfKey} type="number" min={1} max={count} value={bestOf[r.bestOfKey] ?? count}
                        onChange={(e) => setBestOf(r.bestOfKey!, e.target.value, count)}
                        title={`Count only the best ${bestOf[r.bestOfKey] ?? count} of ${count} toward the grade`}
                        style={{ width: 60, padding: "5px 6px", border: "1px solid var(--line)" }}
                      />
                    ) : <span style={{ color: "var(--slate)" }}>—</span>}
                  </td>
                </tr>
              );
            })}
            <tr style={{ fontWeight: 700, borderTop: "2px solid var(--line)" }}>
              <td colSpan={3}></td>
              <td>{sePlannedTotal}%</td>
              <td style={{ color: total === 100 ? "var(--sage)" : "var(--rust)" }}>{total}%</td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <button className="btn btn-brass" type="submit" disabled={loading || total !== 100} style={{ marginTop: 14 }}>{loading ? "Saving…" : "Save Weights"}</button>
        <div style={{ fontSize: 11, color: total === 100 ? "var(--slate)" : "var(--rust)", marginTop: 6 }}>
          {total === 100 ? "Must total exactly 100%." : `Currently totals ${total}% — must be exactly 100% to save.`}
        </div>
      </form>
    </div>
  );
}
