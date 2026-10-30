"use client";

import { useCallback, useEffect, useState } from "react";

// The proposal inbox of the Topic Workspace: plan proposals (current vs proposed side by side, differences marked;
// accept all, item by item, or reject with a reason; history kept) and topic-link proposals waiting on this person.

type Item = { id: string; kind: string; status: string; reason: string | null; lectureRowId: string | null; topic?: string; detail?: Record<string, unknown>; line: string; linked: string };
type Proposal = {
  id: string; course: string; courseId: string; kind: string; status: string; note: string | null; reason: string | null; from: string; to: string; createdAt: string; approved: boolean; template: string | null;
  before: { id: string; topic: string; subtopic: string | null; importance?: string | null }[]; after: { id?: string; topic: string; subtopic: string | null; importance?: string | null; fromCourseId?: string | null; splitFrom?: string | null; mergedFrom?: string[] | null }[];
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
      <style dangerouslySetInnerHTML={{ __html: ".tw-filter{border:1px solid var(--line);background:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:11.5px;font-weight:600;min-height:0}.tw-filter[aria-pressed=true]{background:#3A1218;color:#fff !important;border-color:#3A1218}" }} />
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

// What each kind of change is called and how it is coloured (the legend uses the same list).
const KINDS: { key: string; label: string; plural: string; color: string; bg: string }[] = [
  { key: "MOVE", label: "Moved", plural: "moved", color: "#1C4E9B", bg: "#E9F0FB" },
  { key: "MERGE", label: "Merged", plural: "merged", color: "#6A3FA0", bg: "#F1ECF8" },
  { key: "SPLIT", label: "Split", plural: "split", color: "#6A3FA0", bg: "#F1ECF8" },
  { key: "ADD", label: "Added", plural: "added", color: "#1E6B34", bg: "#E8F3EA" },
  { key: "REMOVE", label: "Removed", plural: "removed", color: "#B3261E", bg: "#FBEAEA" },
  { key: "RENAME", label: "Renamed", plural: "renamed", color: "#8A5A00", bg: "#FFF4D6" },
  { key: "REORDER", label: "Reordered", plural: "reordered", color: "#574C50", bg: "#F1EEEE" },
  { key: "IMPORTANCE", label: "Importance", plural: "importance changes", color: "#574C50", bg: "#F1EEEE" },
  { key: "LINK", label: "Link", plural: "links", color: "#0E6E6E", bg: "#E3F4F4" },
  { key: "DROP", label: "Dropped", plural: "dropped", color: "#B3261E", bg: "#FBEAEA" },
  { key: "SHORTEN", label: "Shortened", plural: "shortened", color: "#8A5A00", bg: "#FFF4D6" },
];
const kindOf = (k: string) => (k === "MOVE_IN" || k === "MOVE_OUT" ? "MOVE" : k);
const K = (k: string) => KINDS.find((x) => x.key === kindOf(k)) || KINDS[6];
const LEVEL: Record<string, string> = { CORE: "Core", IMPORTANT: "Important", OPTIONAL: "Optional" };
const Chip = ({ k, children }: { k: string; children?: React.ReactNode }) => { const c = K(k); return <span style={{ fontSize: 10.5, fontWeight: 700, color: c.color, background: c.bg, borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap" }}>{children ?? c.label}</span>; };

function ProposalCard({ p, canAnswer, onDone }: { p: Proposal; canAnswer: boolean; onDone: (t: string) => void }) {
  const [pick, setPick] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [only, setOnly] = useState<string | null>(null);
  const pending = p.items.filter((i) => i.status === "PENDING");
  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setErr("");
    const r = await send(`${API}/proposals`, "POST", { id: p.id, reason, ...body });
    setBusy(false);
    if (r.ok) onDone(r.d.template ? "Accepted — the plan is approved by the OMC, so a Template Change Request was raised." : "Done."); else setErr(r.d.error || "Failed.");
  };
  // Summary: "3 moved · 1 merged · 2 added · 1 removed".
  const counts = new Map<string, number>();
  for (const i of p.items) counts.set(kindOf(i.kind), (counts.get(kindOf(i.kind)) || 0) + 1);
  const summary = KINDS.filter((k) => counts.get(k.key)).map((k) => `${counts.get(k.key)} ${k.plural}`).join(" · ");
  const show = (i: Item) => !only || kindOf(i.kind) === only;
  // What happens to each lecture row (current side) and each entry (proposed side).
  const byRow = new Map<string, Item[]>();
  for (const i of p.items) { const ids = [i.lectureRowId, ...((i.detail?.parts as { id?: string }[]) || []).map((x) => x.id)].filter((x): x is string => !!x); for (const id of Array.from(new Set(ids))) byRow.set(id, (byRow.get(id) || []).concat(i)); }
  const L = new Map(p.before.map((b, n) => [b.id, n + 1]));
  const status = { PENDING: "waiting", PARTIAL: "partly answered", ACCEPTED: "accepted", REJECTED: "rejected", AWAITING_OMC: "accepted — waiting for the OMC" }[p.status] || p.status.toLowerCase();
  const row = (style: React.CSSProperties, n: number, text: React.ReactNode, tags: React.ReactNode, dim = false) => (
    <li style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "3px 6px", borderRadius: 6, marginBottom: 2, opacity: dim ? 0.45 : 1, ...style }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--slate)", minWidth: 26 }}>L{n}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{text}</span>{tags}
    </li>
  );
  const tint = (k: string) => ({ background: K(k).bg, borderLeft: `3px solid ${K(k).color}` });
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <b>{p.course}</b>
        <span className="small-note">{p.kind === "SHORT_OF_TIME" ? "Short of time · " : ""}{canAnswer ? `from ${p.from}` : `to ${p.to}`} · {new Date(p.createdAt).toLocaleDateString()} · {status}{p.days >= 3 && ["PENDING", "PARTIAL"].includes(p.status) ? ` · waiting ${p.days} days` : ""}</span>
        {p.approved && p.kind === "EDIT" && <span className="small-note" style={{ color: "#8A3D0D" }}>Approved plan: accepting raises a Template Change Request</span>}
      </div>
      {p.note && <p style={{ fontSize: 13, margin: "4px 0" }}>“{p.note}”</p>}
      {p.reason && <p className="small-note">Reason: {p.reason}</p>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "8px 0", padding: "6px 8px", background: "#F7F4F3", borderRadius: 8 }} aria-label="Summary of the changes">
        <b style={{ fontSize: 13 }}>{summary || "No changes"}</b>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4, flexWrap: "wrap" }} role="group" aria-label="Show only one kind of change">
          <button type="button" className="tw-filter" aria-pressed={!only} onClick={() => setOnly(null)}>All</button>
          {KINDS.filter((k) => counts.get(k.key)).map((k) => <button key={k.key} type="button" className="tw-filter" aria-pressed={only === k.key} onClick={() => setOnly(only === k.key ? null : k.key)} style={{ color: k.color }}>{k.label} ({counts.get(k.key)})</button>)}
        </span>
      </div>
      {(p.before.length > 0 || p.after.length > 0) && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10, margin: "8px 0" }}>
        <div><div className="small-note"><b>Current</b></div><ol style={{ fontSize: 12.5, padding: 0, margin: 0, listStyle: "none" }}>
          {p.before.map((b, n) => {
            const its = (byRow.get(b.id) || []);
            const main = its.find((i) => ["REMOVE", "MOVE_OUT", "MERGE", "SPLIT", "RENAME"].includes(i.kind));
            const dim = !!only && !its.some(show);
            if (!main) return <div key={b.id}>{row({}, n + 1, b.topic, its.filter((i) => i.kind === "IMPORTANCE" || i.kind === "LINK").map((i) => <Chip key={i.id} k={i.kind}>{i.kind === "LINK" ? "link" : `${LEVEL[String(i.detail?.from)] || "—"} → ${LEVEL[String(i.detail?.to)]}`}</Chip>), dim)}</div>;
            if (main.kind === "REMOVE") return <div key={b.id}>{row(tint("REMOVE"), n + 1, <s>{b.topic}</s>, <Chip k="REMOVE">removed</Chip>, dim)}</div>;
            if (main.kind === "MOVE_OUT") return <div key={b.id}>{row(tint("MOVE"), n + 1, b.topic, <Chip k="MOVE">→ {String(main.detail?.toCode || "other course")}</Chip>, dim)}</div>;
            if (main.kind === "MERGE") return <div key={b.id}>{row(tint("MERGE"), n + 1, main.lectureRowId === b.id ? b.topic : <s>{b.topic}</s>, <Chip k="MERGE">{main.lectureRowId === b.id ? `${((main.detail?.lectures as number[]) || []).map((x) => `L${x}`).join(" + ")} merged` : `merged into L${main.detail?.into}`}</Chip>, dim)}</div>;
            if (main.kind === "SPLIT") return <div key={b.id}>{row(tint("SPLIT"), n + 1, b.topic, <Chip k="SPLIT">split into {((main.detail?.parts as unknown[]) || []).length}</Chip>, dim)}</div>;
            return <div key={b.id}>{row(tint("RENAME"), n + 1, b.topic, <Chip k="RENAME">renamed</Chip>, dim)}</div>;
          })}
        </ol></div>
        <div><div className="small-note"><b>Proposed</b></div><ol style={{ fontSize: 12.5, padding: 0, margin: 0, listStyle: "none" }}>
          {p.after.map((a, n) => {
            const its = a.id ? (byRow.get(a.id) || []) : [];
            const imp = its.filter((i) => i.kind === "IMPORTANCE" || i.kind === "LINK").map((i) => <Chip key={i.id} k={i.kind}>{i.kind === "LINK" ? "link" : `${LEVEL[String(i.detail?.from)] || "—"} → ${LEVEL[String(i.detail?.to)]}`}</Chip>);
            const k = !a.id ? (a.splitFrom ? "SPLIT" : "ADD") : !L.has(a.id) ? "MOVE" : its.find((i) => i.kind === "MERGE") ? "MERGE" : its.find((i) => i.kind === "SPLIT") ? "SPLIT" : its.find((i) => i.kind === "RENAME") ? "RENAME" : null;
            const dim = !!only && (k ? kindOf(k) !== only : !its.some(show));
            const key = a.id || `n${n}`;
            if (!k) return <div key={key}>{row({}, n + 1, a.topic, imp, dim)}</div>;
            if (k === "ADD") return <div key={key}>{row(tint("ADD"), n + 1, a.topic, <><Chip k="ADD">+ new</Chip>{imp}</>, dim)}</div>;
            if (k === "MOVE") { const mv = p.items.find((i) => i.lectureRowId === a.id && i.kind === "MOVE_IN"); return <div key={key}>{row(tint("MOVE"), n + 1, a.topic, <><Chip k="MOVE">← {String(mv?.detail?.fromCode || "other course")}</Chip>{imp}</>, dim)}</div>; }
            if (k === "MERGE") { const m = its.find((i) => i.kind === "MERGE")!; return <div key={key}>{row(tint("MERGE"), n + 1, a.topic, <><Chip k="MERGE">{((m.detail?.lectures as number[]) || []).map((x) => `L${x}`).join(" + ")}</Chip>{imp}</>, dim)}</div>; }
            if (k === "SPLIT") return <div key={key}>{row(tint("SPLIT"), n + 1, a.topic, <><Chip k="SPLIT">from L{L.get(a.splitFrom || a.id || "") || "?"}</Chip>{imp}</>, dim)}</div>;
            const rn = its.find((i) => i.kind === "RENAME")!;
            return <div key={key}>{row(tint("RENAME"), n + 1, <span><s style={{ color: "var(--slate)" }}>{String(rn.detail?.oldTopic || "")}</s> → <b>{a.topic}</b></span>, imp, dim)}</div>;
          })}
        </ol></div>
      </div>}
      <div className="small-note" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} aria-label="Legend">Legend: {KINDS.filter((k) => !["DROP", "SHORTEN"].includes(k.key)).map((k) => <Chip key={k.key} k={k.key} />)}</div>
      <ul style={{ fontSize: 13, paddingLeft: 0, listStyle: "none", margin: "8px 0" }}>
        {p.items.filter(show).map((i) => (
          <li key={i.id} style={{ padding: "3px 0", display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
            {canAnswer && i.status === "PENDING" ? <input type="checkbox" aria-label={`Choose: ${i.line}`} checked={pick.includes(i.id)} onChange={() => setPick((x) => (x.includes(i.id) ? x.filter((y) => y !== i.id) : x.concat(i.id)))} /> : null}
            <Chip k={i.kind} /> <span>{i.line}</span>
            <span className="small-note">{i.status !== "PENDING" ? i.status.toLowerCase() : ""}{i.reason ? ` — ${i.reason}` : ""}{i.linked ? ` · linked move: ${i.linked}` : ""}</span>
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
