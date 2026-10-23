"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Invite an outside examiner: a link that expires, for the chosen courses' final papers and results. */
export function ExaminerForm({ courses }: { courses: { id: string; label: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState({ name: "", email: "", organisation: "", designation: "", days: "14" });
  const [pick, setPick] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [link, setLink] = useState("");
  async function go() {
    setBusy(true); setMsg(null); setLink("");
    const r = await fetch("/api/moderation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "examiner", ...v, days: Number(v.days), courseIds: pick }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { setLink(`${window.location.origin}${d.link}`); setMsg({ ok: true, t: "Link made. Send it to the examiner yourself (by email); it is shown only once." }); router.refresh(); } else setMsg({ ok: false, t: d.error || "Could not save" });
  }
  const f = (k: keyof typeof v, label: string, w = 200) => <label style={{ fontSize: 12 }}>{label}<br /><input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} style={{ width: w }} /></label>;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{f("name", "Name *")}{f("email", "Email *", 220)}{f("organisation", "University / organisation", 220)}{f("designation", "Designation", 160)}{f("days", "Link valid for (days)", 90)}</div>
      <div style={{ fontSize: 12, marginTop: 8 }}>Courses (final paper and result) *</div>
      <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 6, marginTop: 4 }}>
        {courses.map((c) => <label key={c.id} style={{ display: "block", fontSize: 13 }}><input type="checkbox" checked={pick.includes(c.id)} onChange={(e) => setPick(e.target.checked ? [...pick, c.id] : pick.filter((x) => x !== c.id))} /> {c.label}</label>)}
      </div>
      <button className="btn btn-brass btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={go}>Make the examiner&apos;s link</button>
      {msg && <p style={{ fontSize: 13, color: msg.ok ? "#1E6B3A" : "#B3261E", margin: "6px 0" }}>{msg.t}</p>}
      {link && <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }} aria-label="Examiner link" />}
    </div>
  );
}

/** The external examiner's remark on a final paper or a result. */
export function ExternalRemarkForm({ token, courseId, kind }: { token: string; courseId: string; kind: "PAPER" | "RESULT" }) {
  const [decision, setDecision] = useState<"OK" | "CHANGES">("OK");
  const [clarity, setClarity] = useState<boolean | null>(null);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function go() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/moderation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remark", token, courseId, kind, decision, comments, clarity: kind === "PAPER" ? clarity : undefined }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: "Thank you — your remarks were sent to the course teacher and the Program Lead." } : { ok: false, t: d.error || "Could not send" });
  }
  return (
    <div style={{ marginTop: 8, padding: 10, background: "#F7F2F3", borderRadius: 10 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
        <label><input type="radio" checked={decision === "OK"} onChange={() => setDecision("OK")} /> Satisfactory</label>
        <label><input type="radio" checked={decision === "CHANGES"} onChange={() => setDecision("CHANGES")} /> Changes suggested</label>
        {kind === "PAPER" && <span>Questions clear? <label><input type="radio" checked={clarity === true} onChange={() => setClarity(true)} /> yes</label> <label><input type="radio" checked={clarity === false} onChange={() => setClarity(false)} /> no</label></span>}
      </div>
      <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} placeholder="Your remarks" style={{ width: "100%", marginTop: 6, fontFamily: "inherit" }} aria-label="Remarks" />
      <button className="btn btn-brass btn-sm" disabled={busy || (msg?.ok ?? false)} onClick={go}>Send remarks</button>
      {msg && <span style={{ fontSize: 13, marginLeft: 8, color: msg.ok ? "#1E6B3A" : "#B3261E" }}>{msg.t}</span>}
    </div>
  );
}
