"use client";
import { useCallback, useEffect, useState } from "react";

// Platform → Official content: load the official QR-I, QR-II and Discrete Structures content into an institute's
// base courses (preview first; approved plans become a change request), restore the previous plan, open the three
// in the Topic Workspace.

type Lecture = { lecture: number; week: number; topic: string; subtopic: string | null; clo: string | null; midterm?: boolean; splitFrom?: string | null };
type Preview = {
  kind: "DS" | "QR1" | "QR2"; label: string; line: string; approved: boolean; now: { clos: number; lectures: number };
  plan: { source: string; clos: { code: string; statement: string; bloom: string; placeholder?: boolean }[]; lectures: Lecture[]; missing: string[] };
  target: { id: string; code: string; title: string; followers: number; others: { id: string; code: string; title: string; batch: string }[]; batch: { batchName: string } | null } | null;
};
type Load = { id: string; courseId: string; kind: string; status: string; summary: string; source: string; at: string; course: string; approved: boolean; missing: string[] };

const API = "/api/admin/official-content";
async function call(body: Record<string, unknown>) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
  return d;
}

export default function OfficialContentPanel({ institutes }: { institutes: { id: string; name: string }[] }) {
  const [chairmanId, setChairmanId] = useState(institutes[0]?.id || "");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [outline, setOutline] = useState<{ name: string; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async (withOutline: { text: string } | null = outline) => {
    if (!chairmanId) return;
    const r = await fetch(`${API}?chairmanId=${encodeURIComponent(chairmanId)}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg({ ok: false, text: d.error || "Could not load." }); return; }
    let ps = d.previews as Preview[];
    if (withOutline) ps = await Promise.all(ps.map((p) => (p.kind === "DS" ? p : call({ action: "preview", chairmanId, kind: p.kind, outline: withOutline.text }).catch(() => p))));
    setPreviews(ps); setLoads(d.loads || []);
  }, [chairmanId, outline]);
  useEffect(() => { refresh(); }, [chairmanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (body: Record<string, unknown>, done: (d: Record<string, any>) => string) => {
    setBusy(true); setMsg(null);
    try { const d = await call({ chairmanId, ...body }); setMsg({ ok: true, text: done(d) }); await refresh(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  const ids = previews.map((p) => p.target?.id).filter(Boolean) as string[];

  return (
    <div>
      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ display: "grid", gap: 3, fontSize: 12 }}>Institute
          <select value={chairmanId} onChange={(e) => setChairmanId(e.target.value)} data-institute>{institutes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        </label>
        <label style={{ display: "grid", gap: 3, fontSize: 12 }}>HEC QR course outline (Markdown: HEC-QR-course-outline-2021.md)
          <input type="file" accept=".md,.markdown,.txt" data-outline onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const o = { name: f.name, text: await f.text() }; setOutline(o); await refresh(o); }} />
        </label>
        {outline && <span style={{ fontSize: 12, color: "var(--slate)" }}>Outline: {outline.name}</span>}
        {ids.length > 0 && <a className="btn" href={`/faculty/topic-workspace?open=${ids.join(",")}`} data-workspace-link>Open QR-I, QR-II and Discrete Structures in the Topic Workspace</a>}
      </div>
      {msg && <div className={msg.ok ? "ok" : "err"} role="status" data-msg>{msg.text}</div>}
      {previews.map((p) => (
        <div key={p.kind} className="card" data-kind={p.kind}>
          <h3 style={{ marginTop: 0, fontSize: 16 }}>{p.label}</h3>
          <p style={{ fontSize: 13, margin: "4px 0" }}><b>Source:</b> {p.plan.source} — <span data-line>{p.line}</span></p>
          <p style={{ fontSize: 13, margin: "4px 0" }}><b>Into:</b> {p.target ? <>{p.target.code} {p.target.title}{p.target.batch ? ` (${p.target.batch.batchName})` : ""} — base course{p.target.followers ? `, ${p.target.followers} follower(s) sync from it` : ""}; now {p.now.clos} CLO(s), {p.now.lectures} lecture(s){p.approved ? " · OMC-approved: a change request is made instead" : ""}</> : <span style={{ color: "#B3261E" }}>no such course in this institute yet</span>}</p>
          {p.target && p.target.others.length > 0 && (
            <label style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }}>Load into
              <select value={pick[p.kind] || p.target.id} onChange={async (e) => {
                const courseId = e.target.value; setPick({ ...pick, [p.kind]: courseId });
                try { const np = await call({ action: "preview", chairmanId, kind: p.kind, courseId, outline: p.kind === "DS" ? null : outline?.text || null }); setPreviews(previews.map((x) => (x.kind === p.kind ? { ...np, target: { ...np.target, others: p.target!.others.concat(p.target!.others.some((o) => o.id === p.target!.id) ? [] : [{ id: p.target!.id, code: p.target!.code, title: p.target!.title, batch: p.target!.batch?.batchName || "" }]).filter((o) => o.id !== courseId) } } : x))); }
                catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
              }}>
                <option value={p.target.id}>{p.target.code} {p.target.title}{p.target.batch ? ` (${p.target.batch.batchName})` : ""}</option>
                {p.target.others.map((o) => <option key={o.id} value={o.id}>{o.code} {o.title}{o.batch ? ` (${o.batch})` : ""}</option>)}
              </select>
            </label>
          )}
          {p.plan.missing.length > 0 && <div className="err" style={{ fontSize: 12 }} data-missing>Not in the source (left empty): {p.plan.missing.join("; ")}.</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={() => setOpen(open === p.kind ? null : p.kind)}>{open === p.kind ? "Hide" : "Show"} the content</button>
            <button className="btn" disabled={busy || !p.target || !p.plan.lectures.length} data-load={p.kind}
              onClick={() => { if (confirm(`Replace the topics of ${p.target?.code} with the official content? The current plan is saved first and can be restored.`)) act({ action: "load", kind: p.kind, courseId: p.target?.id, outline: p.kind === "DS" ? null : outline?.text || null }, (d) => d.requested ? `Change request sent to the OMC for ${d.course}: ${d.line}. It is loaded once the OMC reopens the plan.` : `Loaded into ${d.course}: ${d.line}.${d.synced ? ` ${d.synced} follower(s) synced.` : ""}${d.catalog ? ` Catalog ${d.catalog}.` : ""}${d.keptClos?.length ? ` Kept (not in the source): ${d.keptClos.join(", ")}.` : ""}${d.retired?.retired?.length ? ` Retired ${d.retired.retired.join(", ")} (${d.retired.repointed} course(s) re-pointed).` : ""}`); }}>
              Load official content
            </button>
          </div>
          {open === p.kind && (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ fontSize: 12 }}><thead><tr><th>CLO</th><th>Statement</th><th>Bloom</th></tr></thead>
                <tbody>{p.plan.clos.map((c) => <tr key={c.code}><td>{c.code}</td><td style={{ color: c.placeholder ? "#B3261E" : undefined }}>{c.statement}</td><td>{c.bloom}</td></tr>)}</tbody></table>
              <table style={{ fontSize: 12, marginTop: 8 }}><thead><tr><th>L</th><th>Week</th><th>Topic</th><th>Sub-topic</th><th>CLO</th></tr></thead>
                <tbody>{p.plan.lectures.map((l) => <tr key={l.lecture} data-lecture={l.lecture}><td>L{l.lecture}</td><td>{l.week}</td><td>{l.topic}{l.midterm ? " (mid-term week)" : ""}</td><td>{l.subtopic || (l.splitFrom ? `split from ${l.splitFrom}` : "")}</td><td>{l.clo || "—"}</td></tr>)}</tbody></table>
            </div>
          )}
        </div>
      ))}
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Loads</h3>
        {!loads.length ? <p style={{ fontSize: 13, color: "var(--slate)" }}>None yet.</p> : (
          <table style={{ fontSize: 12 }}><thead><tr><th>When</th><th>Course</th><th>What</th><th>Status</th><th /></tr></thead>
            <tbody>{loads.map((l) => (
              <tr key={l.id} data-load-row={l.kind} data-status={l.status}>
                <td>{new Date(l.at).toISOString().slice(0, 16).replace("T", " ")}</td><td>{l.course}</td><td>{l.summary}</td><td>{l.status === "PENDING" ? "Waiting for the OMC (change request)" : l.status}</td>
                <td>
                  {l.status === "APPLIED" && <button className="btn btn-secondary" disabled={busy} data-undo={l.kind} onClick={() => { if (confirm("Restore the plan as it was before this load?")) act({ action: "undo", id: l.id }, () => "The previous plan is restored."); }}>Restore previous plan</button>}
                  {l.status === "PENDING" && !l.approved && <button className="btn" disabled={busy} onClick={() => act({ action: "apply", id: l.id }, () => "Loaded.")}>Load now (the OMC reopened the plan)</button>}
                </td>
              </tr>))}</tbody></table>
        )}
      </div>
    </div>
  );
}
