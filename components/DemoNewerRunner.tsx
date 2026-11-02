"use client";

import { useState } from "react";

type R = { href: string; status: number; ms: number; problem: string | null; detail?: string };
const post = (b: unknown) => fetch("/api/admin/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Request failed." }));

// Super Admin: add the newest features' demo data on its own, and check every page of every demo role.
export default function DemoNewerRunner({ parts, roles }: { parts: [string, string][]; roles: { key: string; label: string }[] }) {
  const [log, setLog] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Record<string, R[]>>({}); const [cur, setCur] = useState("");
  const add = (x: string) => setLog((l) => [...l, x]);
  async function runParts() {
    setBusy(true); setLog([]);
    for (const [p, label] of parts) { add(`${label}…`); const r = await post({ step: "newer", part: p }); add(r.error ? `  ✗ ${r.error}` : `  ✓ ${r.info || "done"}`); if (r.error) break; }
    setBusy(false);
  }
  async function check(only?: string) {
    setBusy(true);
    for (const role of roles.filter((r) => !only || r.key === only)) {
      setCur(role.label); let offset: number | null = 0; const all: R[] = [];
      while (offset != null) { const r = await post({ step: "pageCheck", role: role.key, offset }); if (r.error) { all.push({ href: "(sign-in)", status: 0, ms: 0, problem: r.error }); break; } all.push(...(r.results as R[])); offset = r.next; setRes((x) => ({ ...x, [role.key]: [...all] })); }
    }
    setCur(""); setBusy(false);
  }
  const bad = Object.entries(res).flatMap(([k, rs]) => rs.filter((r) => r.problem).map((r) => ({ role: roles.find((x) => x.key === k)?.label || k, ...r })));
  const slow = Object.entries(res).flatMap(([k, rs]) => rs.filter((r) => !r.problem && r.ms > 4000).map((r) => ({ role: roles.find((x) => x.key === k)?.label || k, ...r })));
  const total = Object.values(res).reduce((a, r) => a + r.length, 0);
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Newest features and a full page check</h3>
      <p className="small-note">Adds the demo data for affiliation, joint degrees / ODL, committees, the year allocation plan and the exam team (safe to run again). Then signs in as each demo person and opens every page of their menu, reporting crashes, missing migrations, sign-in bounces and slow pages.</p>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={runParts}>Add newest demo data</button>{" "}
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => check()}>Check every page (all roles)</button>{" "}
      <select disabled={busy} onChange={(e) => e.target.value && check(e.target.value)} defaultValue=""><option value="">…or one role</option>{roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
      {busy && cur && <p className="small-note">Checking {cur}…</p>}
      {log.length > 0 && <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", background: "rgba(127,127,127,.08)", padding: 8, borderRadius: 6 }}>{log.join("\n")}</pre>}
      {total > 0 && <div style={{ marginTop: 10 }}>
        <p style={{ fontSize: 13 }}><b>{total}</b> page openings · <b style={{ color: bad.length ? "#B3261E" : "#1E6B3A" }}>{bad.length} with problems</b> · {slow.length} slow (over 4 s)</p>
        {bad.length > 0 && <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Role</th><th>Page</th><th>Problem</th><th>Detail</th></tr></thead><tbody>{bad.map((b, i) => <tr key={i}><td>{b.role}</td><td><a href={b.href} target="_blank">{b.href}</a></td><td style={{ color: "#B3261E" }}>{b.problem}</td><td className="small-note">{b.detail || b.status}</td></tr>)}</tbody></table>}
        {slow.length > 0 && <details><summary className="small-note">Slow pages</summary><ul style={{ fontSize: 12.5 }}>{slow.map((s, i) => <li key={i}>{s.role}: {s.href} — {(s.ms / 1000).toFixed(1)} s</li>)}</ul></details>}
        <button type="button" className="btn-link" onClick={() => navigator.clipboard?.writeText(JSON.stringify({ bad, slow: slow.map((s) => ({ role: s.role, href: s.href, ms: s.ms })) }, null, 1))}>Copy the report (to send to Claude)</button>
      </div>}
    </div>
  );
}
