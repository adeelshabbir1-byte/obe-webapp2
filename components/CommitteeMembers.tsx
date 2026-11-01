"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type M = { id: string; name: string; external: boolean; organisation: string | null; role: string; from?: string; until?: string; ending: boolean };
type P = { id: string; name: string; note?: string };
const post = (b: unknown) => fetch("/api/cmt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not save." }));

// Members first (UX review): role in the committee and term, suggested people to tick, add by email, replace with
// history, an external expert with a guest link, the committee's own composition rule, and the Secretary.
export default function CommitteeMembers({ committeeId, members, roles, suggested, staff, rules, secretary, canSecretary, manage }: {
  committeeId: string; members: M[]; roles: string[]; suggested: P[]; staff: P[]; rules: { role: string; min: number; have: number; ok: boolean }[]; secretary: string; canSecretary: boolean; manage: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState(""); const [pick, setPick] = useState<Set<string>>(new Set()); const [emails, setEmails] = useState("");
  const [edit, setEdit] = useState<string | null>(null); const [ed, setEd] = useState<{ role: string; from: string; until: string }>({ role: "Member", from: "", until: "" });
  const [rep, setRep] = useState<{ id: string; to: string; note: string } | null>(null);
  const [ext, setExt] = useState({ name: "", email: "", organisation: "" }); const [showExt, setShowExt] = useState(false);
  const [rl, setRl] = useState(rules.map((r) => ({ role: r.role, min: r.min }))); const [showRules, setShowRules] = useState(false);
  const [sec, setSec] = useState(secretary);
  const done = (r: { error?: string; message?: string }, ok = "Saved ✓") => { setMsg(r.error || r.message || ok); if (!r.error) router.refresh(); };
  const cell = { padding: "6px 8px", borderBottom: "1px solid var(--line, #eee)", fontSize: 13 } as const;
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>Members ({members.length})</h2>
        {canSecretary ? <span style={{ fontSize: 13 }}>Secretary <select value={sec} onChange={(e) => setSec(e.target.value)}><option value="">— none —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> <button type="button" className="btn btn-sm" onClick={async () => done(await post({ action: "secretary", committeeId, userId: sec }), "Secretary named ✓ — they were told")}>Name</button></span> : null}
      </div>
      {rules.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>{rules.map((r) => <span key={r.role} style={{ fontSize: 12.5, padding: "2px 8px", borderRadius: 10, background: r.ok ? "#E6F4EA" : "#FDECEA", color: r.ok ? "#1E6B3A" : "#B3261E" }}>{r.ok ? "✓" : "✗"} {r.role}: {r.have} of at least {r.min}</span>)}</div>}
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}><tbody>
        {members.map((m) => <tr key={m.id}>
          <td style={cell}><b>{m.name}</b>{m.external && <span className="small-note"> · external{m.organisation ? `, ${m.organisation}` : ""}</span>}</td>
          <td style={cell}>{edit === m.id ? <select value={ed.role} onChange={(e) => setEd({ ...ed, role: e.target.value })}>{roles.map((r) => <option key={r}>{r}</option>)}</select> : m.role}</td>
          <td style={{ ...cell, color: m.ending ? "#B26A00" : undefined }}>{edit === m.id ? <><input type="date" value={ed.from} onChange={(e) => setEd({ ...ed, from: e.target.value })} /> – <input type="date" value={ed.until} onChange={(e) => setEd({ ...ed, until: e.target.value })} /></> : m.from || m.until ? `${m.from || "…"} – ${m.until || "…"}${m.ending ? " · ends soon" : ""}` : <span className="small-note">no term set</span>}</td>
          {manage && <td style={{ ...cell, whiteSpace: "nowrap", textAlign: "right" }}>
            {edit === m.id ? <><button type="button" className="btn btn-sm" onClick={async () => { done(await post({ action: "memberMeta", committeeId, memberId: m.id, ...ed })); setEdit(null); }}>Save</button> <button type="button" className="btn-link" onClick={() => setEdit(null)}>Cancel</button></>
              : <><button type="button" className="btn-link" onClick={() => { setEdit(m.id); setEd({ role: m.role, from: m.from || "", until: m.until || "" }); }}>Role & term</button> · {!m.external && <><button type="button" className="btn-link" onClick={() => setRep({ id: m.id, to: "", note: "" })}>Replace</button> · </>}<button type="button" className="btn-link" onClick={async () => { if (confirm(`Remove ${m.name} from the committee?`)) done(await post({ action: "removeMember", memberId: m.id }), "Removed"); }}>Remove</button></>}
          </td>}
        </tr>)}
        {!members.length && <tr><td style={cell} className="small-note">No members yet — tick the suggested people below, or add by email.</td></tr>}
      </tbody></table></div>
      {rep && <div style={{ margin: "8px 0", padding: 8, borderRadius: 8, background: "rgba(27,95,170,.06)", fontSize: 13 }}>Replace {members.find((m) => m.id === rep.id)?.name} with <select value={rep.to} onChange={(e) => setRep({ ...rep, to: e.target.value })}><option value="">choose…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> <input value={rep.note} onChange={(e) => setRep({ ...rep, note: e.target.value })} placeholder="reason (kept in history)" style={{ width: 200 }} /> <button type="button" className="btn btn-sm" disabled={!rep.to} onClick={async () => { done(await post({ action: "replaceMember", committeeId, memberId: rep.id, userId: rep.to, note: rep.note }), "Replaced ✓"); setRep(null); }}>Replace</button> <button type="button" className="btn-link" onClick={() => setRep(null)}>Cancel</button></div>}
      {manage && <>
        {suggested.length > 0 && <div style={{ marginTop: 12 }}><b style={{ fontSize: 13 }}>Suggested from the org chart</b> <span className="small-note">tick and add</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 4 }}>{suggested.map((s) => <label key={s.id} style={{ fontSize: 13 }}><input type="checkbox" checked={pick.has(s.id)} onChange={() => { const n = new Set(pick); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); setPick(n); }} /> {s.name}{s.note ? <span className="small-note"> · {s.note}</span> : null}</label>)}</div>
          <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} disabled={!pick.size} onClick={async () => { done(await post({ action: "bulkAdd", committeeId, userIds: Array.from(pick) })); setPick(new Set()); }}>Add {pick.size || ""} ticked</button></div>}
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="Add staff by email (several, comma-separated)" style={{ flex: "1 1 280px" }} />
          <button type="button" className="btn btn-sm" disabled={!emails.trim()} onClick={async () => { done(await post({ action: "bulkAdd", committeeId, emails })); setEmails(""); }}>Add</button>
          <button type="button" className="btn-link" onClick={() => setShowExt(!showExt)}>+ External expert</button>
          <button type="button" className="btn-link" onClick={() => setShowRules(!showRules)}>Composition rule</button>
        </div>
        {showExt && <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}><input value={ext.name} onChange={(e) => setExt({ ...ext, name: e.target.value })} placeholder="Name" /><input value={ext.organisation} onChange={(e) => setExt({ ...ext, organisation: e.target.value })} placeholder="University / company" /><input value={ext.email} onChange={(e) => setExt({ ...ext, email: e.target.value })} placeholder="Email" /><button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "addMember", committeeId, ...ext, external: true }); setMsg(r.error || r.message || "Added ✓"); if (!r.error) { setExt({ name: "", email: "", organisation: "" }); router.refresh(); } }}>Add and make a guest link</button></div>}
        {showRules && <div style={{ marginTop: 8, fontSize: 13 }}><span className="small-note">Your university&apos;s own rule for this committee (from its statutes) — e.g. at least 2 External experts.</span>
          {rl.map((r, i) => <div key={i} style={{ display: "flex", gap: 6, marginTop: 4 }}><select value={r.role} onChange={(e) => setRl(rl.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}>{roles.map((x) => <option key={x}>{x}</option>)}</select> at least <input type="number" value={r.min} onChange={(e) => setRl(rl.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)))} style={{ width: 60 }} /><button type="button" className="btn-link" onClick={() => setRl(rl.filter((_, j) => j !== i))}>×</button></div>)}
          <button type="button" className="btn-link" onClick={() => setRl([...rl, { role: "External expert", min: 1 }])}>+ rule</button> <button type="button" className="btn btn-sm" onClick={async () => done(await post({ action: "rules", committeeId, rules: rl }))}>Save rule</button></div>}
      </>}
      {msg && <p className="small-note" style={{ marginBottom: 0 }}>{msg}</p>}
    </div>
  );
}
