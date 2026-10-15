"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Client pieces of the Final Year Projects screens. Every action posts to one of the FYP APIs and refreshes the page.

export async function fypPost(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true as const, data } : { ok: false as const, error: (data.error as string) || "Could not save." };
}

/** A button that posts one action (optionally asking for a note or confirmation first). */
export function ActionButton({ url, body, label, className = "btn btn-brass btn-sm", confirmText, askNote, noteRequired, done }: {
  url: string; body: Record<string, unknown>; label: string; className?: string; confirmText?: string; askNote?: string; noteRequired?: boolean; done?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go() {
    if (confirmText && !confirm(confirmText)) return;
    let note: string | null = "";
    if (askNote) { note = prompt(askNote); if (note === null) return; if (noteRequired && !note.trim()) return; }
    setBusy(true); setMsg(null);
    const r = await fypPost(url, { ...body, ...(askNote ? { note } : {}) });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    if (done) setMsg({ ok: true, text: done });
    router.refresh();
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className={className} disabled={busy} onClick={go}>{busy ? "…" : label}</button>
      {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
    </span>
  );
}

type Field = { name: string; label: string; type?: "text" | "textarea" | "number" | "select" | "date" | "datetime-local" | "checkbox" | "plos"; options?: [string, string][]; width?: number; placeholder?: string; full?: boolean };
/** A small form posting { action, ...fixed, ...fields }. */
export function ActionForm({ url, fixed, fields, initial = {}, submit, onDone, done, collapsed, openLabel }: {
  url: string; fixed: Record<string, unknown>; fields: Field[]; initial?: Record<string, unknown>; submit: string; onDone?: (data: Record<string, unknown>) => void; done?: string; collapsed?: boolean; openLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!collapsed);
  const [v, setV] = useState<Record<string, unknown>>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>{openLabel || submit}</button>;
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fypPost(url, { ...fixed, ...v });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg(done ? { ok: true, text: done } : null);
    onDone?.(r.data);
    if (collapsed) setOpen(false);
    router.refresh();
  }
  return (
    <form onSubmit={go} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", padding: 12, border: "1px dashed var(--line)", borderRadius: 8, margin: "8px 0" }}>
      {fields.map((f) => {
        const val = v[f.name];
        const set = (x: unknown) => setV((p) => ({ ...p, [f.name]: x }));
        const style = { width: f.width || 180 };
        let input: React.ReactNode;
        if (f.type === "textarea") input = <textarea rows={3} value={String(val ?? "")} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} style={{ width: "100%" }} />;
        else if (f.type === "select") input = <select value={String(val ?? "")} onChange={(e) => set(e.target.value)} style={style}>{f.options!.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>;
        else if (f.type === "checkbox") input = <input type="checkbox" checked={!!val} onChange={(e) => set(e.target.checked)} />;
        else if (f.type === "plos") input = <input value={Array.isArray(val) ? (val as number[]).join(", ") : String(val ?? "")} onChange={(e) => set(e.target.value.split(/[^0-9]+/).filter(Boolean).map(Number))} placeholder="e.g. 3, 4, 5" style={style} />;
        else input = <input type={f.type || "text"} value={String(val ?? "")} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} style={style} step={f.type === "number" ? "any" : undefined} />;
        return (
          <label key={f.name} style={{ fontSize: 12, display: f.type === "checkbox" ? "flex" : "grid", gap: f.type === "checkbox" ? 6 : 3, alignItems: f.type === "checkbox" ? "center" : undefined, flex: f.full || f.type === "textarea" ? "1 1 100%" : undefined }}>
            {f.type === "checkbox" ? <>{input} {f.label}</> : <>{f.label}{input}</>}
          </label>
        );
      })}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="submit" className="btn btn-brass btn-sm" disabled={busy}>{busy ? "Saving…" : submit}</button>
        {collapsed && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>}
        {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
      </div>
    </form>
  );
}

type Criterion = { id: string; name: string; description: string | null; bloomLevel: string | null; ploNumber: number | null; maxScore: number; appliesTo: string };
type Member = { id: string; name: string; rollNumber: string };
/**
 * The rubric score sheet one evaluator fills for a group at a milestone. Group criteria take one score for the whole
 * group; individual criteria one per student. A comment and an "on track / at risk" call go with it.
 */
export function ScoreSheet({ url, groupId, milestoneId, criteria, members, existing, comments: c0, recommendation: r0, roleText, readOnly }: {
  url: string; groupId: string; milestoneId: string; criteria: Criterion[]; members: Member[]; existing: Record<string, number>; comments?: string | null; recommendation?: string; roleText: string; readOnly?: boolean;
}) {
  const router = useRouter();
  const key = (cid: string, sid: string) => `${cid}|${sid}`;
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(existing).map(([k, n]) => [k, String(n)])));
  const [comments, setComments] = useState(c0 || "");
  const [rec, setRec] = useState(r0 || "ON_TRACK");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const setGroup = (cid: string, v: string) => setVals((p) => ({ ...p, ...Object.fromEntries(members.map((m) => [key(cid, m.id), v])) }));
  const total = (sid: string) => criteria.reduce((n, c) => n + (Number(vals[key(c.id, sid)]) || 0), 0);
  const max = criteria.reduce((n, c) => n + c.maxScore, 0);
  async function save() {
    const scores: { criterionId: string; studentId: string; score: number }[] = [];
    for (const c of criteria) for (const m of members) {
      const raw = vals[key(c.id, m.id)];
      if (raw === undefined || raw === "") { setMsg({ ok: false, text: `Score "${c.name}" for every student.` }); return; }
      scores.push({ criterionId: c.id, studentId: m.id, score: Number(raw) });
    }
    setBusy(true); setMsg(null);
    const r = await fypPost(url, { action: "saveScores", groupId, milestoneId, scores, comments, recommendation: rec });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: "Saved." });
    router.refresh();
  }
  const cell = (c: Criterion, sid: string, onChange: (v: string) => void) => (
    <input type="number" min={0} max={c.maxScore} step="0.5" value={vals[key(c.id, sid)] ?? ""} disabled={readOnly} onChange={(e) => onChange(e.target.value)} aria-label={`${c.name} score`} style={{ width: 64, textAlign: "center" }} />
  );
  return (
    <div>
      <p className="small-note" style={{ marginTop: 0 }}>Scoring as <b>{roleText}</b>. Group criteria are scored once for the whole group; individual criteria for each student.</p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr><th>Criterion</th><th style={{ width: 90 }}>Level · PLO</th><th style={{ width: 60 }}>Max</th>{members.map((m) => <th key={m.id} style={{ textAlign: "center" }}>{m.name}<div className="small-note">{m.rollNumber}</div></th>)}</tr>
          </thead>
          <tbody>
            {criteria.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b>{c.description && <div className="small-note">{c.description}</div>}</td>
                <td className="small-note">{[c.bloomLevel, c.ploNumber ? `PLO-${c.ploNumber}` : ""].filter(Boolean).join(" · ") || "—"}</td>
                <td>{c.maxScore}</td>
                {c.appliesTo === "GROUP"
                  ? <td colSpan={members.length} style={{ textAlign: "center" }}>{cell(c, members[0]?.id || "", (v) => setGroup(c.id, v))} <span className="small-note">whole group</span></td>
                  : members.map((m) => <td key={m.id} style={{ textAlign: "center" }}>{cell(c, m.id, (v) => setVals((p) => ({ ...p, [key(c.id, m.id)]: v })))}</td>)}
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}><td colSpan={3}>Total</td>{members.map((m) => <td key={m.id} style={{ textAlign: "center" }}>{Math.round(total(m.id) * 10) / 10} / {max}</td>)}</tr>
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Feedback for the group (shown to the FYP Head and supervisor)" />
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}><input type="radio" checked={rec === "ON_TRACK"} onChange={() => setRec("ON_TRACK")} /> On track</label>
            <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}><input type="radio" checked={rec === "AT_RISK"} onChange={() => setRec("AT_RISK")} /> At risk — flag for intervention</label>
            <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save scores"}</button>
            {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** One-time display of an external evaluator's private link (the FYP Head sends it to them). */
export function ExternalLinkForm({ cycleId }: { cycleId: string }) {
  const [link, setLink] = useState("");
  return (
    <div>
      <ActionForm
        url="/api/fyp/admin" fixed={{ action: "addExternal", cycleId }} submit="Add external evaluator" collapsed openLabel="Add an external / industry evaluator"
        fields={[{ name: "name", label: "Name" }, { name: "email", label: "Email", width: 200 }, { name: "organization", label: "Organization" }, { name: "designation", label: "Designation" }, { name: "expertise", label: "Expertise", width: 220 }, { name: "days", label: "Link valid (days)", type: "number", width: 90 }]}
        initial={{ days: 60 }}
        onDone={(d) => setLink(String(d.link || ""))}
      />
      {link && (
        <div className="card" style={{ borderColor: "var(--brass)" }}>
          <b>Send this private link to the evaluator</b> — it is shown only once (a new one can be made later):
          <div style={{ fontFamily: "monospace", fontSize: 12.5, wordBreak: "break-all", marginTop: 6 }}>{typeof window !== "undefined" ? window.location.origin : ""}{link}</div>
        </div>
      )}
    </div>
  );
}
