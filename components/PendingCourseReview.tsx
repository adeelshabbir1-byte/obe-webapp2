"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Clo = { id: string; statement: string; bloomLevel: string };
type Suggestion = { id: string; title: string };
type PendingCourse = {
  id: string; title: string; suggestedCode: string | null; category: string | null; domain: string | null;
  source: string; clos: Clo[]; suggestions: Suggestion[];
};
type ExistingCourse = { id: string; title: string; category: string };

const CATEGORIES = ["General Education", "Core", "Elective", "IDS", "Certification", "Capstone Project", "Field Experience", "Major", "Domain Elective", "General Education / Other"];

export default function PendingCourseReview({ curriculumId, pendingCourses, allCourses }: { curriculumId: string; pendingCourses: PendingCourse[]; allCourses: ExistingCourse[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [manualMatchId, setManualMatchId] = useState<Record<string, string>>({});
  const [mergeClos, setMergeClos] = useState<Record<string, boolean>>({});
  const [newCourseCode, setNewCourseCode] = useState<Record<string, string>>({});
  const [newCourseCategory, setNewCourseCategory] = useState<Record<string, string>>({});

  async function equate(pendingId: string, existingCourseId: string) {
    setLoadingId(pendingId); setError("");
    try {
      const res = await fetch(`/api/admin/curricula/pending-courses/${pendingId}/approve-as-match`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ existingCourseId, mergeClos: !!mergeClos[pendingId] }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoadingId(null); return; }
      router.refresh(); setLoadingId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoadingId(null); }
  }

  async function approveAsNew(pendingId: string) {
    setLoadingId(pendingId); setError("");
    try {
      const res = await fetch(`/api/admin/curricula/pending-courses/${pendingId}/approve-as-new`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCourseCode[pendingId], category: newCourseCategory[pendingId] }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoadingId(null); return; }
      router.refresh(); setLoadingId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoadingId(null); }
  }

  async function reject(pendingId: string) {
    setLoadingId(pendingId); setError("");
    try {
      const res = await fetch(`/api/admin/curricula/pending-courses/${pendingId}/reject`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoadingId(null); return; }
      router.refresh(); setLoadingId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoadingId(null); }
  }

  if (pendingCourses.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--slate)" }}>Nothing waiting for review right now.</p>;
  }

  return (
    <div>
      {error && <div style={{ color: "var(--rust)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
      {pendingCourses.map((p) => (
        <div key={p.id} style={{ border: "1px solid var(--line)", marginBottom: 12, padding: 12, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.title}</div>
              <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 2 }}>Source: {p.source}</div>
              {(p.category || p.domain) && <div style={{ fontSize: 11, color: "var(--slate)" }}>{p.category}{p.domain ? ` · ${p.domain}` : ""}</div>}
            </div>
            <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)} style={{ fontSize: 11, background: "none", border: "1px solid var(--line)", padding: "3px 8px", cursor: "pointer" }}>
              {expandedId === p.id ? "Hide" : "Show"} {p.clos.length} CLOs
            </button>
          </div>

          {expandedId === p.id && (
            <div style={{ marginTop: 8, padding: 8, background: "#FAFAF8", fontSize: 11.5 }}>
              {p.clos.map((c) => <div key={c.id} style={{ padding: "3px 0", borderBottom: "1px solid var(--line)" }}><b>{c.bloomLevel}</b> — {c.statement}</div>)}
            </div>
          )}

          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
            {p.suggestions.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11.5, marginBottom: 4 }}>Possible existing match:</div>
                {p.suggestions.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12 }}>{s.title}</span>
                    <label style={{ fontSize: 10.5, display: "flex", alignItems: "center", gap: 3 }}>
                      <input type="checkbox" checked={!!mergeClos[p.id]} onChange={(e) => setMergeClos((prev) => ({ ...prev, [p.id]: e.target.checked }))} />
                      also merge its CLOs in
                    </label>
                    <button disabled={loadingId === p.id} onClick={() => equate(p.id, s.id)} className="btn btn-brass" style={{ fontSize: 10.5, padding: "3px 8px" }}>
                      Same course — equate
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <select value={manualMatchId[p.id] || ""} onChange={(e) => setManualMatchId((prev) => ({ ...prev, [p.id]: e.target.value }))} style={{ fontSize: 11, padding: 4 }}>
                <option value="">— pick a different existing course —</option>
                {allCourses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <button disabled={!manualMatchId[p.id] || loadingId === p.id} onClick={() => equate(p.id, manualMatchId[p.id])} className="btn" style={{ fontSize: 10.5, padding: "3px 8px", background: "transparent", border: "1px solid var(--line)" }}>
                Equate to selected
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 10 }}>
              <input placeholder="Code" defaultValue={p.suggestedCode ?? ""} onChange={(e) => setNewCourseCode((prev) => ({ ...prev, [p.id]: e.target.value }))} style={{ width: 90, fontSize: 11, padding: 4 }} />
              <select defaultValue={p.category ?? ""} onChange={(e) => setNewCourseCategory((prev) => ({ ...prev, [p.id]: e.target.value }))} style={{ fontSize: 11, padding: 4 }}>
                <option value="">Category…</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button disabled={loadingId === p.id} onClick={() => approveAsNew(p.id)} className="btn btn-brass" style={{ fontSize: 10.5, padding: "3px 8px" }}>
                Not a match — add as new course
              </button>
              <button disabled={loadingId === p.id} onClick={() => reject(p.id)} style={{ fontSize: 10.5, padding: "3px 8px", background: "none", border: "1px solid var(--rust)", color: "var(--rust)", cursor: "pointer" }}>
                Reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
