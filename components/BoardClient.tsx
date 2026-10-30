"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Committee items: a member's vote (also used on the guest page), the Convener's decision (with the signed-minutes PDF
// in Convener-only mode), the Academic Council step, and the signed minutes of a meeting.

async function send(url: string, body: Record<string, unknown> | FormData) {
  const r = body instanceof FormData ? await fetch(url, { method: "POST", body }) : await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Could not save.");
  return j;
}
const VOTES: [string, string][] = [["APPROVE", "Approve"], ["APPROVE_WITH_CHANGES", "Approve with changes"], ["REJECT", "Reject"]];
const OUTCOMES: [string, string][] = [["APPROVED", "Approved"], ["APPROVED_WITH_CHANGES", "Approved with changes"], ["DEFERRED", "Deferred"], ["REJECTED", "Rejected"]];

export function VoteForm({ itemId, committeeId, token, current }: { itemId: string; committeeId?: string; token?: string; current?: { vote: string; comment: string | null } | null }) {
  const router = useRouter();
  const [v, setV] = useState(current?.vote || "APPROVE");
  const [c, setC] = useState(current?.comment || "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setMsg(null);
    try { await send(token ? "/api/committee-guest" : "/api/cmt", token ? { token, itemId, vote: v, comment: c } : { action: "vote", itemId, committeeId, vote: v, comment: c }); setMsg({ ok: true, text: "Vote recorded." }); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 6 }}>
      <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Your vote<select value={v} onChange={(e) => setV(e.target.value)}>{VOTES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label style={{ fontSize: 12, display: "grid", gap: 3, flex: "1 1 240px" }}>Comment{v !== "APPROVE" ? " (required)" : ""}<input value={c} onChange={(e) => setC(e.target.value)} /></label>
      <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={go}>{current ? "Change vote" : "Vote"}</button>
      {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
    </div>
  );
}

export function FinaliseForm({ itemId, convenerOnly, suggested }: { itemId: string; convenerOnly: boolean; suggested: string | null }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState(suggested || "APPROVED");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.set("action", "finalise"); fd.set("itemId", itemId); fd.set("outcome", outcome); fd.set("note", note); if (date) fd.set("meetingDate", date); if (file) fd.set("file", file);
    try { await send("/api/cmt", fd); setMsg({ ok: true, text: "Decision recorded." }); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 6, padding: 8, border: "1px dashed var(--line)", borderRadius: 8 }} data-testid="finalise">
      <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Decision<select value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUTCOMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label style={{ fontSize: 12, display: "grid", gap: 3, flex: "1 1 200px" }}>Note<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {convenerOnly && <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Meeting date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>}
      {convenerOnly && <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Signed minutes (PDF)<input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>}
      <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={go}>{busy ? "Saving…" : "Finalise"}</button>
      {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
    </div>
  );
}

/** A PDF upload with a few fields: the Academic Council step, or the signed minutes of a meeting. */
export function PdfForm({ action, fields, submit }: { action: string; fields: Record<string, string>; submit: string; withStatus?: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("NOTED");
  const [date, setDate] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go() {
    const fd = new FormData();
    fd.set("action", action); Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
    if (action === "council") { fd.set("status", status); fd.set("date", date); }
    if (file) fd.set("file", file);
    try { await send("/api/cmt", fd); setMsg({ ok: true, text: "Saved." }); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {action === "council" && <><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="NOTED">Academic Council noted</option><option value="APPROVED">Academic Council approved</option></select><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></>}
      <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <button type="button" className="btn btn-secondary btn-sm" onClick={go}>{submit}</button>
      {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
    </span>
  );
}
