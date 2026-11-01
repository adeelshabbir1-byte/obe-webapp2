"use client";

import { useEffect, useState } from "react";

type T = { key: string; label: string };
type D = { id: string; kind: string; roleLabel: string; tasks: T[]; to: string; from: string; startAt: string; endAt: string; mayPassOn: boolean; shared: boolean; maxLeaveDays: number | null; scope: { chains?: number[] }; active: boolean; revokedAt: string | null };
const day = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// "My delegations" — given and received, and a form to delegate chosen tasks or acting (Adeel prompt §13).
export default function DelegationsClient({ roleLabel }: { roleLabel: string }) {
  const [data, setData] = useState<{ given: D[]; received: D[]; mine: (T & { scopeType: string })[]; never: T[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState<"TASKS" | "ACTING">("TASKS");
  const [tasks, setTasks] = useState<string[]>([]);
  const [q, setQ] = useState(""); const [people, setPeople] = useState<{ id: string; name: string }[]>([]); const [to, setTo] = useState<{ id: string; name: string } | null>(null);
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10)); const [end, setEnd] = useState("");
  const [chains, setChains] = useState(""); const [leave, setLeave] = useState(""); const [passOn, setPassOn] = useState(false); const [shared, setShared] = useState(false); const [note, setNote] = useState("");
  const load = () => fetch("/api/delegations").then((r) => r.json()).then(setData).catch(() => setMsg("Could not load."));
  useEffect(() => { load(); }, []);
  async function find(v: string) { setQ(v); if (v.length < 2) return setPeople([]); const r = await fetch(`/api/next-tasks/people?q=${encodeURIComponent(v)}`).then((x) => x.json()).catch(() => ({ people: [] })); setPeople(r.people || []); }
  async function save() {
    setMsg("");
    const r = await fetch("/api/delegations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, toUserId: to?.id, tasks, scope: { chains: chains.split(/[ ,]+/).filter(Boolean).map(Number) }, maxLeaveDays: leave ? Number(leave) : null, startAt: start, endAt: end, mayPassOn: passOn, shared, note }) }).then((x) => x.json()).catch(() => ({ error: "Could not save." }));
    if (r.error) setMsg(r.error); else { setMsg("Delegated ✓"); setTasks([]); setTo(null); load(); }
  }
  async function revoke(id: string) { const r = await fetch(`/api/delegations?id=${id}`, { method: "DELETE" }).then((x) => x.json()); if (r.error) setMsg(r.error); else load(); }
  if (!data) return <p>Loading…</p>;
  const List = ({ rows, mineSide }: { rows: D[]; mineSide: boolean }) => rows.length === 0 ? <p className="small-note">None.</p> : (
    <table className="table" style={{ fontSize: 12.5, width: "100%" }}><tbody>{rows.map((d) => (
      <tr key={d.id} style={{ opacity: d.active ? 1 : 0.55 }}>
        <td><b>{mineSide ? d.to : d.from}</b> — {d.kind === "ACTING" ? `Acting ${d.roleLabel}` : `${d.roleLabel} Delegate`}{d.scope.chains?.length ? ` · chains ${d.scope.chains.join(", ")}` : ""}{d.maxLeaveDays ? ` · leave ≤ ${d.maxLeaveDays} days` : ""}{d.mayPassOn ? " · may pass on" : ""}{d.shared ? " · shared" : ""}
          <div className="small-note">{d.kind === "ACTING" ? "All delegable tasks of the position" : d.tasks.map((t) => t.label).join(" · ")}</div></td>
        <td style={{ whiteSpace: "nowrap" }}>{day(d.startAt)} – {day(d.endAt)}{d.revokedAt ? " · revoked" : !d.active ? " · ended" : ""}</td>
        <td>{mineSide && d.active && <button type="button" className="btn btn-sm" onClick={() => revoke(d.id)}>Revoke</button>}</td>
      </tr>))}</tbody></table>
  );
  return (
    <>
      {msg && <div className={msg.includes("✓") ? "card" : "err"} style={{ marginBottom: 10 }}>{msg}</div>}
      <div className="card" style={{ marginBottom: 12 }}><h3 style={{ marginTop: 0, fontSize: 15 }}>Given by me</h3><List rows={data.given} mineSide /></div>
      <div className="card" style={{ marginBottom: 12 }}><h3 style={{ marginTop: 0, fontSize: 15 }}>Received</h3><List rows={data.received} mineSide={false} /></div>
      {data.mine.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Delegate</h3>
          <div style={{ display: "flex", gap: 14, fontSize: 13, marginBottom: 8 }}>
            <label><input type="radio" checked={kind === "TASKS"} onChange={() => setKind("TASKS")} /> Chosen tasks ({roleLabel} Delegate)</label>
            <label><input type="radio" checked={kind === "ACTING"} onChange={() => setKind("ACTING")} /> Acting {roleLabel} (whole position, e.g. while on leave)</label>
          </div>
          {kind === "TASKS" && <div style={{ fontSize: 13, marginBottom: 8 }}>{data.mine.map((t) => <label key={t.key} style={{ display: "block" }}><input type="checkbox" checked={tasks.includes(t.key)} onChange={(e) => setTasks(e.target.checked ? [...tasks, t.key] : tasks.filter((k) => k !== t.key))} /> {t.label}</label>)}
            {data.never.map((t) => <label key={t.key} style={{ display: "block", color: "#999" }} title="Needs the holder"><input type="checkbox" disabled /> {t.label} — needs the holder</label>)}</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 13, alignItems: "center" }}>
            {to ? <span>To <b>{to.name}</b> <button type="button" className="btn-link" onClick={() => setTo(null)}>×</button></span> : <span style={{ position: "relative" }}>To <input value={q} onChange={(e) => find(e.target.value)} placeholder="name…" style={{ width: 160 }} />
              {people.length > 0 && <span style={{ position: "absolute", top: 24, left: 20, background: "#fff", border: "1px solid #ddd", borderRadius: 6, zIndex: 5 }}>{people.map((p) => <button key={p.id} type="button" className="btn-link" style={{ display: "block", padding: "3px 8px" }} onClick={() => { setTo(p); setPeople([]); }}>{p.name}</button>)}</span>}</span>}
            <label>From <input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label>Until <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            {kind === "TASKS" && tasks.includes("hod.nameSE") && <label title="Course code chains (e.g. 0 = Programming). Empty = all.">Chains <input value={chains} onChange={(e) => setChains(e.target.value)} placeholder="e.g. 0, 4" style={{ width: 70 }} /></label>}
            {kind === "TASKS" && tasks.some((k) => k.endsWith(".leave")) && <label>Leave up to <input type="number" min={1} value={leave} onChange={(e) => setLeave(e.target.value)} style={{ width: 50 }} /> days</label>}
            <label><input type="checkbox" checked={passOn} onChange={(e) => setPassOn(e.target.checked)} /> may pass on</label>
            <label><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> shared</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={{ width: 180 }} />
            <button type="button" className="btn btn-brass" onClick={save}>Delegate</button>
          </div>
          <p className="small-note">You keep control: act yourself, override, or revoke at any time. Every action your delegate takes is logged “by them for {roleLabel}”, and you get a weekly summary. A delegate never approves their own request.</p>
        </div>
      )}
    </>
  );
}
