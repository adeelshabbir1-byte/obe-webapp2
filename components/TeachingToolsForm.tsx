"use client";

import { useState } from "react";

type Check = { name: string; ok: boolean; note: string };
type F = { key: string; label: string; secret?: boolean; placeholder?: string; long?: boolean; help?: string };

/** One teaching tool: its settings (secrets write-only), Save and test, Test again, Disconnect. */
export default function TeachingToolsForm({ tool, label, fields, plain, secretSet, canAct, checks: initial, status }: { tool: string; label: string; fields: F[]; plain: Record<string, string>; secretSet: string[]; canAct: boolean; checks: Check[]; status: string }) {
  const [form, setForm] = useState<Record<string, string>>(Object.fromEntries(fields.map((f) => [f.key, f.secret ? "" : plain[f.key] || ""])));
  const [checks, setChecks] = useState<Check[]>(initial); const [st, setSt] = useState(status);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const call = async (action: string) => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/teaching-tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, tool, form }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach OBEHUB." }));
    setBusy(false);
    if (r.error) { setMsg(r.error); return; }
    if (action === "remove") { location.reload(); return; }
    setChecks(r.checks || []); setSt(r.ok ? "OK" : "FAILING"); setMsg(r.ok ? "Connected ✓" : "Saved — fix what is marked ✗ and test again.");
    setForm((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, fields.find((x) => x.key === k)?.secret ? "" : v])));
  };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
        {fields.map((f) => <label key={f.key} style={{ fontSize: 12.5, gridColumn: f.long ? "1 / -1" : undefined }}>{f.label}{f.secret && secretSet.includes(f.key) ? " (saved — leave empty to keep)" : ""}
          {f.long ? <textarea rows={3} value={form[f.key]} disabled={!canAct} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.secret ? "paste here — it is encrypted and never shown again" : f.placeholder} style={{ width: "100%", fontFamily: "monospace", fontSize: 11.5 }} />
            : <input type={f.secret ? "password" : "text"} autoComplete="off" value={form[f.key]} disabled={!canAct} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} style={{ width: "100%" }} />}
          {f.help && <span className="small-note" style={{ display: "block" }}>{f.help}</span>}</label>)}
      </div>
      {canAct && <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => call("save")}>{busy ? "Checking…" : "Save and test"}</button>
        {st !== "NEW" && <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={() => call("test")}>Test again</button>}
        {st !== "NEW" && <button type="button" className="btn-link" disabled={busy} onClick={() => { if (confirm(`Disconnect ${label}? Course links stay, but nothing syncs until it is connected again.`)) call("remove"); }}>Disconnect</button>}
        <span className="small-note" role="status">{msg}</span>
      </div>}
      {checks.length > 0 && <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", fontSize: 12.5 }}>{checks.map((c) => <li key={c.name}><b style={{ color: c.ok ? "#1E6B3A" : "#B3261E" }}>{c.ok ? "✓" : "✗"}</b> {c.name} — <span className="small-note">{c.note}</span></li>)}</ul>}
    </div>
  );
}
