"use client";

import { useState } from "react";

type Respondent = { id: string; label: string; alreadyLinked: boolean };
type ResponseRow = { respondentLabel: string; submitted: boolean; token: string };

export default function SurveyDetailManager({ surveyId, respondents: initialRespondents, existingResponses: initialResponses, origin }: {
  surveyId: string; respondents: Respondent[]; existingResponses: ResponseRow[]; origin: string;
}) {
  const [respondents, setRespondents] = useState<Respondent[]>(initialRespondents);
  const [existingResponses, setExistingResponses] = useState<ResponseRow[]>(initialResponses);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newLinks, setNewLinks] = useState<{ respondentLabel: string; token: string }[] | null>(null);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function distribute() {
    if (selected.length === 0) { setError("Select at least one respondent."); return; }
    setLoading(true); setError(""); setNewLinks(null);
    try {
      const res = await fetch(`/api/coordinator/surveys/${surveyId}/distribute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ respondentIds: selected }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      const distributedIds = new Set(selected);
      setRespondents((prev) => prev.map((r) => distributedIds.has(r.id) ? { ...r, alreadyLinked: true } : r));
      setExistingResponses((prev) => [...prev, ...data.links.map((l: any) => ({ respondentLabel: l.respondentLabel, submitted: false, token: l.token }))]);
      setNewLinks(data.links); setSelected([]); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}

      {newLinks && (
        <div className="card" style={{ borderColor: "var(--sage)" }}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Links Ready — Share These with Each Respondent</h3>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>Copy each link and send it however you normally reach them (email, WhatsApp, etc.) — no login is needed to respond.</p>
          {newLinks.map((l) => (
            <div key={l.token} style={{ marginBottom: 8, fontSize: 12.5 }}>
              <b>{l.respondentLabel}:</b> <code style={{ background: "var(--paper)", padding: "2px 6px" }}>{origin}/survey/{l.token}</code>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Select Respondents to Send To</h3>
        {respondents.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No respondents of this type yet — add them under Alumni & Employers, or Students.</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12, maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)", padding: 10 }}>
              {respondents.map((r) => (
                <label key={r.id} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, opacity: r.alreadyLinked ? 0.5 : 1 }}>
                  <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} disabled={r.alreadyLinked} />
                  {r.label}{r.alreadyLinked && " (already sent)"}
                </label>
              ))}
            </div>
            <button onClick={distribute} disabled={loading} className="btn btn-brass">{loading ? "Generating…" : "Generate Links"}</button>
          </>
        )}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Responses</h3>
        <table>
          <thead><tr><th>Respondent</th><th>Status</th><th>Link</th></tr></thead>
          <tbody>
            {existingResponses.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No links generated yet.</td></tr>}
            {existingResponses.map((r) => (
              <tr key={r.token}>
                <td>{r.respondentLabel}</td>
                <td>{r.submitted ? <span className="badge badge-ok">Submitted</span> : <span className="badge badge-neutral">Pending</span>}</td>
                <td><code style={{ fontSize: 11 }}>{origin}/survey/{r.token}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
