"use client";
import { useState } from "react";

export default function ChatbotSettings({ enabled, dailyLimit, hasKey }: { enabled: boolean; dailyLimit: number; hasKey: boolean }) {
  const [on, setOn] = useState(enabled);
  const [limit, setLimit] = useState(String(dailyLimit));
  const [msg, setMsg] = useState("");
  async function save() {
    const r = await fetch("/api/chairman/ai-config/chatbot", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: on, dailyLimit: Number(limit) }) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Saved." : d.error || "Could not save.");
  }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>OBE Assistant (chat for faculty)</h3>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Faculty can ask about their course&apos;s CLOs, GA mapping, Bloom levels and assessments. It uses the AI key above (or the platform&apos;s), sends course plans only — never student names — and only suggests changes. Optional: leave it off if you don&apos;t want it.</p>
      {!hasKey && <p style={{ fontSize: 12.5, color: "#95650F" }}>No AI key is set and enabled above — the assistant stays hidden until one is.</p>}
      <label style={{ fontSize: 13, display: "block" }}><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Switch on the OBE Assistant for faculty</label>
      <label style={{ fontSize: 13, display: "block", marginTop: 6 }}>Questions per person per day <input type="number" min={1} max={200} value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: 80 }} /></label>
      <button className="btn" style={{ marginTop: 8 }} onClick={save}>Save</button> {msg && <span style={{ fontSize: 12.5 }}>{msg}</span>}
    </div>
  );
}
