"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type OwnArticle = { id: string; kind: string; category: string; title: string; summary: string; steps: string[]; whoCan: string; affects: string; roles: string[]; pages: string[]; keywords: string[]; href: string; published: boolean; updatedAt: string };
type Opt = { key: string; label: string };
const blank = (): OwnArticle => ({ id: "", kind: "FAQ", category: "help", title: "", summary: "", steps: [], whoCan: "", affects: "", roles: [], pages: [], keywords: [], href: "", published: true, updatedAt: "" });

/** The Institute Head's (or Super User's) own help articles, what people searched for and didn't find, and what they found unhelpful. */
export default function HelpManager({ own, categories, roles, unanswered, feedback, scopeLabel }: {
  own: OwnArticle[]; categories: Opt[]; roles: Opt[]; scopeLabel: string;
  unanswered: { query: string; count: number; last: string }[];
  feedback: { key: string; title: string; yes: number; no: number }[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<OwnArticle | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    if (!edit) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/help/articles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...edit, id: edit.id || undefined, steps: edit.steps.filter((s) => s.trim()) }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) { setMsg({ ok: false, text: d.error || "Couldn't save it." }); return; }
    setMsg({ ok: true, text: "Saved." }); setEdit(null); router.refresh();
  }
  async function remove(a: OwnArticle) {
    if (!window.confirm(`Delete “${a.title}”?`)) return;
    setBusy(true);
    const r = await fetch(`/api/help/articles?id=${encodeURIComponent(a.id)}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    setMsg(r && r.ok ? { ok: true, text: "Deleted." } : { ok: false, text: "Couldn't delete it." });
    router.refresh();
  }
  const set = <K extends keyof OwnArticle>(k: K, v: OwnArticle[K]) => setEdit((e) => (e ? { ...e, [k]: v } : e));
  const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const label: React.CSSProperties = { display: "grid", gap: 4, fontSize: 12, color: "var(--slate)" };
  const field: React.CSSProperties = { padding: "6px 8px", width: "100%" };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card" style={{ margin: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{scopeLabel} ({own.length})</h3>
          <button type="button" className="btn btn-brass btn-sm" onClick={() => { setEdit(blank()); setMsg(null); }}>New article</button>
        </div>
        <p className="small-note" style={{ margin: "4px 0 10px" }}>They appear in search and in the help panel beside the built-in guides, marked “Your institute”. Write the question the way people ask it.</p>
        {own.length === 0 && !edit && <p className="small-note" style={{ margin: 0 }}>None yet. Start with the searches below that found nothing, or save a good answer from a help request as an FAQ.</p>}
        {own.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Title</th><th>Type</th><th>Topic</th><th>For</th><th>Shown</th><th></th></tr></thead>
              <tbody>{own.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td><td>{a.kind === "GUIDE" ? "Guide" : "FAQ"}</td><td>{categories.find((c) => c.key === a.category)?.label || a.category}</td>
                  <td style={{ fontSize: 12 }}>{a.roles.length ? a.roles.map((r) => roles.find((x) => x.key === r)?.label || r).join(", ") : "All staff"}</td>
                  <td>{a.published ? "Yes" : "Draft"}</td>
                  <td style={{ whiteSpace: "nowrap" }}><button type="button" className="act" onClick={() => { setEdit({ ...a }); setMsg(null); }}>Edit</button> <button type="button" className="act act-danger" disabled={busy} onClick={() => remove(a)}>Delete</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {edit && (
          <div className="hp-ask" style={{ marginTop: 12 }}>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
              <label style={label}>Type<select value={edit.kind} onChange={(e) => set("kind", e.target.value)} style={field}><option value="FAQ">Question and answer</option><option value="GUIDE">Step-by-step guide</option></select></label>
              <label style={label}>Topic<select value={edit.category} onChange={(e) => set("category", e.target.value)} style={field}>{categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
              <label style={label}>Page to open (optional)<input value={edit.href} onChange={(e) => set("href", e.target.value)} placeholder="/coordinator/students" style={field} /></label>
            </div>
            <label style={{ ...label, marginTop: 10 }}>{edit.kind === "GUIDE" ? "Task (e.g. “Book a lab for an extra class”)" : "Question (e.g. “Where do I collect my fee challan?”)"}<input value={edit.title} onChange={(e) => set("title", e.target.value)} maxLength={200} style={field} /></label>
            <label style={label}>Answer, in a few sentences<textarea rows={3} value={edit.summary} onChange={(e) => set("summary", e.target.value)} maxLength={3000} style={field} /></label>
            {edit.kind === "GUIDE" && <label style={label}>Steps, one per line<textarea rows={4} value={edit.steps.join("\n")} onChange={(e) => set("steps", e.target.value.split("\n"))} style={field} /></label>}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
              <label style={label}>Who can do it (optional)<input value={edit.whoCan} onChange={(e) => set("whoCan", e.target.value)} style={field} /></label>
              <label style={label}>What it changes (optional)<input value={edit.affects} onChange={(e) => set("affects", e.target.value)} style={field} /></label>
              <label style={label}>Other words people use (comma-separated)<input value={edit.keywords.join(", ")} onChange={(e) => set("keywords", csv(e.target.value))} style={field} /></label>
              <label style={label}>Suggest it on pages starting with (comma-separated)<input value={edit.pages.join(", ")} onChange={(e) => set("pages", csv(e.target.value))} placeholder="/student/registration" style={field} /></label>
            </div>
            <div style={{ ...label, marginTop: 10 }}>Shown to (none ticked = all staff)
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", color: "var(--ink)", fontSize: 12.5 }}>
                {roles.map((r) => (
                  <label key={r.key} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input type="checkbox" checked={edit.roles.includes(r.key)} onChange={(e) => set("roles", e.target.checked ? [...edit.roles, r.key] : edit.roles.filter((x) => x !== r.key))} /> {r.label}
                  </label>
                ))}
              </div>
            </div>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, marginTop: 10 }}><input type="checkbox" checked={edit.published} onChange={(e) => set("published", e.target.checked)} /> Show it now (untick to keep it as a draft)</label>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button type="button" className="btn btn-brass btn-sm" disabled={busy || edit.title.trim().length < 5 || edit.summary.trim().length < 10} onClick={save}>{busy ? "Saving…" : "Save"}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        )}
        {msg && <p style={{ fontSize: 12.5, margin: "8px 0 0", color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</p>}
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", alignItems: "start" }}>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Searches that found nothing</h3>
          <p className="small-note" style={{ margin: "0 0 8px" }}>Last 90 days. Each one is a question your people asked that no article answers yet.</p>
          {unanswered.length === 0 ? <p className="small-note" style={{ margin: 0 }}>None — every search found something.</p> : (
            <table style={{ fontSize: 13 }}><thead><tr><th>Searched for</th><th>Times</th><th>Last</th><th></th></tr></thead>
              <tbody>{unanswered.map((u) => (
                <tr key={u.query}><td>{u.query}</td><td>{u.count}</td><td>{new Date(u.last).toLocaleDateString()}</td>
                  <td><button type="button" className="act" onClick={() => { setEdit({ ...blank(), title: u.query.charAt(0).toUpperCase() + u.query.slice(1), keywords: [u.query] }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Answer it</button></td></tr>
              ))}</tbody></table>
          )}
        </div>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>How helpful the answers are</h3>
          <p className="small-note" style={{ margin: "0 0 8px" }}>Votes from “Did this answer your question?”, least helpful first.</p>
          {feedback.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No votes yet.</p> : (
            <table style={{ fontSize: 13 }}><thead><tr><th>Article</th><th>Yes</th><th>No</th></tr></thead>
              <tbody>{feedback.map((f) => <tr key={f.key}><td><a href={`/help?a=${f.key}`}>{f.title}</a></td><td>{f.yes}</td><td style={{ color: f.no > f.yes ? "var(--rust)" : undefined }}>{f.no}</td></tr>)}</tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}
