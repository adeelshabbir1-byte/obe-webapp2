"use client";

import { useState, useEffect } from "react";

type SuggestedCourse = { id: string; code: string; title: string; semesterNumber: number | null; batchLabel: string };
type Suggestion = { courses: SuggestedCourse[] };

export default function ContentSyncSuggestions({ batchIds, onLinked }: { batchIds: string[]; onLinked?: () => void }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  function keyFor(s: Suggestion) {
    return s.courses.map((c) => c.id).join(",");
  }

  async function load() {
    try {
      const res = await fetch(`/api/omc/content-sync/suggestions?batchIds=${batchIds.join(",")}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setSuggestions(data.suggestions); setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }
  useEffect(() => { load(); }, [batchIds.join(",")]);

  async function linkThese(s: Suggestion) {
    const key = keyFor(s);
    setBusyKey(key); setError("");
    try {
      // Pair the first course with each of the others in turn — the pair
      // endpoint already handles joining an unlinked course into an
      // existing group, so this naturally combines all of them into one,
      // with the base decided by the usual seniority/degree-program rule.
      for (let i = 1; i < s.courses.length; i++) {
        const res = await fetch("/api/omc/content-sync/pair", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseIdA: s.courses[0].id, courseIdB: s.courses[i].id }),
        });
        const data = await res.json();
        if (!res.ok) { setError(`${s.courses[0].code}: ${data.error || "something went wrong"}`); setBusyKey(null); return; }
      }
      await load();
      setBusyKey(null);
      onLinked?.();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyKey(null); }
  }

  const visible = suggestions.filter((s) => !dismissed.has(keyFor(s)));
  if (!loaded || visible.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {error && <div className="err">{error}</div>}
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Suggested Content Sync Links</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        These courses share the same code or name across batches from the last 4 admission years, but aren't
        linked yet — a likely sign one was imported/copied from another and should stay in sync. Review before
        linking; a shared code/name alone doesn't always mean the same real course.
      </p>
      {visible.map((s) => {
        const key = keyFor(s);
        return (
          <div key={key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
            <div style={{ flex: 1, fontSize: 12 }}>
              <b>{s.courses[0].title}</b>
              <div style={{ color: "var(--slate)", fontSize: 11, marginTop: 2 }}>
                {s.courses.map((c) => `${c.code} [${c.batchLabel}, Sem ${c.semesterNumber ?? "?"}]`).join("  •  ")}
              </div>
            </div>
            <button onClick={() => linkThese(s)} disabled={busyKey === key} className="btn btn-brass" style={{ fontSize: 11, padding: "4px 10px", whiteSpace: "nowrap" }}>
              {busyKey === key ? "Linking…" : "Link These"}
            </button>
            <button onClick={() => setDismissed((prev) => new Set(prev).add(key))} style={{ fontSize: 11, padding: "4px 8px", border: "1px solid var(--line)", background: "#fff", whiteSpace: "nowrap" }}>
              Not the same
            </button>
          </div>
        );
      })}
    </div>
  );
}
