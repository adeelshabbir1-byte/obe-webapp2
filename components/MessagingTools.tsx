"use client";
import { useState } from "react";

/** Test send, broadcast and student-number import (results shown inline). */
export default function MessagingTools({ audiences }: { audiences: [string, string][] }) {
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [f, setF] = useState<Record<string, string | boolean>>({ channel: "WHATSAPP", audience: audiences[0]?.[0] || "" });
  const post = async (key: string, body: Record<string, unknown>) => {
    setMsg({ ...msg, [key]: "Working…" });
    const r = await fetch("/api/messaging", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({})); setMsg((m) => ({ ...m, [key]: r.ok ? d.note || "Done." : d.error || "Failed." }));
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card"><h3 style={{ marginTop: 0 }}>Send a test</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><input placeholder="03001234567" value={String(f.to || "")} onChange={set("to")} style={{ width: 160 }} />
          <select value={String(f.channel)} onChange={set("channel")}><option value="WHATSAPP">WhatsApp (falls back to SMS)</option><option value="SMS">SMS only</option></select>
          <button type="button" className="btn btn-sm" onClick={() => post("test", { action: "test", to: f.to, channel: f.channel })}>Send test</button> <span style={{ fontSize: 13 }}>{msg.test}</span></div></div>
      <div className="card"><h3 style={{ marginTop: 0 }}>Broadcast</h3>
        <div style={{ display: "grid", gap: 6 }}>
          <select value={String(f.audience)} onChange={set("audience")}>{audiences.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {String(f.audience).startsWith("batch:") && <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!f.guardians} onChange={set("guardians")} /> Also send to parents / guardians</label>}
          <input placeholder="Title, e.g. Classes suspended tomorrow" value={String(f.title || "")} onChange={set("title")} maxLength={120} />
          <textarea placeholder="Message (keep it short; WhatsApp and SMS)" value={String(f.text || "")} onChange={set("text")} rows={3} maxLength={450} />
          <div><button type="button" className="btn btn-sm" onClick={() => post("bc", { action: "broadcast", audience: f.audience, guardians: f.guardians, title: f.title, text: f.text })}>Send</button> <span style={{ fontSize: 13 }}>{msg.bc}</span></div>
        </div></div>
      <div className="card"><h3 style={{ marginTop: 0 }}>Import student and guardian numbers</h3>
        <p className="small-note">CSV with columns: Roll number, Student mobile, Guardian mobile. Students can also enter their own under Alerts &amp; Contact in the student portal.</p>
        <input type="file" accept=".csv,text/csv" onChange={async (e) => { const file = e.target.files?.[0]; if (file) post("imp", { action: "importContacts", csv: await file.text() }); }} /> <span style={{ fontSize: 13 }}>{msg.imp}</span></div>
    </div>
  );
}
