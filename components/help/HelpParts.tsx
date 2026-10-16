"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DESKS, deskForCategory } from "../../lib/help/deskList";

// Pieces shared by the help panel, the Help page and the student portal's Help page.

export type ArticleCard = {
  key: string; kind: "guide" | "faq"; category: string; title: string; summary: string; steps: string[];
  who: string; affects: string; href: string; related: string[]; source: string; matched?: string[];
};
export type Audience = "staff" | "student";

export const helpHome = (a: Audience) => (a === "student" ? "/student/help" : "/help");
export const requestsHome = (a: Audience) => (a === "student" ? "/student/help#requests" : "/help/requests");

export function ResultItem({ a, onOpen, best }: { a: ArticleCard; onOpen: (a: ArticleCard) => void; best?: boolean }) {
  return (
    <button type="button" className="hp-item" onClick={() => onOpen(a)}>
      <b>{a.title}{a.kind === "guide" && <span className="hp-tag">Guide</span>}{a.source !== "builtin" && <span className="hp-tag sage">Your institute</span>}{best && <span className="hp-tag sage">Best match</span>}</b>
      <span>{a.summary}</span>
    </button>
  );
}

/** One article: the answer, the steps, who can do it, what it changes, the page to open, and a helpfulness vote. */
export function ArticleBody({ a, audience, onNavigate, onRelated }: { a: ArticleCard; audience: Audience; onNavigate?: () => void; onRelated?: (key: string) => void }) {
  const [vote, setVote] = useState<null | boolean>(null);
  const [voteErr, setVoteErr] = useState("");
  const [related, setRelated] = useState<{ key: string; title: string }[]>([]);
  useEffect(() => {
    setVote(null); setVoteErr(""); setRelated([]);
    if (!a.related.length) return;
    let live = true;
    fetch(`/api/help/search?key=${encodeURIComponent(a.key)}&audience=${audience}`).then((r) => r.json()).then((d) => { if (live && d.related) setRelated(d.related); }).catch(() => null);
    return () => { live = false; };
  }, [a.key, a.related.length, audience]);
  async function send(helpful: boolean) {
    setVote(helpful); setVoteErr("");
    const r = await fetch("/api/help/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: a.key, helpful, audience }) }).catch(() => null);
    if (!r || !r.ok) setVoteErr("Couldn't record that.");
  }
  return (
    <article className="hp-article">
      <h3>{a.title}</h3>
      <p>{a.summary}</p>
      {a.steps.length > 0 && <ol>{a.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      {a.who && <div className="hp-meta"><b>Who can do this</b>{a.who}</div>}
      {a.affects && <div className="hp-meta affects"><b>What it changes</b>{a.affects}</div>}
      {a.href && <Link href={a.href} className="btn btn-brass btn-sm" onClick={onNavigate} style={{ textDecoration: "none" }}>Open the page →</Link>}
      {related.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="hp-section">Related</div>
          {related.map((r) => onRelated
            ? <button key={r.key} type="button" className="hp-back" style={{ display: "block", fontWeight: 600, marginBottom: 4 }} onClick={() => onRelated(r.key)}>{r.title}</button>
            : <Link key={r.key} href={`${helpHome(audience)}?a=${r.key}`} style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{r.title}</Link>)}
        </div>
      )}
      <div className="hp-vote" aria-live="polite">
        {vote === null ? (
          <>Did this answer your question?
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => send(true)}>Yes</button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => send(false)}>No</button></>
        ) : vote ? <span>Thanks — glad it helped.</span> : <span>Thanks. Ask for help below and someone will answer you.</span>}
        {voteErr && <span style={{ color: "var(--rust)" }}>{voteErr}</span>}
      </div>
    </article>
  );
}

/** "Ask for help": a request that goes straight to the people who can answer it. */
export function AskForm({ audience, query, category, path, onDone }: { audience: Audience; query?: string; category?: string; path?: string; onDone?: () => void }) {
  const desks = DESKS.filter((d) => (audience === "student" ? d.students : true));
  const [desk, setDesk] = useState<string>(deskForCategory(category));
  const [subject, setSubject] = useState((query || "").slice(0, 160));
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<{ id: string; who: string } | null>(null);
  useEffect(() => { setDesk(deskForCategory(category)); }, [category]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/help/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desk, subject, body, query, page: path, audience }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) { setErr(d.error || "Couldn't send it. Try again."); return; }
    setSent({ id: d.id, who: d.who });
    onDone?.();
  }
  if (sent) return (
    <div className="hp-ask" role="status">
      <b style={{ fontSize: 13.5 }}>Sent to {sent.who}.</b>
      <p style={{ fontSize: 12.5, color: "var(--slate)", margin: "4px 0 8px" }}>{audience === "student" ? "Their answer will appear under My help requests on the Help page." : "You'll get a notification when they reply."}</p>
      <Link href={audience === "student" ? `/student/help?id=${sent.id}#requests` : `/help/requests?id=${sent.id}`} style={{ fontSize: 13, fontWeight: 700 }}>See the request →</Link>
    </div>
  );
  const chosen = desks.find((d) => d.key === desk);
  return (
    <form className="hp-ask" onSubmit={submit}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Still stuck? Ask for help</div>
      <label>What is it about?
        <select value={desk} onChange={(e) => setDesk(e.target.value)}>{desks.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
      </label>
      {chosen && <div style={{ fontSize: 12, color: "var(--slate)", margin: "-4px 0 8px" }}>Goes to {chosen.who}.</div>}
      <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} required minLength={4} /></label>
      <label>What happened? What did you try?<textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} required minLength={10} placeholder="For example: the page, the button you pressed and the message you saw." /></label>
      {err && <div style={{ color: "var(--rust)", fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
      <button type="submit" className="btn btn-brass btn-sm" disabled={busy || subject.trim().length < 4 || body.trim().length < 10}>{busy ? "Sending…" : "Send request"}</button>
    </form>
  );
}
