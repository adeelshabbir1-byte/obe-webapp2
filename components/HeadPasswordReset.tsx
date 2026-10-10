"use client";

import { useState } from "react";

// Super User: set a new password for an Institute Head who has forgotten theirs.
export default function HeadPasswordReset({ heads }: { heads: { id: string; label: string }[] }) {
  const [id, setId] = useState(heads[0]?.id || "");
  const [pw, setPw] = useState("");
  const [mustChange, setMustChange] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword: pw, mustChange }) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? { ok: true, text: `Password changed. Give it to ${heads.find((h) => h.id === id)?.label || "them"}; they are signed out everywhere${mustChange ? " and must choose their own password at next sign-in" : ""}.` } : { ok: false, text: d.error || "Something went wrong." });
    if (res.ok) setPw("");
    setBusy(false);
  }
  if (heads.length === 0) return null;
  return (
    <form className="card" onSubmit={save}>
      <h3 style={{ marginTop: 0 }}>Reset an Institute Head&apos;s password</h3>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={id} onChange={(e) => setId(e.target.value)} style={{ padding: "6px 8px", minWidth: 260 }}>
          {heads.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select>
        <input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (8+ characters)" minLength={8} required autoComplete="new-password" style={{ padding: "6px 8px", minWidth: 230 }} />
        <button className="btn btn-brass" disabled={busy || pw.length < 8}>{busy ? "Saving…" : "Set new password"}</button>
      </div>
      <label style={{ display: "block", fontSize: 12.5, marginTop: 8 }}><input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} /> Make them choose their own password at next sign-in</label>
      {msg && <div style={{ marginTop: 8, fontSize: 13, color: msg.ok ? "var(--sage)" : "#b3261e" }}>{msg.text}</div>}
    </form>
  );
}
