"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return r.ok ? null : d.error || "Something went wrong.";
}

export function LeaveRequestForm({ kinds = [] }: { kinds?: [string, string][] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ fromDate: today, toDate: today, reason: "", kind: "CASUAL" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        {kinds.length > 0 && <div className="field"><label>Type</label><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
        <div className="field"><label>First day</label><input type="date" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value, toDate: e.target.value > f.toDate ? e.target.value : f.toDate })} /></div>
        <div className="field"><label>Last day</label><input type="date" min={f.fromDate} value={f.toDate} onChange={(e) => setF({ ...f, toDate: e.target.value })} /></div>
        <div className="field" style={{ flex: "1 1 260px" }}><label>Reason</label><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. conference in Lahore, family emergency" /></div>
        <button className="btn btn-brass" style={{ marginBottom: 14 }} disabled={busy || f.reason.trim().length < 3} onClick={async () => { setBusy(true); setError(""); const e = await post("/api/short-leave", f); setBusy(false); if (e) setError(e); else { setF({ ...f, reason: "" }); router.refresh(); } }}>{busy ? "Sending…" : "Ask for leave"}</button>
      </div>
    </div>
  );
}

export function LeaveDecision({ id }: { id: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const go = async (action: string) => { const note = action === "reject" ? window.prompt("Reason (the teacher sees it):", "") : ""; if (note === null) return; const e = await post(`/api/short-leave/${id}`, { action, note }); if (e) setErr(e); else router.refresh(); };
  return <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><button className="btn btn-brass" style={{ fontSize: 12 }} onClick={() => go("approve")}>Approve</button><button className="btn" style={{ fontSize: 12 }} onClick={() => go("reject")}>Not approved</button>{err && <span style={{ color: "var(--rust)", fontSize: 12 }}>{err}</span>}</span>;
}

export function WithdrawLeave({ id }: { id: string }) {
  const router = useRouter();
  return <button className="act act-danger" onClick={async () => { if (!confirm("Withdraw this leave?")) return; await post(`/api/short-leave/${id}`, { action: "cancel" }); router.refresh(); }}>Withdraw</button>;
}

/** How one class is covered: substitute (pick a free colleague), make-up date, or cancel. */
export function CoverClass({ id, status, plan, substituteName, options, makeupDate }: { id: string; status: string; plan: string; substituteName: string | null; options: { id: string; name: string; sameCourse: boolean; sameDept: boolean; done: number }[]; makeupDate: string | null }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (body: unknown) => { setBusy(true); setErr(""); const e = await post(`/api/short-leave/class/${id}`, body); setBusy(false); if (e) setErr(e); else router.refresh(); };
  if (status === "DONE") return <span className="badge badge-ok">Taken{substituteName ? ` by ${substituteName}` : ""}</span>;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {status === "ACCEPTED" && <span className="badge badge-ok">{substituteName} will take it</span>}
      {status === "ASSIGNED" && <span className="badge badge-warn">Asked {substituteName}</span>}
      {status === "DECLINED" && <span className="badge badge-no">Declined — choose another</span>}
      {status === "MAKEUP_SET" && <span className="badge badge-neutral">Make-up on {makeupDate}</span>}
      {status === "CANCELLED" && <span className="badge badge-neutral">Cancelled</span>}
      <select disabled={busy} value="" style={{ fontSize: 11.5, maxWidth: 230 }} onChange={(e) => e.target.value && run({ action: "assign", substituteId: e.target.value })}>
        <option value="">{plan === "SUBSTITUTE" && substituteName ? "Change substitute…" : "Substitute: free teachers…"}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}{o.sameCourse ? " ★ teaches this course" : o.sameDept ? " · same department" : ""}{o.done ? ` · ${o.done} taken` : ""}</option>)}
      </select>
      <input type="date" style={{ fontSize: 11.5 }} title="Make-up class date" onChange={(e) => e.target.value && run({ action: "makeup", makeupDate: e.target.value })} />
      {status !== "CANCELLED" && <button className="act act-danger" disabled={busy} onClick={() => run({ action: "cancel" })}>Cancel class</button>}
      {err && <span style={{ color: "var(--rust)", fontSize: 12 }}>{err}</span>}
    </span>
  );
}

export function SubstituteAnswer({ id, status, past }: { id: string; status: string; past: boolean }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const run = async (body: unknown) => { const e = await post(`/api/short-leave/class/${id}`, body); if (e) alert(e); else router.refresh(); };
  if (status === "DONE") return <span className="badge badge-ok">Done</span>;
  if (status === "ASSIGNED") return <span style={{ display: "inline-flex", gap: 6 }}><button className="btn btn-brass" style={{ fontSize: 12 }} onClick={() => run({ action: "accept" })}>Accept</button><button className="btn" style={{ fontSize: 12 }} onClick={() => run({ action: "decline" })}>Can&apos;t</button></span>;
  if (status === "ACCEPTED" && past) return <span style={{ display: "inline-flex", gap: 6 }}><input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic covered" style={{ fontSize: 12 }} /><button className="btn btn-brass" style={{ fontSize: 12 }} onClick={() => run({ action: "done", topic })}>Mark taken</button></span>;
  return <span className="badge badge-ok">Accepted</span>;
}
