"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Person = { id: string; name: string };
type Holder = { id: string; name: string; term: string; active: boolean };

export default function AssignerHatManager({ teachers, holders, currentLabel, nextLabel }: { teachers: Person[]; holders: Holder[]; currentLabel: string | null; nextLabel: string | null }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [term, setTerm] = useState(currentLabel ? "CURRENT" : "ALWAYS");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(body: object) {
    setBusy(true); setErr("");
    const res = await fetch("/api/chairman/assigner-hat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Could not save"); return; }
    setUserId(""); router.refresh();
  }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Give the Course Assigner role to a teacher</h3>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>
        Any teacher can be the Course Assigner for a semester. They keep their other roles and choose the Course Assigner hat when they sign in. When the semester ends the role switches off by itself.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12 }}>Teacher<br />
          <select value={userId} onChange={(e) => setUserId(e.target.value)} style={{ minWidth: 220 }}>
            <option value="">— choose —</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
        <label style={{ fontSize: 12 }}>For<br />
          <select value={term} onChange={(e) => setTerm(e.target.value)}>
            {currentLabel && <option value="CURRENT">This semester ({currentLabel})</option>}
            {nextLabel && <option value="NEXT">Next semester ({nextLabel})</option>}
            <option value="ALWAYS">Until I remove it</option>
          </select></label>
        <button className="btn btn-brass" disabled={busy || !userId} onClick={() => send({ userId, term })}>Give role</button>
      </div>
      {err && <p style={{ color: "#c62828", fontSize: 12.5 }}>{err}</p>}
      {holders.length > 0 && (
        <table style={{ marginTop: 14 }}>
          <thead><tr><th>Teacher</th><th>Course Assigner for</th><th></th></tr></thead>
          <tbody>{holders.map((h) => (
            <tr key={h.id}><td>{h.name}</td>
              <td>{h.term === "ALWAYS" ? "Until removed" : h.term}{!h.active && <span style={{ color: "var(--slate)", fontSize: 12 }}> (not this semester)</span>}</td>
              <td><button className="btn" disabled={busy} onClick={() => confirm(`Take the Course Assigner role back from ${h.name}?`) && send({ userId: h.id, action: "REVOKE" })}>Take back</button></td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
