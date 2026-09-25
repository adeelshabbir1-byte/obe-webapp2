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

  const [notice, setNotice] = useState("");

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

  // Shared by both the individual "Link These" button and "Accept All".
  // This used to loop calling /pair once per course, which re-synced the
  // ENTIRE group from scratch on every single call — for a group of N
  // courses that's N full content copies of an ever-growing group
  // (quadratic work for what should be linear), which is exactly what
  // was making this take hours instead of seconds on a large suggestion
  // like "Programming Fundamentals" across many programs and years. The
  // bulk endpoint does the base-selection and the sync exactly once,
  // regardless of how many courses are in the group.
  async function linkOneSuggestion(s: Suggestion): Promise<string | null> {
    try {
      const res = await fetch("/api/omc/content-sync/group-multiple", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseIds: s.courses.map((c) => c.id) }),
      });
      const data = await res.json();
      if (!res.ok) return data.error || "unknown error";
      return null;
    } catch (err: any) {
      return err.message;
    }
  }

  async function linkThese(s: Suggestion) {
    const key = keyFor(s);
    setBusyKey(key); setError("");
    const failure = await linkOneSuggestion(s);
    if (failure) setError(`${s.courses[0].title}: ${failure}`);
    await load();
    setBusyKey(null);
    onLinked?.();
  }

  async function handleAcceptAll() {
    setAcceptingAll(true); setError(""); setNotice("");
    const startCount = visible.length;
    // One suggestion at a time, not in parallel — this project's DB
    // connection is deliberately limited to a small pool, so running
    // many of these concurrently risks contention rather than saving
    // time.
    const allFailures: string[] = [];
    let linkedCount = 0;
    for (const s of visible) {
      const failure = await linkOneSuggestion(s);
      if (!failure) linkedCount++;
      else allFailures.push(`${s.courses[0].title}: ${failure}`);
    }
    if (allFailures.length > 0) setError(`Linked ${linkedCount} of ${startCount} suggestions fully — issues: ${allFailures.join(" | ")}`);
    else setNotice(`Linked all ${linkedCount} suggestion(s) that were showing.`);
    await load();
    setAcceptingAll(false);
    onLinked?.();
  }

  const visible = suggestions.filter((s) => !dismissed.has(keyFor(s)));
  if (!loaded || visible.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {error && <div className="err">{error}</div>}
      {notice && <div style={{ fontSize: 12, background: "#ECFBF4", border: "1px solid var(--sage)", padding: 6, marginBottom: 8 }}>{notice}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Suggested Content Sync Links</h3>
        <button onClick={handleAcceptAll} disabled={acceptingAll || busyKey !== null} className="btn btn-approve" style={{ fontSize: 11.5, padding: "5px 10px", whiteSpace: "nowrap" }}>
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
