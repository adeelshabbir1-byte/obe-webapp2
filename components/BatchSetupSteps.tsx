"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SetupRow } from "../lib/batchSetup";

// The batch's set-up on its courses page. Without a step: where the courses came from, sync progress (the sync itself
// is the existing Content Sync page), and the adjusting tools. With ?step=: the step done on this page — home
// departments (all courses, own department pre-filled, one Save), names & codes, electives, GA mapping check.

type Status = { fromCurriculum: boolean; rows: (SetupRow & { ch?: number; semester?: number | null })[]; open: number; noHome: number; naming: SetupRow[]; done: boolean };
type DeptCourse = { id: string; code: string; title: string; program: string };
const post = async (body: unknown) => { const r = await fetch("/api/coordinator/batch-setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Something went wrong."); return d as { message?: string }; };

export default function BatchSetupSteps({ batchId, step, status, departments, ownDepartmentId, deptCourses, homePlans, sourceLabel, changes, types, gaCheck, nextUrl, setupUrl }: {
  batchId: string; step: string; status: Status; departments: { id: string; name: string }[]; ownDepartmentId: string | null;
  deptCourses: Record<string, DeptCourse[]>; homePlans: Record<string, { mode: string; linkedCourseId: string | null }>;
  sourceLabel: string; changes: { id: string; code: string; title: string; action: string; why: string | null; byName: string; at: string }[]; types: string[];
  gaCheck: { noGa: { code: string; title: string }[]; unserved: { number: number; title: string }[] } | null; nextUrl: string | null; setupUrl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [home, setHome] = useState<Record<string, string>>(() => Object.fromEntries(status.rows.map((r) => [r.id, r.homeId || ownDepartmentId || ""])));
  const [sameAs, setSameAs] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(homePlans).map(([k, v]) => [k, v.mode === "PLANNED_FOR_PROGRAM" ? "none" : v.linkedCourseId || ""])));
  const [tick, setTick] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState("");
  const [nameSide, setNameSide] = useState<Record<string, "prev" | "new">>({});
  const [codeSide, setCodeSide] = useState<Record<string, "prev" | "new">>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ kind: string; id: string; code: string; title: string; ch: number; type: string; from: string; home: string | null }[]>([]);
  const [addType, setAddType] = useState(types[0] || "Core");
  const [addSem, setAddSem] = useState("");
  const run = async (body: unknown, after?: () => void) => { setBusy(true); setMsg(null); try { const d = await post({ batchId, ...(body as object) }); setMsg({ ok: true, text: d.message || "Saved." }); after?.(); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } setBusy(false); };
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name || "—";
  const split = useMemo(() => { const m = new Map<string, number>(); for (const r of status.rows) { const k = home[r.id] || ownDepartmentId || ""; m.set(k, (m.get(k) || 0) + (r.ch || 0)); } const tot = Array.from(m.values()).reduce((a, b) => a + b, 0) || 1; return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([k, ch]) => `${deptName(k)} ${ch} CH (${Math.round((100 * ch) / tot)}%)`).join(" · "); }, [home, status.rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const nSide = (r: SetupRow) => nameSide[r.id] || "new", cSide = (r: SetupRow) => codeSide[r.id] || "prev";
  const cell = (on: boolean, onClick: () => void, children: React.ReactNode, label: string) => <button type="button" aria-pressed={on} aria-label={label} onClick={onClick} style={{ border: `1.5px solid ${on ? "#0D2A4A" : "#E1E5EA"}`, background: on ? "#EAF1FA" : "#fff", color: on ? "#0D2A4A" : "#9AA0A6", borderRadius: 6, padding: "3px 7px", font: "inherit", fontSize: 12.5, cursor: "pointer", textAlign: "left", width: "100%" }}>{children}</button>;

  // ---------------------------------------------------------------- step: home departments (one Save)
  if (step === "home") return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Home department of courses</h3>
      <p className="small-note" style={{ marginTop: 0 }}>Every course starts in <b>{ownDepartmentId ? deptName(ownDepartmentId) : "your program's department"}</b>. Change only the courses that belong to another department; for those, say whether that department teaches the same course (pick it — its plan is then shared) or doesn&apos;t offer it (planned for your program). Then one <b>Save and continue</b>.</p>
      <p style={{ fontSize: 12.5, margin: "4px 0 8px" }}><b>Split:</b> {split}</p>
      {msg && <p className={msg.ok ? "small-note" : "err"} style={{ color: msg.ok ? "#1E6B34" : undefined }}>{msg.text}</p>}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
        <span className="small-note" style={{ margin: 0 }}>{tick.size} ticked —</span>
        <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Department to move the ticked courses to"><option value="">move to department…</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!moveTo || !tick.size} onClick={() => { setHome((h) => ({ ...h, ...Object.fromEntries(Array.from(tick).map((id) => [id, moveTo])) })); setTick(new Set()); }}>Move ticked</button>
      </div>
      <div style={{ overflowX: "auto" }}><table style={{ fontSize: 12.5, width: "100%" }}>
        <thead><tr><th><input type="checkbox" aria-label="Tick all" checked={tick.size === status.rows.length && status.rows.length > 0} onChange={(e) => setTick(e.target.checked ? new Set(status.rows.map((r) => r.id)) : new Set())} /></th><th>Course</th><th>Home department</th><th>Same course in that department</th></tr></thead>
        <tbody>{status.rows.map((r) => { const h = home[r.id] || ""; const foreign = !!h && h !== ownDepartmentId; const opts = deptCourses[h] || []; return (
          <tr key={r.id} style={foreign ? { background: "#F7F9FC" } : undefined}>
            <td><input type="checkbox" aria-label={`Tick ${r.code}`} checked={tick.has(r.id)} onChange={() => setTick((t) => { const n = new Set(t); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} /></td>
            <td><b>{r.code}</b> {r.title}{r.matched && <span className="small-note"> · synced</span>}</td>
            <td><select value={h} onChange={(e) => setHome((x) => ({ ...x, [r.id]: e.target.value }))} aria-label={`Home of ${r.code}`}>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
            <td>{foreign ? <select value={sameAs[r.id] || ""} onChange={(e) => setSameAs((x) => ({ ...x, [r.id]: e.target.value }))} aria-label={`Same course in ${deptName(h)}`} style={{ maxWidth: 300 }}>
              <option value="">— choose —</option>
              {opts.map((c) => <option key={c.id} value={c.id}>Same as: {c.code} {c.title} ({c.program})</option>)}
              <option value="none">Not offered by them — planned for our program</option>
            </select> : <span className="small-note">—</span>}</td>
          </tr>); })}</tbody>
      </table></div>
      <button type="button" className="btn" style={{ marginTop: 8 }} disabled={busy} onClick={() => run({ action: "homes", homes: status.rows.map((r) => ({ courseId: r.id, departmentId: home[r.id] || null, sameAs: sameAs[r.id] || null })) }, () => { if (nextUrl) router.push(nextUrl); })}>{busy ? "Saving…" : "Save and continue →"}</button>
    </div>
  );

  // ---------------------------------------------------------------- step: names & codes
  if (step === "names") return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Final names and codes</h3>
      {msg && <p className={msg.ok ? "small-note" : "err"} style={{ color: msg.ok ? "#1E6B34" : undefined }}>{msg.text}</p>}
      {status.naming.length ? (
        <div>
          <p className="small-note" style={{ margin: "4px 0" }}>{status.rows.filter((r) => r.matched).length - status.naming.length} equal courses have the same name and code. For these, click the name and the code you want; ✎ types another name. Defaults: <b>code</b> from the course already taught, <b>name</b> from the curriculum.</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0" }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNameSide(Object.fromEntries(status.naming.map((r) => [r.id, "prev"])))}>Use all previous names</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNameSide(Object.fromEntries(status.naming.map((r) => [r.id, "new"])))}>Use all curriculum names</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCodeSide(Object.fromEntries(status.naming.map((r) => [r.id, "prev"])))}>Use all previous codes</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCodeSide(Object.fromEntries(status.naming.map((r) => [r.id, "new"])))}>Use all curriculum codes</button>
          </div>
          <table style={{ fontSize: 12.5, width: "100%" }}><thead><tr><th>Code — previous</th><th>Code — curriculum</th><th>Name — previous</th><th>Name — curriculum</th><th /></tr></thead>
            <tbody>{status.naming.map((r) => { const m = r.matched!; return (
              <tr key={r.id}>
                <td>{cell(cSide(r) === "prev", () => setCodeSide((x) => ({ ...x, [r.id]: "prev" })), m.code, `Use code ${m.code}`)}</td>
                <td>{cell(cSide(r) === "new", () => setCodeSide((x) => ({ ...x, [r.id]: "new" })), r.code, `Use code ${r.code}`)}</td>
                <td>{typed[r.id] !== undefined ? <input value={typed[r.id]} onChange={(e) => setTyped((x) => ({ ...x, [r.id]: e.target.value }))} style={{ width: "100%" }} aria-label={`Name for ${r.code}`} /> : cell(nSide(r) === "prev", () => setNameSide((x) => ({ ...x, [r.id]: "prev" })), m.title, `Use name ${m.title}`)}</td>
                <td>{typed[r.id] !== undefined ? <span className="small-note">typed</span> : cell(nSide(r) === "new", () => setNameSide((x) => ({ ...x, [r.id]: "new" })), r.title, `Use name ${r.title}`)}</td>
                <td><button type="button" className="act" title="Type another name" onClick={() => setTyped((x) => { const n = { ...x }; if (n[r.id] !== undefined) delete n[r.id]; else n[r.id] = nSide(r) === "prev" ? m.title : r.title; return n; })}>✎</button></td>
              </tr>); })}</tbody></table>
          <button type="button" className="btn" style={{ marginTop: 6 }} disabled={busy} onClick={() => run({ action: "naming", picks: status.naming.map((r) => ({ courseId: r.id, code: cSide(r) === "prev" ? r.matched!.code : r.code, title: typed[r.id] ?? (nSide(r) === "prev" ? r.matched!.title : r.title) })) }, async () => { await post({ batchId, action: "stepDone", step: "names" }).catch(() => null); if (nextUrl) router.push(nextUrl); })}>Save and continue →</button>
        </div>) : <p className="small-note">Names and codes agree — nothing to choose.</p>}
    </div>
  );

  if (step === "electives") return <div className="card"><h3 style={{ marginTop: 0 }}>Electives and IDS</h3><p className="small-note" style={{ margin: 0 }}>Choose the courses for each elective and IDS slot below (Choose from the list), then <b>Electives are chosen →</b> in the strip above.</p></div>;

  if (step === "ga") return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>GA mapping check</h3>
      <p className="small-note" style={{ marginTop: 0 }}>Warnings only — the OMC decides course → GA in its review. Courses of other departments get their suggestion from the GA crosswalk.</p>
      {gaCheck && (gaCheck.noGa.length || gaCheck.unserved.length) ? <>
        {gaCheck.noGa.length > 0 && <p style={{ fontSize: 12.5, color: "#B26A00" }}><b>{gaCheck.noGa.length} course(s) serve no GA:</b> {gaCheck.noGa.map((c) => c.code).join(", ")}</p>}
        {gaCheck.unserved.length > 0 && <p style={{ fontSize: 12.5, color: "#B26A00" }}><b>GAs no course serves:</b> {gaCheck.unserved.map((g) => `GA${g.number} ${g.title}`).join(" · ")}</p>}
      </> : <p className="small-note" style={{ color: "#1E6B34" }}>Every course serves a GA and every GA is served.</p>}
    </div>
  );

  // ---------------------------------------------------------------- overview: source, sync progress, tools
  const synced = status.rows.length - status.open;
  return (
    <div className="card" style={{ borderLeft: `5px solid ${status.done ? "#2E7D32" : "#C62828"}` }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b>Courses came from: {sourceLabel || "—"}</b>
        {status.fromCurriculum && !status.done && <span style={{ color: "#C62828", fontWeight: 700 }}>Set-up not finished — registration opens when it is.</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <a className="btn btn-sm" href={setupUrl}>Continue set-up →</a>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run({ action: "merge" })}>Merge duplicates</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { if (confirm("Remove all this batch's courses and choose the source again? Only allowed while nobody studies any of them.")) run({ action: "reset" }, () => router.push(`/coordinator/batches/new?batchId=${batchId}`)); }}>Start again with another source</button>
        </span>
      </div>
      {msg && <p className={msg.ok ? "small-note" : "err"} style={{ color: msg.ok ? "#1E6B34" : undefined }}>{msg.text}</p>}
      {status.fromCurriculum && <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b>Sync & equalise: {synced} of {status.rows.length}</b>
        {status.open > 0 && <><a className="btn btn-sm" href={`/omc/content-sync?setup=${batchId}`}>Open Content Sync →</a><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { if (confirm(`Mark the ${status.open} course(s) not synced as new courses (nothing taught before)?`)) run({ action: "markRestNew" }); }}>Mark the rest as new</button></>}
        {status.open === 0 && <span className="small-note" style={{ margin: 0, color: "#1E6B34" }}>✓ every course is synced or new</span>}
      </div>}
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
        <b>+ Add a course from another degree</b>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
          <input placeholder="Code or title (any program, any curriculum)…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={async (e) => { if (e.key === "Enter" && q.trim().length >= 2) setFound((await (await fetch(`/api/coordinator/batch-setup?search=${encodeURIComponent(q)}&batchId=${batchId}`)).json()).results || []); }} style={{ minWidth: 280 }} aria-label="Find a course to add" />
          <button type="button" className="btn btn-secondary btn-sm" disabled={q.trim().length < 2} onClick={async () => setFound((await (await fetch(`/api/coordinator/batch-setup?search=${encodeURIComponent(q)}&batchId=${batchId}`)).json()).results || [])}>Find</button>
          <label style={{ fontSize: 12.5 }}>as <select value={addType} onChange={(e) => setAddType(e.target.value)}>{types.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label style={{ fontSize: 12.5 }}>semester <select value={addSem} onChange={(e) => setAddSem(e.target.value)}><option value="">as it is</option>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i + 1}>S{i + 1}</option>)}</select></label>
        </div>
        {found.length > 0 && <table style={{ fontSize: 12.5, width: "100%", marginTop: 6 }}><tbody>{found.map((f) => (
          <tr key={`${f.kind}${f.id}`}><td><b>{f.code}</b> {f.title}</td><td className="small-note">{f.ch} CH · {f.from}{f.home ? ` · home ${f.home}` : ""}</td><td><button type="button" className="btn btn-sm" disabled={busy} onClick={() => run({ action: "add", kind: f.kind, id: f.id, type: addType, semester: addSem }, () => setFound([]))}>Add</button></td></tr>))}</tbody></table>}
      </div>
      {changes.length > 0 && <details style={{ marginTop: 8 }}><summary className="small-note">Changes to this batch&apos;s scheme ({changes.length})</summary>
        <ul style={{ fontSize: 12.5, margin: "4px 0", paddingLeft: 18 }}>{changes.map((c) => <li key={c.id}>{new Date(c.at).toLocaleDateString("en-GB")} · {c.action.toLowerCase().replace(/_/g, " ")} <b>{c.code}</b> {c.title}{c.why ? ` — ${c.why}` : ""} · {c.byName}</li>)}</ul></details>}
    </div>
  );
}
