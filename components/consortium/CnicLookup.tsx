"use client";
import { useState } from "react";

type Acc = { userId: string; kind: string; status: string; institute: string; employer: string | null; expiresAt: string | null; user: { name: string; email: string; role: string; isActive: boolean } | null };
/** Super Admin: every account one person holds across institutes, by CNIC. */
export default function CnicLookup() {
  const [cnic, setCnic] = useState(""); const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ msg: string; p?: { name: string; cnic: string; accounts: Acc[] } | null } | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const r = await fetch("/api/consortium", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "lookup", cnic }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    setRes({ msg: d.message || d.error || "", p: d.person });
  }
  return (
    <div>
      <form onSubmit={go} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="12345-1234567-1" aria-label="CNIC" style={{ width: 190 }} />
        <button className="btn btn-sm" disabled={busy}>{busy ? "Looking…" : "Look up"}</button>
        {res && <span className="small-note">{res.msg}</span>}
      </form>
      {res?.p && <table style={{ fontSize: 13, marginTop: 8 }}><thead><tr><th>Institute</th><th>Account</th><th>Vouched as</th><th>Status</th></tr></thead>
        <tbody>{res.p.accounts.map((a) => <tr key={a.userId}><td>{a.institute}</td><td>{a.user ? `${a.user.name} · ${a.user.email} · ${a.user.role.toLowerCase().replace(/_/g, " ")}${a.user.isActive ? "" : " (off)"}` : "—"}</td>
          <td>{a.kind === "SPONSORED" ? `Sponsored${a.employer ? ` (${a.employer})` : ""}${a.expiresAt ? `, until ${a.expiresAt.slice(0, 10)}` : ""}` : "Employee"}</td><td>{a.status.toLowerCase()}</td></tr>)}</tbody></table>}
    </div>
  );
}
