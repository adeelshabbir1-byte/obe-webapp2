"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import TemplateLink from "./TemplateLink";

type Summary = { labs: { labNumber: number; maxScore: number; filled: number; changed: number }[]; unknown: string[]; unknownCount: number; errors: string[]; errorCount: number; changes: number };

/** Lab Engineer: download the class sheet, fill it offline, upload it, check the preview, save. */
export default function LabMarksUpload({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function send(f: File, commit: boolean) {
    setBusy(true); setMsg(null);
    const fd = new FormData(); fd.set("courseId", courseId); fd.set("file", f); if (commit) fd.set("commit", "1");
    const r = await fetch("/api/lab/marks/upload", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (d.labs) setSum(d as Summary);
    if (!r.ok) { setMsg({ ok: false, text: d.error || "Upload failed." }); return; }
    if (commit) { setMsg({ ok: true, text: `Saved ${d.saved} mark(s).` }); setSum(null); setFile(null); router.refresh(); }
  }
  return (
    <div style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: 10, marginBottom: 12 }}>
      <b style={{ fontSize: 13 }}>Upload marks from Excel</b>
      <div style={{ fontSize: 12, color: "var(--slate)", margin: "2px 0 8px" }}>Download the sheet (your class, one column per lab, with marks already saved), fill it in, then upload it. You see what will change before anything is saved. Empty cells leave saved marks as they are.</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <TemplateLink href={`/api/lab/marks/sheet?courseId=${courseId}`} label="Download format (class sheet)" />
        <input type="file" accept=".xlsx,.csv" onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); setSum(null); setMsg(null); if (f) send(f, false); }} />
        {busy && <span style={{ fontSize: 12 }}>Reading…</span>}
      </div>
      {sum && (
        <div style={{ marginTop: 10, fontSize: 12.5 }}>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Lab</th><th>Out of</th><th>Marks in file</th><th>New or changed</th></tr></thead>
            <tbody>{sum.labs.map((l) => <tr key={l.labNumber}><td>Lab {l.labNumber}</td><td>{l.maxScore}</td><td>{l.filled}</td><td>{l.changed}</td></tr>)}</tbody>
          </table>
          {sum.unknownCount > 0 && <div style={{ color: "#8a5a00", marginTop: 6 }}>{sum.unknownCount} roll number(s) are not in this lab and will be skipped: {sum.unknown.join(", ")}</div>}
          {sum.errorCount > 0 && <ul style={{ color: "#B3261E", margin: "6px 0 0", paddingLeft: 18 }}>{sum.errors.map((e, i) => <li key={i}>{e}</li>)}{sum.errorCount > sum.errors.length && <li>…and {sum.errorCount - sum.errors.length} more</li>}</ul>}
          <button className="btn btn-brass" style={{ marginTop: 8 }} disabled={busy || !file || sum.errorCount > 0 || sum.changes === 0} onClick={() => file && send(file, true)}>{sum.changes === 0 ? "Nothing to change" : `Save ${sum.changes} mark(s)`}</button>
        </div>
      )}
      {msg && <div style={{ marginTop: 6, fontSize: 12.5, color: msg.ok ? "#2E7D4F" : "#B3261E" }}>{msg.text}</div>}
    </div>
  );
}
