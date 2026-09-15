"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type SuggestedCourse = { id: string; code: string; batchLabel: string };
type Suggestion = { title: string; term: string; courses: SuggestedCourse[] };

export default function EquivalenceSuggestions() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyTitle, setBusyTitle] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/omc/equivalence/suggestions");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setSuggestions(data.suggestions); setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }
  useEffect(() => { load(); }, []);

  async function groupThese(s: Suggestion) {
    setBusyTitle(s.title); setError("");
    try {
      // Pair the first course with each of the others in turn — the pair
      // endpoint already handles merging an ungrouped course into an
      // existing group, so this naturally combines all of them into one.
      for (let i = 1; i < s.courses.length; i++) {
        const res = await fetch("/api/omc/equivalence/pair", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseIdA: s.courses[0].id, courseIdB: s.courses[i].id }),
        });
        const data = await res.json();
        if (!res.ok) { setError(`${s.title}: ${data.error || "something went wrong"}`); setBusyTitle(null); return; }
      }
      await load();
      setBusyTitle(null);
      router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyTitle(null); }
  }

  if (!loaded || suggestions.length === 0) return null;

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Suggested Equivalences</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        These courses share the same name and are offered in the same term, but aren't grouped yet — a likely
        sign they're really one class taught across batches. Review before grouping; a shared name alone
        doesn't always mean the same class.
      </p>
      {error && <div className="err">{error}</div>}
      {suggestions.map((s) => (
        <div key={s.title + s.term} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
          <div style={{ fontSize: 12.5 }}>
            <b>{s.title}</b> ({s.term}) — {s.courses.map((c) => `${c.code} (${c.batchLabel})`).join(", ")}
          </div>
          <button onClick={() => groupThese(s)} disabled={busyTitle === s.title} className="btn btn-brass" style={{ fontSize: 12, padding: "5px 10px", whiteSpace: "nowrap", marginLeft: 10 }}>
            {busyTitle === s.title ? "Grouping…" : "Group These"}
          </button>
        </div>
      ))}
    </div>
  );
}
