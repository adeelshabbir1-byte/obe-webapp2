"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "Import lecture plan from Excel" on the SE's Lecture Content tab: choose a file → preview (what will be filled, what is
// wrong) → Import. Existing lectures are updated by number and keep their links; nothing else is removed.
type Preview = { sheet: string; summary: { lectures: number; mapped: number; updated: number; added: number; untouched: number }; problems: string[]; rows: { lectureNumber: number; week: number; topic: string; subtopic: string | null; clo: string | null }[] };

export default function LectureExcelImport({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function send(f: File, apply: boolean) {
    setBusy(true); setMsg(null);
    const fd = new FormData(); fd.append("file", f); fd.append("apply", apply ? "1" : "0");
    try {
      const r = await fetch(`/api/subjectexpert/courses/${courseId}/lecture/import-excel`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ ok: false, text: d.error || "Import failed." }); setPreview(null); }
      else if (d.preview) setPreview(d);
      else { setMsg({ ok: true, text: `Imported ${d.summary.lectures} lectures (${d.summary.updated} updated, ${d.summary.added} added, ${d.summary.mapped} mapped to a CLO).${d.problems?.length ? " Notes: " + d.problems.join("; ") : ""}` }); setPreview(null); setFile(null); router.refresh(); }
    } catch { setMsg({ ok: false, text: "Import failed." }); }
    setBusy(false);
  }
  return (
    <div className="card no-print">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>Import lecture plan from Excel</b>
        <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
          {busy && !preview ? "Reading…" : "Choose file"}
          <input type="file" accept=".xlsx" style={{ display: "none" }} disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setFile(f); send(f, false); } }} />
        </label>
        <span className="small-note" style={{ margin: 0 }}>Columns: Lecture, Topic, and optionally Week, Sub topic, CLO. Existing lectures keep their links; nothing is deleted.</span>
      </div>
      {msg && <p className={msg.ok ? "small-note" : "err"} style={{ color: msg.ok ? "#1E6B34" : undefined, marginBottom: 0 }}>{msg.text}</p>}
      {preview && file && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 13, margin: "4px 0" }}>Sheet <b>{preview.sheet}</b>: <b>{preview.summary.lectures}</b> lectures · {preview.summary.updated} will be updated · {preview.summary.added} added · {preview.summary.mapped} mapped to a CLO{preview.summary.untouched ? ` · ${preview.summary.untouched} existing lecture(s) not in the file stay as they are` : ""}</p>
          {preview.problems.length > 0 && <ul style={{ fontSize: 12, color: "#B3261E", margin: "4px 0" }}>{preview.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid var(--line)" }}>
            <table style={{ fontSize: 12, width: "100%" }}><thead><tr><th>Wk</th><th>Lec</th><th>Topic</th><th>Sub topic</th><th>CLO</th></tr></thead>
              <tbody>{preview.rows.map((r) => <tr key={r.lectureNumber}><td>{r.week}</td><td>L{r.lectureNumber}</td><td>{r.topic}</td><td>{r.subtopic || ""}</td><td>{r.clo || "—"}</td></tr>)}</tbody></table>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn" disabled={busy} onClick={() => send(file, true)}>{busy ? "Importing…" : `Import ${preview.summary.lectures} lectures`}</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setPreview(null); setFile(null); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
