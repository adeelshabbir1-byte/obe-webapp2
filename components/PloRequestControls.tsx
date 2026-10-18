"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Plo = { id: string; number: number; title: string; onCourse: boolean; clos: string[] };
type Req = { id: string; plo: string; action: string; reason: string; status: string; by: string; byId: string; as: string; note: string | null; decidedBy: string; createdAt: string; closUnmapped: number };
const BADGE: Record<string, string> = { PENDING: "badge-warn", APPROVED: "badge-ok", REJECTED: "badge-no", CANCELLED: "badge-neutral" };
const STATUS: Record<string, string> = { PENDING: "waiting for OMC", APPROVED: "approved", REJECTED: "declined", CANCELLED: "withdrawn" };

/** On the CLO page: the course's PLOs, and asking the OMC to add or remove one. */
export function CoursePloRequests({ courseId, plos, requests, meId, readOnly, missing }: { courseId: string; plos: Plo[]; requests: Req[]; meId: string; readOnly?: boolean; missing?: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<{ ploId: string; action: "ADD" | "REMOVE" } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = new Set(requests.filter((r) => r.status === "PENDING").map((r) => r.plo));
  async function send() {
    if (!form) return;
    setBusy(true); setError("");
    const r = await fetch("/api/plo-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, ...form, reason }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || "Could not send."); return; }
    setForm(null); setReason(""); router.refresh();
  }
  async function withdraw(id: string) {
    setBusy(true);
    await fetch(`/api/plo-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "CANCEL" }) });
    setBusy(false); router.refresh();
  }
  const chosen = form ? plos.find((p) => p.id === form.ploId) : null;
  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: 4 }}>This course&apos;s GAs</h3>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>The OMC decides which GAs a course serves. If one is missing or doesn&apos;t fit, ask here — the OMC is notified and the change happens when they approve.</p>
      {missing && <div className="err">The GA request table is not in the database yet — run prisma/migration_plo_requests.sql in Supabase.</div>}
      {plos.length === 0 ? <p style={{ color: "var(--slate)", fontSize: 13 }}>This batch has no GAs yet.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>GA</th><th>Title</th><th>On this course</th><th>CLOs mapped</th>{!readOnly && <th></th>}</tr></thead>
            <tbody>
              {plos.map((p) => {
                const key = `GA-${p.number}`;
                return (
                  <tr key={p.id} style={p.onCourse ? undefined : { color: "var(--slate)" }}>
                    <td><b>{key}</b></td>
                    <td>{p.title}</td>
                    <td>{p.onCourse ? <span className="badge badge-ok">yes</span> : "no"}</td>
                    <td>{p.clos.join(", ") || "—"}</td>
                    {!readOnly && <td style={{ whiteSpace: "nowrap" }}>
                      {pending.has(key) ? <span className="badge badge-warn">request waiting</span>
                        : <button className="btn btn-secondary" style={{ padding: "2px 10px", fontSize: 12 }} disabled={busy || missing} onClick={() => { setForm({ ploId: p.id, action: p.onCourse ? "REMOVE" : "ADD" }); setError(""); }}>{p.onCourse ? "Ask to remove" : "Ask to add"}</button>}
                    </td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {form && chosen && (
        <div style={{ marginTop: 12, padding: 12, background: "var(--royal-50, #F4F6FB)", borderRadius: 8 }}>
          <b>{form.action === "ADD" ? "Ask to add" : "Ask to remove"} GA-{chosen.number}</b> — {chosen.title}
          {form.action === "REMOVE" && chosen.clos.length > 0 && <p style={{ fontSize: 12.5, color: "#7A5208", margin: "6px 0" }}>{chosen.clos.join(", ")} point to this GA. If the OMC approves, they will need a GA again.</p>}
          {error && <div className="err">{error}</div>}
          <div className="field" style={{ marginTop: 8 }}>
            <label>Why? (the OMC sees this)</label>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={form.action === "ADD" ? "e.g. Lectures 12–16 are a team project with presentations; this course builds communication skills (GA-10)." : "e.g. No topic or assessment of this course addresses this GA."} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send to OMC"}</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}
      {requests.length > 0 && (
        <details style={{ marginTop: 12 }} open={requests.some((r) => r.status === "PENDING")}>
          <summary style={{ cursor: "pointer", fontSize: 13 }}>Requests for this course ({requests.length})</summary>
          {requests.map((r) => (
            <div key={r.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0", fontSize: 12.5 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b>{r.action === "ADD" ? "Add" : "Remove"} {r.plo}</b>
                <span className={`badge ${BADGE[r.status] || "badge-neutral"}`}>{STATUS[r.status] || r.status}</span>
                <span style={{ color: "var(--slate)" }}>by {r.by} ({r.as === "INSTRUCTOR" ? "Instructor" : "Subject Expert"}), {new Date(r.createdAt).toLocaleDateString("en-GB")}</span>
                {r.status === "PENDING" && r.byId === meId && <button className="btn btn-secondary" style={{ padding: "1px 8px", fontSize: 11.5, marginLeft: "auto" }} disabled={busy} onClick={() => withdraw(r.id)}>Withdraw</button>}
              </div>
              <div style={{ marginTop: 3 }}>{r.reason}</div>
              {r.status !== "PENDING" && r.status !== "CANCELLED" && <div style={{ marginTop: 3, color: "var(--slate)" }}>OMC{r.decidedBy ? ` (${r.decidedBy})` : ""}: {r.note || (r.status === "APPROVED" ? "approved" : "declined")}{r.closUnmapped ? ` — ${r.closUnmapped} CLO(s) lost this GA and need remapping` : ""}</div>}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

/** On the OMC page: approve or decline one request. */
export function PloRequestDecision({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go(decision: "APPROVE" | "REJECT") {
    setBusy(true); setError("");
    const r = await fetch(`/api/plo-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || "Could not save."); return; }
    router.refresh();
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
      <input style={{ flex: "1 1 260px" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to them (needed to decline)" />
      <button className="btn" disabled={busy} onClick={() => go("APPROVE")}>Approve</button>
      <button className="btn btn-secondary" disabled={busy} onClick={() => go("REJECT")}>Decline</button>
      {error && <span className="err" style={{ margin: 0 }}>{error}</span>}
    </div>
  );
}
