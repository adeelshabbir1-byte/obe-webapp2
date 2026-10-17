"use client";
import { useState } from "react";

export default function PublicInquiryForm({ institute, programs }: { institute: string; programs: string[] }) {
  const [f, setF] = useState<Record<string, string>>({ program: programs[0] || "" });
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/admissions/public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, institute }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setDone(true); else setMsg(d.error || "Could not send.");
  }
  if (done) return <p style={{ color: "#1F5E36" }}>Thank you — we will contact you soon.</p>;
  const inp = (k: string, label: string, type = "text") => <label style={{ display: "block", fontSize: 13, marginBottom: 8 }}>{label}<input type={type} value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} style={{ width: "100%" }} /></label>;
  return (
    <form onSubmit={send}>
      {inp("name", "Full name")}{inp("phone", "Phone / WhatsApp", "tel")}{inp("email", "Email", "email")}{inp("city", "City")}
      <label style={{ display: "block", fontSize: 13, marginBottom: 8 }}>Program<select value={f.program} onChange={(e) => setF({ ...f, program: e.target.value })} style={{ width: "100%" }}>{programs.map((p) => <option key={p}>{p}</option>)}</select></label>
      <label style={{ display: "block", fontSize: 13, marginBottom: 8 }}>Message<textarea value={f.message || ""} onChange={(e) => setF({ ...f, message: e.target.value })} rows={3} style={{ width: "100%" }} /></label>
      <input name="website" value={f.website || ""} onChange={(e) => setF({ ...f, website: e.target.value })} style={{ display: "none" }} tabIndex={-1} autoComplete="off" />
      {msg && <div className="err">{msg}</div>}
      <button className="btn">Send inquiry</button>
    </form>
  );
}
