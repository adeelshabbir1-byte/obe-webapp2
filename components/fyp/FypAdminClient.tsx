"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fypPost } from "./FypClient";

type Milestone = { id?: string; kind: string; title: string; dueDate: string; weightPct: number };
/** The cycle's milestones: deadlines for every group, and (with a weight) the evaluations the result is built from. */
export function MilestonesEditor({ cycleId, initial, kinds }: { cycleId: string; initial: Milestone[]; kinds: Record<string, string> }) {
  const router = useRouter();
  const [rows, setRows] = useState<Milestone[]>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<Milestone>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const total = rows.reduce((n, r) => n + (Number(r.weightPct) || 0), 0);
  async function save() {
    setBusy(true); setMsg(null);
    const r = await fypPost("/api/fyp/admin", { action: "saveMilestones", cycleId, milestones: rows });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  }
  return (
    <div>
      <table>
        <thead><tr><th>Milestone</th><th>Kind</th><th>Due date</th><th>Weight in result</th><th /></tr></thead>
        <tbody>
          {rows.map((m, i) => (
            <tr key={m.id || `new-${i}`}>
              <td><input value={m.title} onChange={(e) => set(i, { title: e.target.value })} style={{ width: 230 }} aria-label="Milestone title" /></td>
              <td><select value={m.kind} onChange={(e) => set(i, { kind: e.target.value })}>{Object.entries(kinds).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
              <td><input type="date" value={m.dueDate} onChange={(e) => set(i, { dueDate: e.target.value })} aria-label="Due date" /></td>
              <td><input type="number" min={0} max={100} value={m.weightPct} onChange={(e) => set(i, { weightPct: Number(e.target.value) })} style={{ width: 70 }} aria-label="Weight" /> %</td>
              <td><button type="button" className="act act-danger" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>Remove</button></td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}><td colSpan={3}>Evaluated milestones add up to</td><td style={{ color: Math.abs(total - 100) < 0.01 ? "var(--sage)" : "var(--rust)" }}>{total}%</td><td /></tr>
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows((r) => [...r, { kind: "OTHER", title: "", dueDate: new Date().toISOString().slice(0, 10), weightPct: 0 }])}>Add milestone</button>
        <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save milestones"}</button>
        {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
      </div>
      <p className="small-note">A weight of 0 makes a milestone a deadline only (e.g. the camera-ready thesis). Weighted milestones are scored on the rubric.</p>
    </div>
  );
}

type Criterion = { id?: string; name: string; description: string | null; bloomLevel: string | null; ploNumber: number | null; maxScore: number; appliesTo: string };
/** The evaluation rubric: each criterion with its Bloom level and PLO, scored per student or once for the group. */
export function RubricEditor({ cycleId, initial }: { cycleId: string; initial: Criterion[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Criterion[]>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<Criterion>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  async function save() {
    setBusy(true); setMsg(null);
    const r = await fypPost("/api/fyp/admin", { action: "saveRubric", cycleId, criteria: rows });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  }
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Criterion</th><th>What is judged</th><th>Bloom</th><th>PLO</th><th>Max</th><th>Scored</th><th /></tr></thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={c.id || `new-${i}`}>
                <td><input value={c.name} onChange={(e) => set(i, { name: e.target.value })} style={{ width: 190 }} aria-label="Criterion" /></td>
                <td><input value={c.description || ""} onChange={(e) => set(i, { description: e.target.value })} style={{ width: 280 }} aria-label="Description" /></td>
                <td><input value={c.bloomLevel || ""} onChange={(e) => set(i, { bloomLevel: e.target.value })} style={{ width: 50 }} aria-label="Bloom level" /></td>
                <td><input type="number" min={1} max={20} value={c.ploNumber ?? ""} onChange={(e) => set(i, { ploNumber: e.target.value ? Number(e.target.value) : null })} style={{ width: 55 }} aria-label="PLO" /></td>
                <td><input type="number" min={1} value={c.maxScore} onChange={(e) => set(i, { maxScore: Number(e.target.value) })} style={{ width: 60 }} aria-label="Maximum" /></td>
                <td><select value={c.appliesTo} onChange={(e) => set(i, { appliesTo: e.target.value })}><option value="INDIVIDUAL">Per student</option><option value="GROUP">Whole group</option></select></td>
                <td><button type="button" className="act act-danger" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows((r) => [...r, { name: "", description: "", bloomLevel: "", ploNumber: null, maxScore: 10, appliesTo: "INDIVIDUAL" }])}>Add criterion</button>
        <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save rubric"}</button>
        {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
      </div>
    </div>
  );
}

/** Make a new private link for an external evaluator (the old one stops working). */
export function RenewExternalLink({ cycleId, externalId }: { cycleId: string; externalId: string }) {
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");
  return (
    <span>
      <button type="button" className="act act-neutral" onClick={async () => {
        if (!confirm("Make a new link? The old link stops working.")) return;
        const r = await fypPost("/api/fyp/admin", { action: "renewExternal", cycleId, externalId });
        if (r.ok) setLink(String(r.data.link)); else setErr(r.error);
      }}>New link</button>
      {link && <div style={{ fontFamily: "monospace", fontSize: 11.5, wordBreak: "break-all" }}>{window.location.origin}{link}</div>}
      {err && <span className="small-note" style={{ color: "var(--rust)" }}>{err}</span>}
    </span>
  );
}

/** Group → panel picker for the FYP Head. */
export function PanelPicker({ cycleId, groupId, panelId, panels }: { cycleId: string; groupId: string; panelId: string | null; panels: { id: string; name: string }[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  return (
    <span>
      <select defaultValue={panelId || ""} aria-label="Panel" onChange={async (e) => {
        setErr("");
        const r = await fypPost("/api/fyp/admin", { action: "assignPanel", cycleId, groupId, panelId: e.target.value });
        if (!r.ok) { setErr(r.error); e.target.value = panelId || ""; } else router.refresh();
      }}>
        <option value="">— no panel —</option>
        {panels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {err && <div className="small-note" style={{ color: "var(--rust)" }}>{err}</div>}
    </span>
  );
}
