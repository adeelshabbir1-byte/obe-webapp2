"use client";

import { useState, useEffect } from "react";

type SuggestedCourse = { id: string; code: string; title: string; semesterNumber: number | null; batchLabel: string };
type Suggestion = { courses: SuggestedCourse[] };

export default function ContentSyncSuggestions({ batchIds, onLinked }: { batchIds: string[]; onLinked?: () => void }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [acceptingAll, setAcceptingAll] = useState(false);
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

  // Shared by both the individual "Link These" button and "Accept All" —
  // pairs the first course with each of the others in turn, continuing
  // even if one pairing fails rather than abandoning the rest, and
  // returns what happened instead of touching component state directly
  // so a caller processing many suggestions in a row can collect results
  // across all of them before refreshing once at the end.
  async function linkOneSuggestion(s: Suggestion): Promise<string[]> {
    const failures: string[] = [];
    for (let i = 1; i < s.courses.length; i++) {
      try {
        const res = await fetch("/api/omc/content-sync/pair", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseIdA: s.courses[0].id, courseIdB: s.courses[i].id }),
        });
        const data = await res.json();
        if (!res.ok) failures.push(`${s.courses[i].code} (${s.courses[i].batchLabel}): ${data.error || "unknown error"}`);
      } catch (err: any) {
        failures.push(`${s.courses[i].code} (${s.courses[i].batchLabel}): ${err.message}`);
      }
    }
    return failures;
  }

  async function linkThese(s: Suggestion) {
    const key = keyFor(s);
    setBusyKey(key); setError("");
    const failures = await linkOneSuggestion(s);
    if (failures.length > 0) {
      setError(`Linked ${s.courses.length - 1 - failures.length} of ${s.courses.length - 1} — failed: ${failures.join("; ")}`);
    }
    await load();
    setBusyKey(null);
    onLinked?.();
  }

  async function handleAcceptAll() {
    setAcceptingAll(true); setError("");
    // One suggestion at a time, not in parallel — this project's DB
    // connection is deliberately limited to a small pool, so running
    // many of these concurrently risks contention rather than saving
    // time.
    const allFailures: string[] = [];
    let linkedCount = 0;
    for (const s of visible) {
      const failures = await linkOneSuggestion(s);
      if (failures.length === 0) linkedCount++;
      else allFailures.push(`${s.courses[0].title}: ${failures.join("; ")}`);
    }
    if (allFailures.length > 0) setError(`Linked ${linkedCount} of ${visible.length} suggestions fully — issues: ${allFailures.join(" | ")}`);
    await load();
    setAcceptingAll(false);
    onLinked?.();
  }

  const visible = suggestions.filter((s) => !dismissed.has(keyFor(s)));
  if (!loaded || visible.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Suggested Content Sync Links</h3>
        <button onClick={handleAcceptAll} disabled={acceptingAll || busyKey !== null} className="btn btn-brass" style={{ fontSize: 11.5, padding: "5px 10px", whiteSpace: "nowrap" }}>
          {acceptingAll ? "Linking all…" : `Accept All (${visible.length})`}
        </button>
      </div>
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
            <button onClick={() => linkThese(s)} disabled={busyKey === key || acceptingAll} className="btn btn-brass" style={{ fontSize: 11, padding: "4px 10px", whiteSpace: "nowrap" }}>
              {busyKey === key ? "Linking…" : "Link These"}
            </button>
            <button onClick={() => setDismissed((prev) => new Set(prev).add(key))} disabled={acceptingAll} style={{ fontSize: 11, padding: "4px 8px", border: "1px solid var(--line)", background: "#fff", whiteSpace: "nowrap" }}>
              Not the same
            </button>
          </div>
        );
      })}
    </div>
  );
}
