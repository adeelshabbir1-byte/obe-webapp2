"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Client pieces of Accreditation governance: plan a visit, assign / revoke tasks, visit settings, council bindings
// and standards.

async function send(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  return r && r.ok ? { ok: true as const, d } : { ok: false as const, error: (d as { error?: string }).error || "That didn't work." };
}

export function PlanVisit({ programs }: { programs: { leadId: string; label: string }[] }) {
  const router = useRouter();
  const [leadId, setLead] = useState(programs[0]?.leadId || "");
  const [visitDate, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!programs.length) return null;
  async function go() {
    setBusy(true); setErr("");
    const r = await send("/api/accreditation/cycles", "POST", { leadId, visitDate: visitDate || undefined });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    router.push(`/accreditation/readiness/${r.d.id}`);
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label style={{ display: "grid", gap: 3, fontSize: 12 }}>Program
        <select value={leadId} onChange={(e) => setLead(e.target.value)} style={{ padding: "6px 8px", maxWidth: "100%" }}>{programs.map((p) => <option key={p.leadId} value={p.leadId}>{p.label}</option>)}</select>
      </label>
      <label style={{ display: "grid", gap: 3, fontSize: 12 }}>Visit date (optional)<input type="date" value={visitDate} onChange={(e) => setDate(e.target.value)} style={{ padding: "5px 8px" }} /></label>
      <button type="button" className="btn btn-brass btn-sm" onClick={go} disabled={busy || !leadId}>{busy ? "Preparing…" : "Plan a visit"}</button>
      {err && <span className="small-note" style={{ color: "var(--rust)" }}>{err}</span>}
    </div>
  );
}

type Person = { id: string; name: string; label: string; suggested?: boolean };
export function AssignControl({ taskId, assigneeId, status, people, canManage }: { taskId: string; assigneeId: string | null; status: string; people: Person[]; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState(assigneeId || "");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!canManage) return null;
  async function act(body: Record<string, unknown>) {
    setBusy(true); setErr("");
    const r = await send(`/api/accreditation/tasks/${taskId}`, "PATCH", body);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setOpen(false); router.refresh();
  }
  const sorted = [...people].sort((a, b) => Number(!!b.suggested) - Number(!!a.suggested) || a.name.localeCompare(b.name));
  if (status === "APPROVED") return <button type="button" className="act" disabled={busy} onClick={() => act({ action: "reopen" })}>Reopen</button>;
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {open ? (
        <>
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Assign to" style={{ padding: "3px 6px", fontSize: 12, maxWidth: 220 }}>
            <option value="">Choose…</option>
            {sorted.map((p) => <option key={p.id} value={p.id}>{p.suggested ? "★ " : ""}{p.name} — {p.label}</option>)}
          </select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" style={{ padding: "2px 6px", fontSize: 12 }} />
          <button type="button" className="act" disabled={busy || !who} onClick={() => act({ action: "assign", assigneeId: who, dueDate: due || undefined })}>{assigneeId ? "Reassign" : "Assign"}</button>
          <button type="button" className="act" onClick={() => setOpen(false)}>Cancel</button>
        </>
      ) : (
        <>
          <button type="button" className="act" onClick={() => setOpen(true)}>{assigneeId ? "Reassign" : "Assign"}</button>
          {assigneeId && <button type="button" className="act act-danger" disabled={busy} onClick={() => { if (window.confirm("Withdraw this task? The person loses access to it at once.")) act({ action: "revoke" }); }}>Revoke</button>}
        </>
      )}
      {err && <span className="small-note" style={{ color: "var(--rust)" }}>{err}</span>}
    </span>
  );
}

export function VisitSettings({ id, title, visitDate, status }: { id: string; title: string; visitDate: string; status: string }) {
  const router = useRouter();
  const [t, setT] = useState(title);
  const [d, setD] = useState(visitDate);
  const [msg, setMsg] = useState("");
  async function save(extra: Record<string, unknown> = {}) {
    setMsg("");
    const r = await send("/api/accreditation/cycles", "PATCH", { id, title: t, visitDate: d || null, ...extra });
    setMsg(r.ok ? "Saved." : r.error);
    if (r.ok) router.refresh();
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label style={{ display: "grid", gap: 3, fontSize: 12, flex: "1 1 260px" }}>Visit<input value={t} onChange={(e) => setT(e.target.value)} style={{ padding: "5px 8px" }} /></label>
      <label style={{ display: "grid", gap: 3, fontSize: 12 }}>Visit date<input type="date" value={d} onChange={(e) => setD(e.target.value)} style={{ padding: "5px 8px" }} /></label>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => save()}>Save</button>
      {status === "OPEN"
        ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => { if (window.confirm("Close this visit? Its tasks stop accepting changes.")) save({ status: "CLOSED" }); }}>Close the visit</button>
        : <button type="button" className="btn btn-secondary btn-sm" onClick={() => save({ status: "OPEN" })}>Reopen the visit</button>}
      {msg && <span className="small-note">{msg}</span>}
    </div>
  );
}

export function BindProgram({ program, body, explicit, canBind }: { program: string; body: string; explicit: boolean; canBind: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(body);
  const [err, setErr] = useState("");
  if (!canBind) return <span>{body}{!explicit && <span className="hp-tag">inferred</span>}</span>;
  async function save(next: string) {
    setV(next); setErr("");
    const r = await send("/api/accreditation/governance", "PUT", { action: "bind", program, body: next });
    if (!r.ok) { setErr(r.error); setV(body); return; }
    router.refresh();
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <select value={v} onChange={(e) => save(e.target.value)} aria-label={`Council of ${program}`} style={{ padding: "3px 6px", fontSize: 12.5 }}>
        <option value="NCEAC">NCEAC</option><option value="NBEAC">NBEAC</option><option value="PEC">PEC</option><option value="HEC">HEC</option>
      </select>
      {!explicit && <><span className="hp-tag">inferred</span><button type="button" className="act" onClick={() => save(v)}>Confirm</button></>}
      {err && <span className="small-note" style={{ color: "var(--rust)" }}>{err}</span>}
    </span>
  );
}

type Field = { key: string; label: string; unit: string; min: number; max: number; nullable?: boolean; hint: string };
export function StandardsForm({ body, fields, values, defaults, customised, canEdit }: { body: string; fields: Field[]; values: Record<string, number | null>; defaults: Record<string, number | null>; customised: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, customised.includes(f.key) && values[f.key] !== null ? String(values[f.key]) : ""])));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save() {
    setMsg(null);
    const r = await send("/api/accreditation/governance", "PUT", { action: "standards", body, values: Object.fromEntries(fields.map((f) => [f.key, v[f.key] === "" ? null : v[f.key]])) });
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  }
  return (
    <div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
        {fields.map((f) => (
          <label key={f.key} style={{ display: "grid", gap: 3, fontSize: 12 }}>{f.label}
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="number" min={f.min} max={f.max} step={f.key === "maxStudentsPerComputer" ? 0.5 : 1} value={v[f.key]} disabled={!canEdit}
                placeholder={defaults[f.key] === null ? "institute's own" : `default ${defaults[f.key]}`} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} style={{ padding: "5px 8px", width: 120 }} />
              <span className="small-note">{f.unit}</span>
            </span>
            {f.hint && <span className="small-note">{f.hint}</span>}
          </label>
        ))}
      </div>
      {canEdit && <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}><button type="button" className="btn btn-brass btn-sm" onClick={save}>Save {body} standards</button><span className="small-note">Leave a box empty to use the default shown.</span></div>}
      {msg && <p style={{ fontSize: 12.5, margin: "6px 0 0", color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</p>}
    </div>
  );
}
