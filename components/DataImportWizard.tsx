"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type F = { key: string; label: string; required?: boolean };
type K = { key: string; title: string; what: string; needs: string[]; fields: F[] };
type Parsed = { sheets: string[]; sheet: number; headerRow: number; headers: string[]; map: Record<string, number>; sample: string[][]; rows: number };
type Dry = { rows: number; ready: number; updates?: number; skipped: { row: number; message: string }[]; skippedCount: number; errors: { row: number; message: string }[]; errorCount: number };

export default function DataImportWizard({ kinds, batches, leads }: { kinds: K[]; batches: [string, string][]; leads: [string, string][] }) {
  const router = useRouter();
  const [kind, setKind] = useState(kinds[0].key);
  const [file, setFile] = useState<File | null>(null);
  const [batchId, setBatchId] = useState(batches[0]?.[0] || "");
  const [leadId, setLeadId] = useState(leads[0]?.[0] || "");
  const [p, setP] = useState<Parsed | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [dry, setDry] = useState<Dry | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const k = kinds.find((x) => x.key === kind)!;

  async function send(action: string, extra: Record<string, string> = {}) {
    if (!file) return null;
    const fd = new FormData();
    fd.set("action", action); fd.set("kind", kind); fd.set("file", file); fd.set("batchId", batchId); fd.set("leadId", leadId); fd.set("map", JSON.stringify(map));
    if (p) { fd.set("sheet", String(p.sheet)); fd.set("headerRow", String(p.headerRow)); }
    for (const [a, b] of Object.entries(extra)) fd.set(a, b);
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/data-import", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) { setMsg({ ok: false, text: d.error || "Failed." }); return null; }
      return d;
    } finally { setBusy(false); }
  }
  async function parse(extra: Record<string, string> = {}) {
    const d = await send("parse", extra);
    if (d) { setP(d); setMap(d.map); setDry(null); }
  }
  const reset = () => { setP(null); setDry(null); setMsg(null); };

  return (
    <div className="card">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <label>What are you importing?<br /><select value={kind} onChange={(e) => { setKind(e.target.value); reset(); }}>{kinds.map((x) => <option key={x.key} value={x.key}>{x.title}</option>)}</select></label>
        {k.needs.includes("batch") && <label>Into batch<br /><select value={batchId} onChange={(e) => { setBatchId(e.target.value); setDry(null); }}>{batches.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
        {k.needs.includes("lead") && leads.length > 0 && <label>Under Program Lead<br /><select value={leadId} onChange={(e) => { setLeadId(e.target.value); setDry(null); }}>{leads.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
        <a className="btn btn-secondary btn-sm" href={`/api/data-import?template=${kind}`}>Download template</a>
      </div>
      <p className="small-note">{k.what}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input type="file" accept=".xlsx,.csv" onChange={(e) => { setFile(e.target.files?.[0] || null); reset(); }} />
        <button className="btn btn-sm" disabled={!file || busy} onClick={() => parse()}>1. Read file</button>
      </div>
      {p && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {p.sheets.length > 1 && <label>Sheet <select value={p.sheet} onChange={(e) => parse({ sheet: e.target.value, headerRow: "" })}>{p.sheets.map((s, i) => <option key={i} value={i}>{s}</option>)}</select></label>}
            <label>Headings are on row <input type="number" min={1} style={{ width: 60 }} value={p.headerRow} onChange={(e) => parse({ headerRow: e.target.value })} /></label>
            <span className="small-note">{p.rows} row(s) below the headings</span>
          </div>
          <h4 style={{ marginBottom: 4 }}>2. Match the columns</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
            {k.fields.map((f) => (
              <label key={f.key} style={{ fontSize: 13 }}>{f.label}{f.required ? <b style={{ color: "#C62828" }}> *</b> : ""}<br />
                <select value={map[f.key] ?? -1} onChange={(e) => { setMap({ ...map, [f.key]: Number(e.target.value) }); setDry(null); }} style={{ width: "100%", borderColor: f.required && !(map[f.key] >= 0) ? "#C62828" : undefined }}>
                  <option value={-1}>— not in my file —</option>{p.headers.map((h, i) => <option key={i} value={i}>{h || `(column ${i + 1})`}</option>)}
                </select></label>
            ))}
          </div>
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={{ fontSize: 11.5 }}><thead><tr>{k.fields.map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
              <tbody>{p.sample.map((r, i) => <tr key={i}>{k.fields.map((f) => <td key={f.key}>{map[f.key] >= 0 ? r[map[f.key]] : <span className="small-note">—</span>}</td>)}</tr>)}</tbody></table>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-sm" disabled={busy} onClick={async () => { const d = await send("dryrun"); if (d) setDry(d); }}>3. Check (dry run)</button>
            {dry && dry.ready > 0 && <button className="btn btn-brass btn-sm" disabled={busy} onClick={async () => { if (!confirm(`Import ${dry.ready} row(s)?`)) return; const d = await send("commit"); if (d) { setMsg({ ok: true, text: d.message }); setDry(null); router.refresh(); } }}>4. Import {dry.ready} row(s)</button>}
          </div>
        </div>
      )}
      {busy && <p className="small-note">Working…</p>}
      {msg && <p style={{ color: msg.ok ? "#2E7D32" : "#C62828", fontWeight: 600 }}>{msg.text}</p>}
      {dry && (
        <div style={{ marginTop: 10 }}>
          <p><b style={{ color: "#2E7D32" }}>{dry.ready} ready</b>{dry.updates ? <> (<b>{dry.updates}</b> already have an account and will be updated)</> : null} · <b style={{ color: "#B26A00" }}>{dry.skippedCount} already there (skipped)</b> · <b style={{ color: "#C62828" }}>{dry.errorCount} with problems</b> — of {dry.rows} row(s). Nothing is saved until you press Import.</p>
          {dry.errors.length > 0 && <table style={{ fontSize: 12 }}><thead><tr><th>Row</th><th>Problem</th></tr></thead><tbody>{dry.errors.map((e, i) => <tr key={i}><td>{e.row}</td><td style={{ color: "#C62828" }}>{e.message}</td></tr>)}</tbody></table>}
          {dry.skipped.length > 0 && <details><summary className="small-note">Skipped rows</summary><ul className="small-note">{dry.skipped.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul></details>}
        </div>
      )}
    </div>
  );
}
