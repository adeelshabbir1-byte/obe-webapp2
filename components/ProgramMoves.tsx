"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Teacher = { id: string; name: string; fromId: string; fromLabel: string; departmentId: string };
type Lead = { id: string; label: string; departmentId: string };
type Move = { id: string; teacher: string; from: string; to: string; fromId: string; toId: string; fromStatus: string; toStatus: string; status: string; by: string; requestedById: string; note: string | null; at: string };

const badge = (s: string) => (s === "APPROVED" || s === "APPLIED" ? "badge-ok" : s === "REJECTED" || s === "CANCELLED" ? "badge-warn" : "badge-neutral");
const word: Record<string, string> = { PENDING: "Waiting", APPROVED: "Accepted", REJECTED: "Declined", APPLIED: "Done", CANCELLED: "Withdrawn" };

export default function ProgramMoves({ canAsk, myId, teachers, leads, moves }: { canAsk: boolean; myId: string; teachers: Teacher[]; leads: Lead[]; moves: Move[] }) {
  const router = useRouter();
  const [teacherId, setTeacherId] = useState("");
  const [toId, setToId] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const teacher = teachers.find((t) => t.id === teacherId);
  const targets = leads.filter((l) => teacher && l.departmentId === teacher.departmentId && l.id !== teacher.fromId);

  async function send(method: "POST" | "PATCH", body: object) {
    setBusy(true); setErr("");
    const res = await fetch("/api/program-moves", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Could not save"); return; }
    setTeacherId(""); setToId(""); setNote(""); router.refresh();
  }
  return (
    <div>
      {err && <div className="card" style={{ borderLeft: "4px solid #c62828", fontSize: 13 }}>{err}</div>}
      {canAsk && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Ask to move a teacher to another program</h3>
          <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>The move happens only when both Program Leads accept: the one the teacher leaves and the one the teacher joins.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: 12 }}>Teacher<br />
              <select value={teacherId} onChange={(e) => { setTeacherId(e.target.value); setToId(""); }} style={{ minWidth: 240 }}>
                <option value="">— choose —</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} — now in {t.fromLabel}</option>)}
              </select></label>
            <label style={{ fontSize: 12 }}>Move to<br />
              <select value={toId} onChange={(e) => setToId(e.target.value)} style={{ minWidth: 220 }} disabled={!teacher}>
                <option value="">— choose —</option>
                {targets.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select></label>
            <label style={{ fontSize: 12 }}>Reason (optional)<br /><input value={note} onChange={(e) => setNote(e.target.value)} style={{ width: 240 }} /></label>
            <button className="btn btn-brass" disabled={busy || !teacherId || !toId} onClick={() => send("POST", { teacherId, toCoordinatorId: toId, note })}>Send request</button>
          </div>
        </div>
      )}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Requests</h3>
        {moves.length === 0 ? <p style={{ color: "var(--slate)", fontSize: 13 }}>No requests yet.</p> : (
          <table>
            <thead><tr><th>Teacher</th><th>From</th><th>To</th><th>Asked by</th><th>Answers</th><th></th></tr></thead>
            <tbody>{moves.map((m) => (
              <tr key={m.id}>
                <td><b>{m.teacher}</b>{m.note && <div style={{ fontSize: 12, color: "var(--slate)" }}>{m.note}</div>}<div style={{ fontSize: 11, color: "var(--slate)" }}>{m.at}</div></td>
                <td>{m.from}</td><td>{m.to}</td><td>{m.by}</td>
                <td style={{ fontSize: 12 }}>
                  <div>Leaving lead: <span className={`badge ${badge(m.fromStatus)}`}>{word[m.fromStatus]}</span></div>
                  <div style={{ marginTop: 3 }}>Joining lead: <span className={`badge ${badge(m.toStatus)}`}>{word[m.toStatus]}</span></div>
                  {m.status !== "PENDING" && <div style={{ marginTop: 3 }}><b>{word[m.status]}</b></div>}
                </td>
                <td>
                  {m.status === "PENDING" && ((m.fromId === myId && m.fromStatus === "PENDING") || (m.toId === myId && m.toStatus === "PENDING")) && (
                    <span><button className="btn btn-brass" disabled={busy} onClick={() => send("PATCH", { id: m.id, decision: "APPROVE" })}>Accept</button>{" "}
                      <button className="btn" disabled={busy} onClick={() => send("PATCH", { id: m.id, decision: "REJECT" })}>Decline</button></span>
                  )}
                  {m.status === "PENDING" && m.requestedById === myId && <button className="btn" disabled={busy} onClick={() => send("PATCH", { id: m.id, decision: "CANCEL" })}>Withdraw</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
