"use client";

import { useCallback, useEffect, useState } from "react";
import type { Audience } from "./HelpParts";
import { CATEGORIES, PRIORITIES } from "../../lib/help/deskLabels";

type Row = { id: string; desk: string; deskLabel: string; subject: string; body: string; query: string | null; page: string | null; status: string; requesterName: string; requesterRole: string; createdAt: string; lastActivityAt: string; category: string | null; priority: string | null; tags: string; sla: { hoursLeft: number; overdue: boolean } | null; hasScreenshot: boolean; institute?: string | null; mine: boolean; canAnswer: boolean };
type Detail = { ticket: Row & { routedTo: string[]; screenshot: string | null; browser: string | null; pageUrl: string | null; fixNote: string | null; releaseRef: string | null }; messages: { id: string; authorName: string; body: string; createdAt: string; fromRequester: boolean }[]; desks: { key: string; label: string }[] };
const STATUS: Record<string, string> = { OPEN: "Waiting for an answer", IN_PROGRESS: "Being worked on", WAITING: "Waiting for the person who asked", ANSWERED: "Answered", RESOLVED: "Resolved", CLOSED: "Closed" };
const CAT = Object.fromEntries(CATEGORIES), PRI = Object.fromEntries(PRIORITIES);
const PRI_COLOUR: Record<string, string> = { URGENT: "#B3261E", HIGH: "#B45309", NORMAL: "#5B5B5B", LOW: "#5B5B5B" };
const slaText = (s: Row["sla"]) => (!s ? "" : s.overdue ? `answer overdue by ${Math.abs(s.hoursLeft) < 48 ? `${Math.abs(Math.round(s.hoursLeft))} h` : `${Math.round(Math.abs(s.hoursLeft) / 24)} days`}` : `answer due in ${s.hoursLeft < 48 ? `${Math.max(0, Math.round(s.hoursLeft))} h` : `${Math.round(s.hoursLeft / 24)} days`}`);
function Badges({ r }: { r: Row }) {
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", marginLeft: 6, verticalAlign: "middle" }}>
      {r.priority && r.priority !== "NORMAL" && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", background: PRI_COLOUR[r.priority] || "#555", borderRadius: 4, padding: "0 5px" }}>{r.priority}</span>}
      {r.category && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#4A3B39", background: "#F1E8E6", borderRadius: 4, padding: "0 5px" }}>{CAT[r.category] || r.category}</span>}
      {r.sla && <span style={{ fontSize: 10.5, fontWeight: 700, color: r.sla.overdue ? "#B3261E" : "#1E6B3A" }}>{slaText(r.sla)}</span>}
    </span>
  );
}
const when = (d: string) => new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function call(method: string, body: unknown) {
  const r = await fetch("/api/help/tickets", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  return r && r.ok ? { ok: true as const, d } : { ok: false as const, error: (d as { error?: string }).error || "Something went wrong." };
}

/** My help requests and, for staff, the requests routed to me — with the conversation and what can be done next. */
export default function HelpRequests({ audience, canPublish = false, initialId, superUser = false }: { audience: Audience; canPublish?: boolean; initialId?: string; superUser?: boolean }) {
  const [mine, setMine] = useState<Row[]>([]);
  const [inbox, setInbox] = useState<Row[]>([]);
  const [tab, setTab] = useState<"mine" | "inbox">("mine");
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState<string | null>(initialId || null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [forwardTo, setForwardTo] = useState("");
  const [faq, setFaq] = useState<{ title: string; summary: string } | null>(null);
  const [all, setAll] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [tags, setTags] = useState("");
  const [fix, setFix] = useState<{ note: string; ref: string } | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/help/tickets?audience=${audience}${all ? "&scope=all" : ""}`).then((r) => r.json()).catch(() => ({ error: "Couldn't load your requests." }));
    if (d.error) { setErr(d.error); return; }
    setErr(""); setMine(d.mine || []); setInbox(d.inbox || []);
    if ((d.inbox || []).length && !(d.mine || []).length) setTab("inbox");
  }, [audience, all]);
  const loadDetail = useCallback(async (id: string) => {
    const d = await fetch(`/api/help/tickets?id=${encodeURIComponent(id)}&audience=${audience}`).then((r) => r.json()).catch(() => null);
    if (!d || d.error) { setDetail(null); setMsg(d?.error || "That request can't be opened."); return; }
    setDetail(d); setMsg(""); setForwardTo(""); setFaq(null); setTags(d.ticket?.tags || ""); setFix(null);
  }, [audience]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (openId) loadDetail(openId); else setDetail(null); }, [openId, loadDetail]);

  function pick(id: string) {
    setOpenId(id); setReply("");
    try { const u = new URL(window.location.href); u.searchParams.set("id", id); window.history.replaceState(null, "", u.toString()); } catch { /* ignore */ }
  }
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!detail) return;
    setBusy(true); setMsg("");
    const r = await call("PATCH", { id: detail.ticket.id, action, audience, ...extra });
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    if (action === "reply") setReply("");
    await Promise.all([load(), loadDetail(detail.ticket.id)]);
  }
  async function publish() {
    if (!detail || !faq) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/help/articles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "FAQ", category: "help", title: faq.title, summary: faq.summary, roles: [], sourceTicketId: detail.ticket.id }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) { setMsg(d.error || "Couldn't save it."); return; }
    setFaq(null); setMsg("Saved as one of your institute's FAQs — everyone can now find it in Help. Edit it under Manage help.");
  }

  const rows = (tab === "mine" ? mine : inbox).filter((r) => (!statusFilter || r.status === statusFilter) && (!tagFilter || r.tags.includes(tagFilter.toLowerCase())));
  const t = detail?.ticket;
  const lastAnswer = detail ? [...detail.messages].reverse().find((m) => !m.fromRequester)?.body || "" : "";

  return (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", alignItems: "start" }}>
      <div className="card" style={{ margin: 0 }}>
        {audience === "staff" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button type="button" className={`btn btn-sm ${tab === "mine" ? "btn-brass" : "btn-secondary"}`} onClick={() => setTab("mine")}>I asked ({mine.length})</button>
            <button type="button" className={`btn btn-sm ${tab === "inbox" ? "btn-brass" : "btn-secondary"}`} onClick={() => setTab("inbox")}>For me to answer ({inbox.filter((r) => r.status === "OPEN").length} waiting)</button>
          </div>
        )}
        {audience === "staff" && tab === "inbox" && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, fontSize: 12.5, alignItems: "center" }}>
            {superUser && <label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Every institute</label>}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status" style={{ padding: "3px 6px" }}><option value="">Any status</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="tag" aria-label="Tag" style={{ width: 90, padding: "3px 6px" }} />
          </div>
        )}
        {err && <div className="err">{err}</div>}
        {!err && rows.length === 0 && <p className="small-note" style={{ margin: 0 }}>{tab === "mine" ? "No help requests yet. Ask from the help panel (the ? at the top) when the answers don't cover your problem." : "Nothing has been routed to you."}</p>}
        {rows.map((r) => (
          <button key={r.id} type="button" className="hp-item" onClick={() => pick(r.id)} style={openId === r.id ? { background: "#FAF6F5", borderColor: "var(--line)" } : undefined}>
            <b>{r.subject} <span className={`hp-status ${r.status}`} style={{ marginLeft: 6 }}>{r.status === "WAITING" && r.mine ? "Waiting for you" : STATUS[r.status] || r.status}</span><Badges r={r} /></b>
            <span>{tab === "inbox" ? `${r.requesterName} · ` : ""}{r.institute ? `${r.institute} · ` : ""}{r.deskLabel} · {when(r.lastActivityAt)}{r.tags ? ` · ${r.tags}` : ""}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ margin: 0 }}>
        {!t ? <p className="small-note" style={{ margin: 0 }}>{msg || "Pick a request to see the conversation."}</p> : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{t.subject}</h3>
              <span className={`hp-status ${t.status}`}>{t.status === "WAITING" && t.mine ? "Waiting for you — please reply" : STATUS[t.status] || t.status}</span>
            </div>
            <div style={{ margin: "4px 0 0" }}><Badges r={t} />{t.priority && <span className="small-note" style={{ marginLeft: 6 }}>{PRI[t.priority]}</span>}</div>
            <p className="small-note" style={{ margin: "4px 0 10px" }}>
              {t.deskLabel} · asked by {t.requesterName} on {when(t.createdAt)}{t.routedTo.length ? ` · with ${t.routedTo.join(", ")}` : ""}{t.page ? ` · from ${t.page}` : ""}
            </p>
            <div className="hp-msg"><small>{t.requesterName} · {when(t.createdAt)}</small>{t.body}</div>
            {t.screenshot && <a href={t.screenshot} target="_blank" rel="noreferrer" title="Open the picture of the page"><img src={t.screenshot} alt="The page when the request was raised" style={{ maxWidth: "100%", maxHeight: 220, border: "1px solid var(--line)", borderRadius: 6, margin: "6px 0" }} /></a>}
            {t.canAnswer && (t.pageUrl || t.browser) && <p className="small-note" style={{ margin: "2px 0 8px", wordBreak: "break-all" }}>{t.pageUrl ? <>Page: {t.pageUrl}<br /></> : null}{t.browser ? `Browser: ${t.browser}` : ""} · role {t.requesterRole}</p>}
            {(t.fixNote || t.releaseRef) && <div className="hp-msg theirs" style={{ borderLeft: "3px solid #1E6B3A" }}><small>Fix{t.releaseRef ? ` · release ${t.releaseRef}` : ""}</small>{t.fixNote || ""}</div>}
            {detail!.messages.map((m) => <div key={m.id} className={`hp-msg ${m.fromRequester ? "" : "theirs"}`}><small>{m.authorName} · {when(m.createdAt)}</small>{m.body}</div>)}

            {t.status !== "CLOSED" && (t.mine || t.canAnswer) && (
              <div style={{ marginTop: 10 }}>
                <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t.mine ? "Add more detail or reply…" : "Write the answer…"} aria-label="Reply" style={{ width: "100%" }} maxLength={4000} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  <button type="button" className="btn btn-brass btn-sm" disabled={busy || reply.trim().length < 2} onClick={() => act("reply", { body: reply })}>{t.mine ? "Send" : "Send answer"}</button>
                  {t.status !== "RESOLVED" && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act("resolve")}>{t.mine ? "It's solved" : "Mark resolved"}</button>}
                  {t.mine && t.status === "RESOLVED" && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act("reopen")}>Not solved — reopen</button>}
                  {t.mine && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { if (window.confirm("Close this request? Nobody can reply to it after that.")) act("close"); }}>Close</button>}
                </div>
              </div>
            )}
            {t.canAnswer && t.status !== "CLOSED" && (
              <div style={{ display: "grid", gap: 6, marginTop: 10, fontSize: 12.5 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {t.status !== "IN_PROGRESS" && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act("status", { status: "IN_PROGRESS" })}>Working on it</button>}
                  {t.status !== "WAITING" && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act("status", { status: "WAITING", body: reply })}>Need more information from them</button>}
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setFix(fix ? null : { note: t.fixNote || "", ref: t.releaseRef || "" })}>{t.fixNote || t.releaseRef ? "Edit the fix note" : "Record the fix / release"}</button>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, comma separated" aria-label="Tags" style={{ flex: "1 1 160px", padding: "4px 6px" }} />
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy || tags === t.tags} onClick={() => act("tags", { tags })}>Save tags</button>
                </div>
                {fix && (
                  <div className="hp-ask">
                    <label>What was fixed<textarea rows={3} value={fix.note} onChange={(e) => setFix({ ...fix, note: e.target.value })} maxLength={2000} /></label>
                    <label>Release / version (optional)<input value={fix.ref} onChange={(e) => setFix({ ...fix, ref: e.target.value })} maxLength={120} placeholder="e.g. 2026.10.24" /></label>
                    <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={async () => { await act("fix", { fixNote: fix.note, releaseRef: fix.ref }); setFix(null); }}>Save</button>
                  </div>
                )}
              </div>
            )}
            {t.canAnswer && t.status !== "CLOSED" && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 10, fontSize: 12.5 }}>
                <span className="small-note">Not for you?</span>
                <select value={forwardTo} onChange={(e) => setForwardTo(e.target.value)} aria-label="Send to another desk" style={{ padding: "4px 6px" }}>
                  <option value="">Send to another desk…</option>
                  {detail!.desks.filter((d) => d.key !== t.desk).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !forwardTo} onClick={() => act("forward", { desk: forwardTo })}>Send</button>
              </div>
            )}
            {canPublish && t.canAnswer && lastAnswer && !faq && (
              <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => setFaq({ title: t.subject, summary: lastAnswer })}>Save the answer as an FAQ</button>
            )}
            {faq && (
              <div className="hp-ask">
                <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>New FAQ for your institute</div>
                <label>Question<input value={faq.title} onChange={(e) => setFaq({ ...faq, title: e.target.value })} maxLength={200} /></label>
                <label>Answer<textarea rows={4} value={faq.summary} onChange={(e) => setFaq({ ...faq, summary: e.target.value })} maxLength={3000} /></label>
                <span className="small-note">Remove names and anything personal before saving — everyone in the institute will see it.</span>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button type="button" className="btn btn-brass btn-sm" disabled={busy || faq.title.trim().length < 5 || faq.summary.trim().length < 10} onClick={publish}>Save FAQ</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFaq(null)}>Cancel</button>
                </div>
              </div>
            )}
            {msg && <p style={{ fontSize: 12.5, marginTop: 8, color: /Saved/.test(msg) ? "var(--sage)" : "var(--rust)" }}>{msg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
