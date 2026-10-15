"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; topic: string; subtopic: string | null; note: string | null; status: string; createdAt: string; course: string; from: string; who: string };

/** Topics suggested to my courses (accept adds it to the end of my plan) and topics I suggested to others. */
export default function TopicSuggestionsPanel({ received, sent }: { received: Item[]; sent: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function answer(id: string, decision: "ACCEPT" | "DECLINE") {
    setBusy(id); setError("");
    const res = await fetch(`/api/faculty/topic-suggestions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.error || "Could not answer."); return; }
    router.refresh();
  }
  const badge = (s: string) => (s === "ACCEPTED" ? <span className="badge badge-ok">Accepted</span> : s === "DECLINED" ? <span className="badge badge-neutral">Declined</span> : <span className="badge badge-warn">Waiting</span>);
  return (
    <div>
      {error && <div className="err">{error}</div>}
      <h3 style={{ marginTop: 0 }}>Suggested to your courses</h3>
      {received.length === 0 ? <p className="small-note">No suggestions yet.</p> : (
        <table>
          <thead><tr><th>Topic</th><th>For</th><th>From</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {received.map((s) => (
              <tr key={s.id}>
                <td><b>{s.topic}</b>{s.subtopic && <div className="small-note">{s.subtopic}</div>}{s.note && <div style={{ fontSize: 12 }}>&ldquo;{s.note}&rdquo;</div>}</td>
                <td>{s.course}</td>
                <td style={{ fontSize: 12 }}>{s.who}{s.from ? <div className="small-note">{s.from}</div> : null}<div className="small-note">{s.createdAt}</div></td>
                <td>{badge(s.status)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {s.status === "PENDING" && (
                    <>
                      <button type="button" className="btn btn-brass btn-xs" disabled={busy === s.id} onClick={() => answer(s.id, "ACCEPT")}>Add to my plan</button>{" "}
                      <button type="button" className="btn btn-secondary btn-xs" disabled={busy === s.id} onClick={() => answer(s.id, "DECLINE")}>Decline</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>You suggested</h3>
      {sent.length === 0 ? <p className="small-note">Drag one of your topics onto a reference course in the workspace to suggest it.</p> : (
        <table>
          <thead><tr><th>Topic</th><th>To</th><th>Sent</th><th>Status</th></tr></thead>
          <tbody>{sent.map((s) => <tr key={s.id}><td><b>{s.topic}</b>{s.note && <div style={{ fontSize: 12 }}>&ldquo;{s.note}&rdquo;</div>}</td><td>{s.course}</td><td className="small-note">{s.createdAt}</td><td>{badge(s.status)}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
