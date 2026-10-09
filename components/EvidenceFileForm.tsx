"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = { padding: "6px 8px", border: "1px solid var(--line)" } as const;
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read the file"));
    r.readAsDataURL(file);
  });
}

/** Adds a file (evidence) or meeting minutes. mode "meeting" adds a kind, date, attendees and decisions. */
export default function EvidenceFileForm({ mode, leads, criteria, kinds }: { mode: "file" | "meeting"; leads: { id: string; label: string }[]; criteria?: Record<number, string>; kinds?: Record<string, string> }) {
  const router = useRouter();
  const [f, setF] = useState({ title: "", note: "", criterion: "", leadId: "", kind: "OMC", meetingDate: "", attendees: "", decisions: "" });
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  async function save() {
    setMsg(""); setBusy(true);
    try {
      if (file && file.size > 3 * 1024 * 1024) { setMsg("That file is larger than 3 MB"); setBusy(false); return; }
      const data = file ? await toBase64(file) : "";
      const body = mode === "file"
        ? { title: f.title, note: f.note, criterion: f.criterion, leadId: f.leadId, fileName: file?.name, mimeType: file?.type, data }
        : { kind: f.kind, title: f.title, meetingDate: f.meetingDate, attendees: f.attendees, decisions: f.decisions, leadId: f.leadId, fileName: file?.name, mimeType: file?.type, data };
      const res = await fetch(mode === "file" ? "/api/evidence-files" : "/api/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      setOk(res.ok); setMsg(res.ok ? "Saved." : d.error || "Something went wrong");
      if (res.ok) { setF({ ...f, title: "", note: "", attendees: "", decisions: "", meetingDate: "" }); setFile(null); router.refresh(); }
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>{mode === "file" ? "Add a file" : "Record a meeting"}</h3>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        {mode === "meeting" && <label style={{ fontSize: 12 }}>Meeting<br /><select style={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(kinds || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
        <label style={{ fontSize: 12 }}>Title<br /><input style={{ ...input, width: 250 }} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={mode === "file" ? "e.g. Advisory board approval letter" : "e.g. BOS meeting, Spring 2027"} /></label>
        {mode === "meeting" && <label style={{ fontSize: 12 }}>Date held<br /><input style={input} type="date" value={f.meetingDate} onChange={(e) => setF({ ...f, meetingDate: e.target.value })} /></label>}
        {mode === "file" && <label style={{ fontSize: 12 }}>NCEAC criterion<br /><select style={input} value={f.criterion} onChange={(e) => setF({ ...f, criterion: e.target.value })}><option value="">— general —</option>{Object.entries(criteria || {}).map(([n, t]) => <option key={n} value={n}>{n}. {t}</option>)}</select></label>}
        {leads.length > 0 && <label style={{ fontSize: 12 }}>Program<br /><select style={input} value={f.leadId} onChange={(e) => setF({ ...f, leadId: e.target.value })}><option value="">Whole institute</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>}
        <label style={{ fontSize: 12 }}>{mode === "file" ? "File (up to 3 MB)" : "Signed minutes (optional, up to 3 MB)"}<br /><input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
      </div>
      {mode === "meeting" ? (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <textarea style={{ ...input, minHeight: 50 }} placeholder="Who attended" value={f.attendees} onChange={(e) => setF({ ...f, attendees: e.target.value })} />
          <textarea style={{ ...input, minHeight: 80 }} placeholder="Decisions and action points" value={f.decisions} onChange={(e) => setF({ ...f, decisions: e.target.value })} />
        </div>
      ) : (
        <input style={{ ...input, width: "100%", marginTop: 8 }} placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      )}
      <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-brass" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <span style={{ fontSize: 12.5, color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</span>
      </div>
    </div>
  );
}
