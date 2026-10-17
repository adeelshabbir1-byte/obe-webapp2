"use client";
import { useState } from "react";

type Cv = { headline: string; summary: string; phone: string; email: string; city: string; linkedin: string; github: string; portfolio: string; skills: string[]; languages: string[]; projects: { title: string; text: string; link: string }[]; experience: { role: string; org: string; from: string; to: string; text: string }[]; certifications: { name: string; by: string; year: string }[]; achievements: string[] };

// The student builds their CV; the app adds program, CGPA (if allowed) and the FYP automatically.
export default function CvEditor({ studentId, initial, showCgpa: sc0, status: st0, published: pub0, note }: { studentId: string; initial: Cv; showCgpa: boolean; status: string; published: boolean; note: string | null }) {
  const [cv, setCv] = useState<Cv>(initial);
  const [showCgpa, setShowCgpa] = useState(sc0);
  const [status, setStatus] = useState(st0);
  const [published, setPublished] = useState(pub0);
  const [msg, setMsg] = useState("");
  const set = (k: keyof Cv, v: unknown) => setCv({ ...cv, [k]: v });
  async function save(extra: Record<string, unknown> = {}) {
    const r = await fetch("/api/student/cv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: cv, showCgpa, published, ...extra }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(d.error || "Could not save."); return; }
    setStatus(d.status); setPublished(d.published); setMsg(extra.submit ? "Sent for review." : "Saved.");
  }
  const field = (k: keyof Cv, label: string, w = 260) => <label style={{ fontSize: 12.5, display: "inline-block", marginRight: 10 }}>{label}<br /><input value={cv[k] as string} onChange={(e) => set(k, e.target.value)} style={{ width: w }} /></label>;
  const listField = (k: "skills" | "languages" | "achievements", label: string) => <label style={{ fontSize: 12.5, display: "block", marginTop: 8 }}>{label} <span className="small-note">(one per line)</span><textarea rows={3} value={cv[k].join("\n")} onChange={(e) => set(k, e.target.value.split("\n"))} style={{ width: "100%" }} /></label>;
  const rows = <T extends Record<string, string>>(k: "projects" | "experience" | "certifications", label: string, cols: [keyof T, string, number][], blank: T) => (
    <div style={{ marginTop: 10 }}>
      <b style={{ fontSize: 13 }}>{label}</b>
      {(cv[k] as unknown as T[]).map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0" }}>
          {cols.map(([c, ph, w]) => <input key={String(c)} placeholder={ph} value={row[c]} onChange={(e) => set(k, (cv[k] as unknown as T[]).map((x, j) => (j === i ? { ...x, [c]: e.target.value } : x)))} style={{ width: w }} />)}
          <button className="act act-danger" onClick={() => set(k, (cv[k] as unknown as T[]).filter((_, j) => j !== i))}>✕</button>
        </div>))}
      <button className="act" onClick={() => set(k, [...(cv[k] as unknown as T[]), blank])}>+ Add</button>
    </div>
  );
  const badge: Record<string, [string, string]> = { DRAFT: ["Draft", "#6B7177"], SUBMITTED: ["Waiting for review", "#1B6CA8"], APPROVED: ["Approved", "#2E7D4F"], CHANGES: ["Changes requested", "#B3261E"] };
  return (
    <div>
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ background: badge[status]?.[1], color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 12 }}>{badge[status]?.[0] || status}</span>
        {note && <span style={{ fontSize: 12.5, color: "#B3261E" }}>Reviewer: {note}</span>}
        <a href={`/cv/${studentId}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">Preview / print PDF</a>
        <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={showCgpa} onChange={(e) => setShowCgpa(e.target.checked)} /> Show my CGPA</label>
        {status === "APPROVED" && <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Share with industry (open house, CV book)</label>}
        <button className="btn btn-sm" onClick={() => save()}>Save</button>
        {status !== "SUBMITTED" && <button className="btn btn-brass btn-sm" onClick={() => save({ submit: true })}>Send for review</button>}
        {msg && <span style={{ fontSize: 12.5 }}>{msg}</span>}
      </div>
      <div className="card">
        {field("headline", "Headline (e.g. Software Engineering student, AI enthusiast)", 420)}{field("city", "City", 160)}<br />
        {field("email", "Email")}{field("phone", "Phone", 160)}<br />
        {field("linkedin", "LinkedIn")}{field("github", "GitHub")}{field("portfolio", "Portfolio / website")}
        <label style={{ fontSize: 12.5, display: "block", marginTop: 8 }}>About me<textarea rows={3} value={cv.summary} onChange={(e) => set("summary", e.target.value)} style={{ width: "100%" }} /></label>
        {listField("skills", "Skills")}
        {rows<{ title: string; text: string; link: string }>("projects", "Projects (your FYP is added automatically)", [["title", "Title", 220], ["text", "What you did", 360], ["link", "Link", 200]], { title: "", text: "", link: "" })}
        {rows<{ role: string; org: string; from: string; to: string; text: string }>("experience", "Internships / experience", [["role", "Role", 160], ["org", "Organisation", 180], ["from", "From", 80], ["to", "To", 80], ["text", "What you did", 300]], { role: "", org: "", from: "", to: "", text: "" })}
        {rows<{ name: string; by: string; year: string }>("certifications", "Certifications", [["name", "Certificate", 240], ["by", "Issued by", 180], ["year", "Year", 70]], { name: "", by: "", year: "" })}
        {listField("achievements", "Achievements / awards")}
        {listField("languages", "Languages")}
      </div>
    </div>
  );
}
