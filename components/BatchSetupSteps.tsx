"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SetupRow } from "../lib/batchSetup";

// After a batch takes its courses from a curriculum: ① sync & equalise each course with the one already taught (or mark
// it new) · ② home department of the new courses · ③ final names and codes where the equal courses differ. Then the
// adjusting tools: add a course from another degree, merge duplicates, start again with another source.

type Status = { fromCurriculum: boolean; rows: SetupRow[]; open: number; noHome: number; naming: SetupRow[]; candidates: { id: string; code: string; title: string; batch: string }[]; done: boolean };
const post = async (body: unknown) => { const r = await fetch("/api/coordinator/batch-setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Something went wrong."); return d as { message?: string }; };

export default function BatchSetupSteps({ batchId, status, departments, sourceLabel, changes, types }: { batchId: string; status: Status; departments: { id: string; name: string }[]; sourceLabel: string; changes: { id: string; code: string; title: string; action: string; why: string | null; byName: string; at: string }[]; types: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pickPrev, setPickPrev] = useState<Record<string, string>>({});
  const [homeOf, setHomeOf] = useState<Record<string, string>>({});
  // ③ names / codes: per row which side ("prev" / "new") for name and for code; default code = previous, name = curriculum.
  const [nameSide, setNameSide] = useState<Record<string, "prev" | "new">>({});
  const [codeSide, setCodeSide] = useState<Record<string, "prev" | "new">>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ kind: string; id: string; code: string; title: string; ch: number; type: string; from: string; home: string | null }[]>([]);
  const [addType, setAddType] = useState(types[0] || "Core");
  const [addSem, setAddSem] = useState("");
  const run = async (body: unknown, after?: () => void) => { setBusy(true); setMsg(null); try { const d = await post({ batchId, ...(body as object) }); setMsg({ ok: true, text: d.message || "Saved." }); after?.(); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } setBusy(false); };

  const openRows = status.rows.filter((r) => !r.matched && !r.isNew);
  const homeRows = status.rows.filter((r) => !r.homeId && (r.isNew || !r.matched));
  const s1 = status.open === 0, s2 = s1 && status.noHome === 0;
  const nSide = (r: SetupRow) => nameSide[r.id] || "new", cSide = (r: SetupRow) => codeSide[r.id] || "prev";
  const cell = (on: boolean, onClick: () => void, children: React.ReactNode, label: string) => <button type="button" aria-pressed={on} aria-label={label} onClick={onClick} style={{ border: `1.5px solid ${on ? "#0D2A4A" : "#E1E5EA"}`, background: on ? "#EAF1FA" : "#fff", color: on ? "#0D2A4A" : "#9AA0A6", borderRadius: 6, padding: "3px 7px", font: "inherit", fontSize: 12.5, cursor: "pointer", textAlign: "left", width: "100%" }}>{children}</button>;
  const step = (n: number, title: string, done: boolean, body: React.ReactNode) => (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
      <b style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 22, height: 22, borderRadius: 999, background: done ? "#2E7D32" : "#0D2A4A", color: "#fff", display: "inline-grid", placeItems: "center", fontSize: 12 }}>{done ? "✓" : n}</span>{title}</b>
      {body}
    </div>
  );

  return (
    <div className="card" style={{ borderLeft: `5px solid ${status.done ? "#2E7D32" : "#C62828"}` }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b>Courses came from: {sourceLabel || "—"}</b>
        {status.fromCurriculum && !status.done && <span style={{ color: "#C62828", fontWeight: 700 }}>Set-up not finished — sync and equalise the courses. Registration can&apos;t open until it is.</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run({ action: "merge" })}>Merge duplicates</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { if (confirm("Remove all this batch's courses and choose the source again? Only allowed while nobody studies any of them.")) run({ action: "reset" }, () => router.push(`/coordinator/batches/new?batchId=${batchId}`)); }}>Start again with another source</button>
        </span>
      </div>
      {msg && <p className={msg.ok ? "small-note" : "err"} style={{ color: msg.ok ? "#1E6B34" : undefined }}>{msg.text}</p>}

      {status.fromCurriculum && <>
        {step(1, `Sync & equalise — ${status.rows.length - status.open} of ${status.rows.length} done`, s1, openRows.length ? (
          <div>
            <p className="small-note" style={{ margin: "4px 0" }}>Each course is linked to the course already taught (the same content-sync link the OMC&apos;s Content Sync page shows); it then takes that course&apos;s home department. A course equal to nothing taught before is a <b>new course</b>.</p>
            {openRows.some((r) => r.suggestion) && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run({ action: "equaliseAll" })}>Accept every suggestion</button>}
            <table style={{ fontSize: 12.5, width: "100%", marginTop: 6 }}><thead><tr><th>This batch</th><th>Equal to (already taught)</th><th /></tr></thead>
              <tbody>{openRows.map((r) => { const v = pickPrev[r.id] ?? r.suggestion?.id ?? ""; return (
                <tr key={r.id}><td><b>{r.code}</b> {r.title}</td>
                  <td><select value={v} onChange={(e) => setPickPrev((x) => ({ ...x, [r.id]: e.target.value }))} style={{ maxWidth: 360 }} aria-label={`Equal course for ${r.code}`}><option value="">— choose —</option>{status.candidates.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title} ({c.batch})</option>)}</select>{r.suggestion && v === r.suggestion.id && <span className="small-note" style={{ margin: "0 0 0 6px" }}>suggested</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}><button type="button" className="btn btn-sm" disabled={busy || !v} onClick={() => run({ action: "equalise", courseId: r.id, prevCourseId: v })}>Equal</button>{" "}<button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run({ action: "new", courseId: r.id })}>New course</button></td></tr>); })}</tbody></table>
          </div>) : <p className="small-note" style={{ margin: "4px 0" }}>Every course is equalised or marked new.</p>)}
        {step(2, `Home department of new courses${status.noHome ? ` — ${status.noHome} to set` : ""}`, s2, !s1 ? <p className="small-note" style={{ margin: "4px 0" }}>After step 1.</p> : homeRows.length ? (
          <table style={{ fontSize: 12.5, width: "100%", marginTop: 6 }}><tbody>{homeRows.map((r) => (
            <tr key={r.id}><td><b>{r.code}</b> {r.title}</td><td><select value={homeOf[r.id] || ""} onChange={(e) => setHomeOf((x) => ({ ...x, [r.id]: e.target.value }))} aria-label={`Home department of ${r.code}`}><option value="">— home department —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>{" "}<button type="button" className="btn btn-sm" disabled={busy || !homeOf[r.id]} onClick={() => run({ action: "home", courseId: r.id, departmentId: homeOf[r.id] })}>Save</button></td></tr>))}</tbody></table>
        ) : <p className="small-note" style={{ margin: "4px 0" }}>Every course has its home department.</p>)}
        {step(3, "Final names and codes", s2 && !status.naming.length, !s1 ? <p className="small-note" style={{ margin: "4px 0" }}>After step 1.</p> : status.naming.length ? (
          <div>
            <p className="small-note" style={{ margin: "4px 0" }}>{status.rows.filter((r) => r.matched).length - status.naming.length} equal courses have the same name and code — nothing to choose. For these, click the name and the code you want (the chosen one is highlighted); ✎ types another name. Defaults: <b>code</b> from the course already taught (its department&apos;s code system), <b>name</b> from the curriculum.</p>
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
            <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} disabled={busy} onClick={() => run({ action: "naming", picks: status.naming.map((r) => ({ courseId: r.id, code: cSide(r) === "prev" ? r.matched!.code : r.code, title: typed[r.id] ?? (nSide(r) === "prev" ? r.matched!.title : r.title) })) })}>Save names and codes</button>
          </div>) : <p className="small-note" style={{ margin: "4px 0" }}>Names and codes agree.</p>)}
      </>}

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
