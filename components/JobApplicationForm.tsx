"use client";
import { useState } from "react";

const DEG: [string, string][] = [["PHD", "PhD"], ["MS", "MS / MPhil (18 years)"], ["MASTERS16", "Master's or BS (16 years)"], ["BACHELORS16", "BE / BSc Engineering (16 years)"], ["OTHER", "Other"]];
const box = { display: "block", width: "100%", marginTop: 4, padding: 9, fontSize: 15, border: "1px solid #bbb", borderRadius: 8, fontFamily: "inherit", boxSizing: "border-box" } as const;
const lab = { fontSize: 14, fontWeight: 600 } as const;

// The online application form behind an advertisement's link.
export default function JobApplicationForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await fetch(`/api/jobs/${token}`, { method: "POST", body: new FormData(e.currentTarget) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    setMsg(r.ok ? { ok: true, t: "Thank you — your application has been received. Shortlisted candidates will be contacted by email." } : { ok: false, t: d.error || "Could not send." });
  }
  if (msg?.ok) return <p style={{ fontSize: 16, fontWeight: 700, color: "#1E6B3A" }}>{msg.t}</p>;
  const grid = (min: number) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }) as const;
  return (
    <form onSubmit={send} style={{ display: "grid", gap: 12 }}>
      <label style={lab}>Full name *<input name="name" required style={box} /></label>
      <div style={grid(200)}>
        <label style={lab}>Email *<input name="email" type="email" required style={box} /></label>
        <label style={lab}>Phone<input name="phone" style={box} /></label>
      </div>
      <div style={grid(200)}>
        <label style={lab}>Highest qualification *<select name="highestDegree" required style={box}>{DEG.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label style={lab}>Degree title (e.g. PhD Computer Science)<input name="degreeTitle" style={box} /></label>
        <label style={lab}>University<input name="university" style={box} /></label>
        <label style={lab}>Year<input name="degreeYear" type="number" style={box} /></label>
      </div>
      <div style={grid(160)}>
        <label style={lab}>Years of teaching / research<input name="teachingYears" type="number" step="0.5" defaultValue={0} style={box} /></label>
        <label style={lab}>Of which after the PhD<input name="postPhdYears" type="number" step="0.5" defaultValue={0} style={box} /></label>
        <label style={lab}>Years in industry<input name="industryYears" type="number" step="0.5" defaultValue={0} style={box} /></label>
      </div>
      <label style={lab}>Experience — one per line: Organisation | Job title | From year | To year<textarea name="experience" rows={4} style={box} placeholder="University of Lahore | Lecturer | 2018 | 2022" /></label>
      <label style={lab}>Publications — one per line: Title | Journal | Year | HEC category (W, X, Y or Other) | DOI<textarea name="publications" rows={5} style={box} placeholder="Deep learning for Urdu OCR | IEEE Access | 2024 | W | 10.1109/ACCESS.2024.123456" /></label>
      <label style={lab}>CV (PDF or Word, up to 3 MB) *<input name="cv" type="file" accept=".pdf,.doc,.docx" required style={{ ...box, padding: 6 }} /></label>
      {msg && <p style={{ color: "#B3261E", margin: 0 }}>{msg.t}</p>}
      <button type="submit" disabled={busy} style={{ padding: "12px 16px", fontSize: 16, fontWeight: 700, background: "#7A1F2B", color: "#fff", border: 0, borderRadius: 8 }}>{busy ? "Sending…" : "Submit application"}</button>
    </form>
  );
}
