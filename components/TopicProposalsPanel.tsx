"use client";

import { useCallback, useEffect, useState } from "react";

// The proposal inbox of the Topic Workspace: plan proposals (current vs proposed side by side, differences marked;
// accept all, item by item, or reject with a reason; history kept) and topic-link proposals waiting on this person.

type Item = { id: string; kind: string; status: string; reason: string | null; lectureRowId: string | null; line: string; linked: string };
type Proposal = {
  id: string; course: string; courseId: string; kind: string; status: string; note: string | null; reason: string | null; from: string; to: string; createdAt: string; approved: boolean; template: string | null;
  before: { id: string; topic: string; subtopic: string | null; importance?: string | null }[]; after: { id?: string; topic: string; subtopic: string | null; importance?: string | null; fromCourseId?: string | null }[];
  items: Item[]; days: number;
};
type LinkP = { id: string; kind: string; level: string; action: string; fromCode: string; fromTopic: string; toCode: string; toTopic: string; status: string; reason: string | null; createdAt: string; state: { steps: { label: string; done: boolean }[]; waiting: string[]; votes: string | null; canAct: string | null } };
const API = "/api/faculty/topic-workspace";
const send = async (url: string, method: string, body: unknown) => { const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) }; };

export default function TopicProposalsPanel({ legacy }: { legacy?: React.ReactNode }) {
  const [data, setData] = useState<{ received: Proposal[]; sent: Proposal[]; missingTable?: boolean } | null>(null);
  const [linksP, setLinksP] = useState<LinkP[]>([]);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const [p, l] = await Promise.all([fetch(`${API}/proposals`).then((r) => r.json()).catch(() => null), fetch(`${API}/links`).then((r) => r.json()).catch(() => null)]);
    setData(p || { received: [], sent: [] }); setLinksP(l?.rows || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <p className="small-note">Loading…</p>;
  const waiting = linksP.filter((l) => l.status === "PENDING" && l.state.canAct);
  return (
    <div>
      {data.missingTable && <div className="err">The Topic Workspace tables are not in the database yet — run prisma/migration_topic_planning.sql in Supabase.</div>}
      {msg && <div className="small-note" role="status">{msg}</div>}
      <h3 style={{ fontSize: 15 }}>Waiting for you</h3>
      {!data.received.filter((p) => ["PENDING", "PARTIAL"].includes(p.status)).length && !waiting.length && <p className="small-note">Nothing is waiting for you.</p>}
      {data.received.filter((p) => ["PENDING", "PARTIAL"].includes(p.status)).map((p) => <ProposalCard key={p.id} p={p} canAnswer onDone={(t) => { setMsg(t); load(); }} />)}
      {waiting.map((l) => <LinkCard key={l.id} l={l} onDone={(t) => { setMsg(t); load(); }} />)}
      <h3 style={{ fontSize: 15, marginTop: 18 }}>Sent by you</h3>
      {!data.sent.length && <p className="small-note">You have not proposed any plan changes yet.</p>}
      {data.sent.map((p) => <ProposalCard key={p.id} p={p} canAnswer={false} onDone={load} />)}
      {linksP.filter((l) => !(l.status === "PENDING" && l.state.canAct)).length > 0 && <>
        <h3 style={{ fontSize: 15, marginTop: 18 }}>Topic links</h3>
        {linksP.filter((l) => !(l.status === "PENDING" && l.state.canAct)).map((l) => <LinkCard key={l.id} l={l} onDone={load} />)}
      </>}
      <h3 style={{ fontSize: 15, marginTop: 18 }}>History</h3>
      {data.received.filter((p) => !["PENDING", "PARTIAL"].includes(p.status)).map((p) => <ProposalCard key={p.id} p={p} canAnswer={false} onDone={load} />)}
      {legacy}
    </div>
  );
}

function ProposalCard({ p, canAnswer, onDone }: { p: Proposal; canAnswer: boolean; onDone: (t: string) => void }) {
  const [pick, setPick] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = p.items.filter((i) => i.status === "PENDING");
  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setErr("");
    const r = await send(`${API}/proposals`, "POST", { id: p.id, reason, ...body });
    setBusy(false);
    if (r.ok) onDone(r.d.template ? "Accepted — the plan is approved by the OMC, so a Template Change Request was raised." : "Done."); else setErr(r.d.error || "Failed.");
  };
  const removed = new Set(p.items.filter((i) => i.kind === "REMOVE" || i.kind === "MOVE_OUT").map((i) => i.lectureRowId));
  const renamed = new Map(p.items.filter((i) => i.kind === "RENAME").map((i) => [i.lectureRowId, i]));
  const beforeIds = new Set(p.before.map((b) => b.id));
  const status = { PENDING: "waiting", PARTIAL: "partly answered", ACCEPTED: "accepted", REJECTED: "rejected", AWAITING_OMC: "accepted — waiting for the OMC" }[p.status] || p.status.toLowerCase();
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <b>{p.course}</b>
        <span className="small-note">{p.kind === "SHORT_OF_TIME" ? "Short of time · " : ""}{canAnswer ? `from ${p.from}` : `to ${p.to}`} · {new Date(p.createdAt).toLocaleDateString()} · {status}{p.days >= 3 && ["PENDING", "PARTIAL"].includes(p.status) ? ` · waiting ${p.days} days` : ""}</span>
        {p.approved && p.kind === "EDIT" && <span className="small-note" style={{ color: "#8A3D0D" }}>Approved plan: accepting raises a Template Change Request</span>}
      </div>
      {p.note && <p style={{ fontSize: 13, margin: "4px 0" }}>“{p.note}”</p>}
      {p.reason && <p className="small-note">Reason: {p.reason}</p>}
      {(p.before.length > 0 || p.after.length > 0) && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10, margin: "8px 0" }}>
        <div><div className="small-note"><b>Current</b></div><ol style={{ fontSize: 12.5, paddingLeft: 20, margin: 0 }}>{p.before.map((b) => <li key={b.id} style={removed.has(b.id) ? { color: "#B3261E", textDecoration: "line-through" } : renamed.has(b.id) ? { color: "#1C4E9B" } : undefined}>{b.topic}{b.importance ? <span className="small-note"> · {b.importance.toLowerCase()}</span> : null}</li>)}</ol></div>
        <div><div className="small-note"><b>Proposed</b></div><ol style={{ fontSize: 12.5, paddingLeft: 20, margin: 0 }}>{p.after.map((a, i) => { const isNew = !a.id; const movedIn = !!a.id && !beforeIds.has(a.id); const ren = a.id ? renamed.get(a.id) : undefined; return <li key={a.id || `n${i}`} style={isNew ? { color: "#1E6B34" } : movedIn ? { color: "#6A3FA0" } : ren ? { color: "#1C4E9B" } : undefined}>{isNew ? "+ " : movedIn ? "→ " : ren ? "✎ " : ""}{a.topic}{a.importance ? <span className="small-note"> · {a.importance.toLowerCase()}</span> : null}</li>; })}</ol></div>
      </div>}
      <ul style={{ fontSize: 13, paddingLeft: 0, listStyle: "none", margin: "6px 0" }}>
        {p.items.map((i) => (
          <li key={i.id} style={{ padding: "2px 0" }}>
            {canAnswer && i.status === "PENDING" ? <label><input type="checkbox" checked={pick.includes(i.id)} onChange={() => setPick((x) => (x.includes(i.id) ? x.filter((y) => y !== i.id) : x.concat(i.id)))} /> {i.line}</label> : <span>{i.line}</span>}
            {" "}<span className="small-note">{i.status !== "PENDING" ? i.status.toLowerCase() : ""}{i.reason ? ` — ${i.reason}` : ""}{i.linked ? ` · linked move: ${i.linked}` : ""}</span>
          </li>
        ))}
      </ul>
      {canAnswer && pending.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-sm" disabled={busy} onClick={() => act({ acceptAll: true })}>Accept all</button>
        <button className="btn btn-secondary btn-sm" disabled={busy || !pick.length} onClick={() => act({ accept: pick, reject: reason.trim() ? pending.filter((i) => !pick.includes(i.id)).map((i) => i.id) : [] })}>Accept selected{reason.trim() ? ", reject the rest" : ""}</button>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (needed to reject)" style={{ flex: "1 1 200px" }} aria-label="Reason" />
        <button className="btn btn-secondary btn-sm" disabled={busy || reason.trim().length < 3} onClick={() => act(pick.length ? { reject: pick } : { rejectAll: true })}>Reject {pick.length ? "selected" : "all"}</button>
      </div>}
      {err && <div className="err">{err}</div>}
    </div>
  );
}

function LinkCard({ l, onDone }: { l: LinkP; onDone: (t: string) => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const answer = async (approve: boolean) => { const r = await send(`${API}/links`, "PATCH", { id: l.id, approve, reason }); if (r.ok) onDone(r.d.confirmed ? "Link confirmed — it now shows on Prerequisite Topics / Topic Overlaps." : r.d.rejected ? "Declined." : `Recorded. Waiting for: ${(r.d.waiting || []).join(", ")}`); else setErr(r.d.error || "Failed."); };
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <b>{l.fromCode}</b> “{l.fromTopic}” → <b>{l.toCode}</b> “{l.toTopic}” <span className="small-note">{l.kind === "PREREQ" ? `${l.level.toLowerCase()} prerequisite` : l.level.toLowerCase()}{l.action !== "ADD" ? ` · ${l.action.toLowerCase()}` : ""} · {l.status.toLowerCase()}</span>
      <div className="small-note">{l.state.steps.map((s) => `${s.done ? "✓" : "○"} ${s.label}`).join("  ")}{l.state.votes ? ` · OMC: ${l.state.votes}` : ""}{l.reason ? ` · ${l.reason}` : ""}</div>
      {l.state.canAct && l.status === "PENDING" && <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        <button className="btn btn-sm" onClick={() => answer(true)}>{l.state.canAct === "PL" ? "Confirm" : "Agree"}</button>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (to decline)" aria-label="Reason" />
        <button className="btn btn-secondary btn-sm" disabled={reason.trim().length < 3} onClick={() => answer(false)}>Decline</button>
      </div>}
      {err && <div className="err">{err}</div>}
    </div>
  );
}
