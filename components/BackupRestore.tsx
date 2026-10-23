"use client";
import { useState } from "react";

type Rep = { model: string; label: string; inBackup: number; present: number; missing: number; restored: number; failed: number }[];

export default function BackupRestore({ stored }: { stored: { name: string; size: number; created: string }[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string>(stored[0]?.name || "");
  const [rep, setRep] = useState<{ report: Rep; from: string; message: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(action: string) {
    setBusy(true); setMsg("");
    try {
      let r: Response;
      if (file) { const fd = new FormData(); fd.set("action", action); fd.set("file", file); r = await fetch("/api/backups", { method: "POST", body: fd }); }
      else r = await fetch("/api/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, name: src }) });
      const d = await r.json();
      if (!r.ok) setMsg(d.error || "Failed."); else if (d.report) setRep(d); else setMsg(d.message);
    } finally { setBusy(false); }
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {stored.length > 0 && <select value={src} onChange={(e) => { setSrc(e.target.value); setFile(null); setRep(null); }} disabled={!!file}>{stored.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select>}
        <span className="small-note">or a downloaded file:</span>
        <input type="file" accept=".gz,.json" onChange={(e) => { setFile(e.target.files?.[0] || null); setRep(null); }} />
        <button className="btn btn-sm" disabled={busy || (!file && !src)} onClick={() => go("check")}>Check (dry run)</button>
        {rep && rep.report.some((r) => r.missing > 0) && <button className="btn btn-brass btn-sm" disabled={busy} onClick={() => { if (confirm("Put back every missing row? Existing data is not changed.")) go("restore"); }}>Restore missing rows</button>}
      </div>
      {busy && <p className="small-note">Working…</p>}
      {msg && <p style={{ fontWeight: 600 }}>{msg}</p>}
      {rep && (
        <div style={{ marginTop: 10 }}>
          <p><b>{rep.message}</b> <span className="small-note">Backup of {new Date(rep.from).toLocaleString("en-GB")}</span></p>
          <table style={{ fontSize: 12.5 }}><thead><tr><th>Table</th><th>In backup</th><th>Still present</th><th>Missing now</th><th>Restored</th><th>Could not restore</th></tr></thead>
            <tbody>{rep.report.map((r) => <tr key={r.model}><td>{r.label}</td><td>{r.inBackup}</td><td>{r.present}</td><td style={{ color: r.missing ? "#C62828" : undefined, fontWeight: r.missing ? 700 : 400 }}>{r.missing}</td><td>{r.restored || ""}</td><td>{r.failed || ""}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}
