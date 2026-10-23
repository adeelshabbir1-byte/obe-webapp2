"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type InboxRow = {
  kind: string; id: string; title: string; from: string; area: string; since: string; due: string | null; priority: "high" | "normal" | "low";
  href: string; actions: ("approve" | "return")[]; onBehalfOf?: string; note?: string; label: string; bulk: boolean; age: number; overdue: boolean;
};

// On a phone each row becomes a card.
const CARD_CSS = "@media (max-width:720px){.apx thead{display:none}.apx tr{display:block;padding:10px 12px;border-bottom:1px solid #eadfdd}.apx td{display:block;border:0!important;padding:2px 0!important}.apx td[data-l]::before{content:attr(data-l) \": \";font-weight:700;color:#6b5a58}.apx td.apx-sel:empty{display:none}}";
const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// The "My approvals" list: filters, approve / return in place (return asks for a reason), and bulk approve for safe kinds.
export default function ApprovalsInbox({ rows }: { rows: InboxRow[] }) {
  const router = useRouter();
  const [kind, setKind] = useState("");
  const [area, setArea] = useState("");
  const [late, setLate] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());

  const kinds = useMemo(() => Array.from(new Map(rows.map((r) => [r.kind, r.label])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const areas = useMemo(() => Array.from(new Set(rows.map((r) => r.area.split(" ")[0]).filter((a) => /^[A-Z][A-Za-z-]{1,12}$/.test(a)))).sort(), [rows]);
  const key = (r: InboxRow) => `${r.kind}:${r.id}`;
  const shown = rows.filter((r) => !gone.has(key(r)) && (!kind || r.kind === kind) && (!area || r.area.startsWith(area)) && (!late || r.overdue) && (!q || `${r.title} ${r.from} ${r.area}`.toLowerCase().includes(q.toLowerCase())));
  const bulkable = shown.filter((r) => r.bulk && r.actions.includes("approve"));

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, d: await res.json().catch(() => ({})) };
  }
  async function decide(r: InboxRow, decision: "approve" | "return", why = "") {
    setBusy(key(r)); setMsg(null);
    const { ok, d } = await post({ action: "decide", kind: r.kind, id: r.id, decision, reason: why });
    setBusy(null);
    if (ok) { setGone(new Set(gone).add(key(r))); setReturning(null); setReason(""); setMsg({ ok: true, text: `${decision === "approve" ? "Approved" : "Returned"}: ${r.title}` }); router.refresh(); }
    else setMsg({ ok: false, text: d.error || "Could not save." });
  }
  async function bulk() {
    const list = bulkable.filter((r) => sel.has(key(r)));
    if (!list.length || !confirm(`Approve ${list.length} item(s)?`)) return;
    setBusy("bulk"); setMsg(null);
    const { d } = await post({ action: "bulk", items: list.map((r) => ({ kind: r.kind, id: r.id })) });
    setBusy(null); setSel(new Set());
    setMsg({ ok: !(d.errors || []).length, text: `Approved ${d.done || 0} of ${list.length}.${(d.errors || []).length ? ` Not done: ${(d.errors as string[]).slice(0, 3).join("; ")}` : ""}` });
    router.refresh();
  }

  return (
    <div>
      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", marginBottom: 10 }}>
        <label style={{ fontSize: 13 }}>What<br /><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Everything ({rows.length - gone.size})</option>{kinds.map(([k, l]) => <option key={k} value={k}>{l} ({rows.filter((r) => r.kind === k && !gone.has(key(r))).length})</option>)}</select></label>
        {areas.length > 1 && <label style={{ fontSize: 13 }}>Program<br /><select className="input" value={area} onChange={(e) => setArea(e.target.value)}><option value="">All</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>}
        <label style={{ fontSize: 13 }}>Search<br /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, course, roll no." /></label>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", paddingBottom: 6 }}><input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} /> Overdue only</label>
        {bulkable.length > 0 && <button type="button" className="btn btn-brass btn-sm" disabled={busy === "bulk" || !bulkable.some((r) => sel.has(key(r)))} onClick={bulk}>{busy === "bulk" ? "Approving…" : `Approve selected (${bulkable.filter((r) => sel.has(key(r))).length})`}</button>}
      </div>
      {msg && <p role="status" style={{ color: msg.ok ? "#1E6B3A" : "#B3261E", fontWeight: 700, margin: "0 0 8px" }}>{msg.text}</p>}
      {shown.length === 0 ? <div className="card"><p style={{ margin: 0, color: "#1E6B3A", fontWeight: 700 }}>✓ Nothing waiting{kind || area || late || q ? " that matches these filters" : " for you"}.</p></div> : (
        <div className="card" style={{ overflowX: "auto", padding: 0 }}>
          <style dangerouslySetInnerHTML={{ __html: CARD_CSS }} />
          <table className="table apx" style={{ fontSize: 13.5, margin: 0 }}>
            <thead><tr><th style={{ width: 28 }}></th><th>What</th><th>From</th><th>Waiting</th><th>Due</th><th style={{ minWidth: 190 }}>Decide</th></tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={key(r)} style={{ background: r.overdue ? "#FDECEA" : undefined }}>
                <td className="apx-sel">{r.bulk && r.actions.includes("approve") ? <input type="checkbox" aria-label="Select" checked={sel.has(key(r))} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(key(r)); else s.delete(key(r)); setSel(s); }} /> : null}</td>
                <td>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "#7A1F2B", textTransform: "uppercase", letterSpacing: 0.3 }}>{r.label}</span>
                  {r.priority === "high" && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "#fff", background: "#B3261E", borderRadius: 4, padding: "1px 5px" }}>{r.overdue ? "OVERDUE" : "URGENT"}</span>}
                  {r.onBehalfOf && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "#7A4B00", background: "#FFF1D6", borderRadius: 4, padding: "1px 5px" }}>on behalf of {r.onBehalfOf}</span>}
                  <div><a href={r.href} style={{ fontWeight: 700 }}>{r.title}</a></div>
                  {r.area && <div className="small-note" style={{ margin: 0 }}>{r.area}</div>}
                  {r.note && <div className="small-note" style={{ margin: 0, color: "#6B4E00" }}>{r.note}</div>}
                </td>
                <td data-l="From">{r.from || "—"}</td>
                <td data-l="Waiting" style={{ whiteSpace: "nowrap", color: r.overdue ? "#B3261E" : undefined, fontWeight: r.overdue ? 700 : 400 }}>{r.age === 0 ? "today" : `${r.age} day${r.age === 1 ? "" : "s"}`}<div className="small-note" style={{ margin: 0 }}>since {fmt(r.since)}</div></td>
                <td data-l="Due" style={{ whiteSpace: "nowrap" }}>{r.due ? fmt(r.due) : "—"}</td>
                <td>
                  {returning === key(r) ? (
                    <div style={{ display: "grid", gap: 4 }}>
                      <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you returning it? (the sender sees this)" autoFocus />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="btn btn-danger btn-sm" disabled={!reason.trim() || busy === key(r)} onClick={() => decide(r, "return", reason)}>Return</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setReturning(null); setReason(""); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {r.actions.includes("approve") && <button type="button" className="btn btn-brass btn-sm" disabled={busy === key(r)} onClick={() => decide(r, "approve")}>{busy === key(r) ? "Saving…" : "Approve"}</button>}
                      {r.actions.includes("return") && <button type="button" className="btn btn-secondary btn-sm" disabled={busy === key(r)} onClick={() => { setReturning(key(r)); setReason(""); }}>Return…</button>}
                      <a className="btn btn-secondary btn-sm" href={r.href}>Open</a>
                    </div>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
