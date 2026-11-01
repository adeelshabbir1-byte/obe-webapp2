"use client";

import { useState } from "react";

// "Waiting on someone else" for one task (Adeel prompt §1): turns it grey for you, red for the person you wait on.
export function WaitButton({ title, href, waiting }: { title: string; href: string; waiting?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [on, setOn] = useState<{ id: string; name: string } | null>(null);
  const [days, setDays] = useState(3);
  const [msg, setMsg] = useState("");
  async function send(clear = false) {
    const r = await fetch("/api/next-tasks/wait", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, href, reason, onUserId: on?.id, days, clear }) }).then((x) => x.json()).catch(() => ({ error: "Could not save." }));
    if (r.error) { setMsg(r.error); return; }
    location.reload();
  }
  async function find(v: string) {
    setQ(v);
    if (v.trim().length < 2) { setPeople([]); return; }
    const r = await fetch(`/api/next-tasks/people?q=${encodeURIComponent(v)}`).then((x) => x.json()).catch(() => ({ people: [] }));
    setPeople(r.people || []);
  }
  if (waiting) return <button type="button" className="btn-link small-note" onClick={() => send(true)} title="Stop waiting — show this task again">Not waiting any more</button>;
  if (!open) return <button type="button" className="btn-link small-note" onClick={() => setOpen(true)} title="You can't act on this yet">Waiting…</button>;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12 }}>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Waiting for… (e.g. HOD approval)" style={{ fontSize: 12, padding: "2px 6px", width: 190 }} />
      {on ? <span>on <b>{on.name}</b> <button type="button" className="btn-link" onClick={() => setOn(null)}>×</button></span> : (
        <span style={{ position: "relative" }}>
          <input value={q} onChange={(e) => find(e.target.value)} placeholder="on whom? (optional)" style={{ fontSize: 12, padding: "2px 6px", width: 140 }} />
          {people.length > 0 && <span style={{ position: "absolute", top: 22, left: 0, background: "#fff", border: "1px solid #ddd", borderRadius: 6, zIndex: 5, minWidth: 160 }}>{people.map((p) => <button key={p.id} type="button" className="btn-link" style={{ display: "block", padding: "3px 8px", textAlign: "left", width: "100%" }} onClick={() => { setOn(p); setPeople([]); }}>{p.name}</button>)}</span>}
        </span>
      )}
      <label>recheck in <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ fontSize: 12 }}>{[1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}</select></label>
      <button type="button" className="btn btn-sm" onClick={() => send()}>Save</button>
      <button type="button" className="btn-link" onClick={() => setOpen(false)}>Cancel</button>
      {msg && <span style={{ color: "#B3261E" }}>{msg}</span>}
    </span>
  );
}

// The person's digest choice: off / daily / weekly.
export function DigestChoice({ value }: { value: string }) {
  const [v, setV] = useState(value);
  async function save(d: string) { setV(d); await fetch("/api/next-tasks/digest", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ digest: d }) }).catch(() => null); }
  return (
    <label className="small-note">Send me a digest of red and amber items:{" "}
      <select value={v} onChange={(e) => save(e.target.value)} style={{ fontSize: 12 }}><option value="off">Off</option><option value="daily">Daily</option><option value="weekly">Weekly (Mondays)</option></select>
    </label>
  );
}
