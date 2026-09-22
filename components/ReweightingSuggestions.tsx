"use client";

import { useState } from "react";

type Item = { id: string; type: string; label: string; currentWeight: number; suggestedWeight: number; avgPct: number | null; gradedCount: number };
type Suggestion = { cloCode: string; totalWeight: number; items: Item[] };

export default function ReweightingSuggestions({ courseId, suggestions: initialSuggestions }: { courseId: string; suggestions: Suggestion[] }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initialSuggestions);
  const [loading, setLoading] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [error, setError] = useState("");

  function markApplied(instrumentId: string, weight: number) {
    setSuggestions((prev) => prev.map((s) => ({
      ...s, items: s.items.map((it) => it.id === instrumentId ? { ...it, currentWeight: weight } : it),
    })));
  }

  async function apply(instrumentId: string, weight: number) {
    setLoading(instrumentId); setError("");
    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/instruments/${instrumentId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marksPct: weight }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(null); return; }
      markApplied(instrumentId, weight);
      setLoading(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(null); }
  }

  async function applyAll() {
    const toApply = suggestions.flatMap((s) => s.items.filter((it) => Math.abs(it.suggestedWeight - it.currentWeight) >= 1));
    if (toApply.length === 0) return;
    if (!confirm(`Apply all ${toApply.length} suggested weight change(s) across every CLO?`)) return;
    setApplyingAll(true); setError("");
    try {
      for (const it of toApply) {
        const res = await fetch(`/api/instructor/courses/${courseId}/instruments/${it.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marksPct: it.suggestedWeight }),
        });
        if (!res.ok) { const data = await res.json(); setError(data.error || "Something went wrong partway through — some changes may not have applied."); setApplyingAll(false); return; }
        markApplied(it.id, it.suggestedWeight);
      }
      setApplyingAll(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setApplyingAll(false); }
  }

  if (suggestions.length === 0) return null;

  const totalChanges = suggestions.reduce((s, sug) => s + sug.items.filter((it) => Math.abs(it.suggestedWeight - it.currentWeight) >= 1).length, 0);

  return (
    <div className="card" style={{ borderColor: "var(--brass)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 6, color: "var(--brass-dark)" }}>Suggested Re-Weighting</h3>
          <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 12, maxWidth: 640 }}>
            Based on how the class actually scored on each item — shifting weight toward whichever items students did
            best on raises that CLO's average and pass rate. Each CLO's total weight stays the same. Purely a
            suggestion — apply any, all, or none.
          </p>
        </div>
        {totalChanges > 1 && (
          <button onClick={applyAll} disabled={applyingAll || loading !== null} className="btn btn-brass" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            {applyingAll ? "Applying…" : `Apply All (${totalChanges})`}
          </button>
        )}
      </div>
      {error && <div className="err">{error}</div>}
      {suggestions.map((s) => (
        <div key={s.cloCode} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{s.cloCode} — total {s.totalWeight}%</div>
          <table>
            <thead><tr><th>Item</th><th>Class Avg</th><th>Current Weight</th><th>Suggested Weight</th><th></th></tr></thead>
            <tbody>
              {s.items.map((it) => {
                const changed = Math.abs(it.suggestedWeight - it.currentWeight) >= 1;
                return (
                  <tr key={it.id}>
                    <td>{it.type} {it.label}</td>
                    <td>{it.avgPct !== null ? `${Math.round(it.avgPct * 100)}%` : `no marks yet`}</td>
                    <td>{it.currentWeight}%</td>
                    <td style={{ fontWeight: changed ? 600 : 400, color: changed ? (it.suggestedWeight > it.currentWeight ? "var(--sage)" : "var(--rust)") : undefined }}>
                      {it.suggestedWeight}%
                    </td>
                    <td>
                      {changed && (
                        <button onClick={() => apply(it.id, it.suggestedWeight)} disabled={loading === it.id} className="btn btn-brass" style={{ padding: "3px 10px", fontSize: 11 }}>
                          {loading === it.id ? "Applying…" : "Apply"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
