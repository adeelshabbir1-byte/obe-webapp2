"use client";
import { useState } from "react";

type Role = { key: string; label: string; daily: string };

/** One-click sign-in as a demo person (then straight to `next`, or their home). */
export function DemoLoginButton({ role, next, children, primary }: { role: string; next?: string; children: React.ReactNode; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/demo-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, next }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || `HTTP ${r.status}`); setBusy(false); return; }
    window.location.href = j.href || "/dashboard";
  }
  return (
    <span>
      <button type="button" className={primary ? "btn" : "btn btn-brass"} disabled={busy} onClick={go} data-demo-login={role}>{busy ? "Signing in…" : children}</button>
      {err && <span className="err" style={{ marginLeft: 8, fontSize: 12 }}>{err}</span>}
    </span>
  );
}

export default function DemoLogins({ roles }: { roles: Role[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
      {roles.map((r) => (
        <div key={r.key} className="card" style={{ margin: 0, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <b>{r.label}</b>
          <span style={{ fontSize: 12, color: "var(--slate)", flex: 1 }}>{r.daily}</span>
          <DemoLoginButton role={r.key}>Sign in as {r.label}</DemoLoginButton>
        </div>
      ))}
    </div>
  );
}
