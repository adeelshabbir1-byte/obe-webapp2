"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SetupRow } from "../lib/batchSetup";

// After a batch takes its courses from a curriculum (set-up steps 5–7): ⑤ sync & equalise on the Content Sync page ·
// ⑥ home department of the new courses · ⑦ final names and codes where the equal courses differ. Then the
// adjusting tools: add a course from another degree, merge duplicates, start again with another source.

type Status = { fromCurriculum: boolean; rows: SetupRow[]; open: number; noHome: number; naming: SetupRow[]; candidates: { id: string; code: string; title: string; batch: string }[]; done: boolean };
const post = async (body: unknown) => { const r = await fetch("/api/coordinator/batch-setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Something went wrong."); return d as { message?: string }; };

export default function BatchSetupSteps({ batchId, status, departments, sourceLabel, changes, types, ownDepartmentId }: { batchId: string; status: Status; departments: { id: string; name: string }[]; ownDepartmentId?: string | null; sourceLabel: string; changes: { id: string; code: string; title: string; action: string; why: string | null; byName: string; at: string }[]; types: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
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

  // Step 6: every course in one table; a course with no home yet starts with the program's own department. One Save.
  const homeRows = status.rows;
  const homeVal = (r: SetupRow) => homeOf[r.id] ?? r.homeId ?? ownDepartmentId ?? "";
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState("");
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name || "— none —";
  const split = homeRows.reduce<Record<string, number>>((m, r) => { const k = deptName(homeVal(r)); m[k] = (m[k] || 0) + 1; return m; }, {});
  const s1 = status.open === 0, s2 = status.noHome === 0;
  const nSide = (r: SetupRow) => nameSide[r.id] || "new", cSide = (r: SetupRow) => codeSide[r.id] || "prev";
  const cell = (on: boolean, onClick: () => void, children: React.ReactNode, label: string) => <button type="button" aria-pressed={on} aria-label={label} onClick={onClick} style={{ border: `1.5px solid ${on ? "#0D2A4A" : "#E1E5EA"}`, background: on ? "#EAF1FA" : "#fff", color: on ? "#0D2A4A" : "#9AA0A6", borderRadius: 6, padding: "3px 7px", font: "inherit", fontSize: 12.5, cursor: "pointer", textAlign: "left", width: "100%" }}>{children}</button>;
  const step = (n: number, title: string, done: boolean, body: React.ReactNode) => (
    <div id={n === 6 ? "home" : n === 7 ? "names" : n === 5 ? "sync" : undefined} style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8, scrollMarginTop: 80 }}>
      <b style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 22, height: 22, borderRadius: 999, background: done ? "#2E7D32" : "#0D2A4A", color: "#fff", display: "inline-grid", placeItems: "center", fontSize: 12 }}>{done ? "✓" : n}</span>{title}</b>
      {body}
    </div>
  );

  return (
    <div className="card" style={{ borderLeft: `5px solid ${status.done ? "#2E7D32" : "#C62828"}` }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b>Courses came from: {sourceLabel || "—"}</b>
        {status.fromCurriculum && !status.done && <span style={{ color: "#C62828", fontWeight: 700 }}>Set-up not finished — sync and equalise the courses (step 5) and give the new courses their home department (step 6). Their courses can&apos;t be offered and registration can&apos;t open until then.</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run({ action: "merge" })}>Merge duplicates</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { if (confirm("Remove all this batch's courses and choose the source again? Only allowed while nobody studies any of them.")) run({ action: "reset" }, () => router.push(`/coordinator/batches/new?batchId=${batchId}`)); }}>Start again with another source</button>
        </span>
      </div>
      {msg && <p className={msg.ok ? "small-note" : "err"} style={{ color: msg.ok ? "#1E6B34" : undefined }}>{msg.text}</p>}

      {status.fromCurriculum && <>
        {step(5, `Sync & equalise — synced ${status.rows.filter((r) => r.matched).length} of ${status.rows.length}${status.rows.some((r) => r.isNew) ? ` · ${status.rows.filter((r) => r.isNew).length} new` : ""}`, s1, (
          <p className="small-note" style={{ margin: "4px 0" }}>{s1 ? "Every course is synced with the course taught before or marked new." : `${status.open} course(s) still to link or mark new.`} Linking is done on the Content Sync page (the OMC&apos;s page, open to you for your own batches): a synced course takes the earlier course&apos;s semester, home department and Subject Expert, and its plan comes with it.{" "}
            <a href={`/omc/content-sync?batchId=${batchId}&setup=${batchId}`} className="btn btn-sm">{s1 ? "Open Content Sync" : "Sync on the Content Sync page →"}</a></p>))}
        {step(6, `Home department of each course${status.noHome ? ` — ${status.noHome} pre-filled with ${deptName(ownDepartmentId || "")}, check and save` : ""}`, s2, (
          <div>
            <p className="small-note" style={{ margin: "4px 0" }}>Split: {Object.entries(split).map(([k, v]) => `${k} ${v}`).join(" · ")}. Every course starts with this program&apos;s own department; tick the ones another department teaches and move them, then save once.</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "4px 0" }}>
              <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={ticked.size === homeRows.length && homeRows.length > 0} onChange={(e) => setTicked(e.target.checked ? new Set(homeRows.map((r) => r.id)) : new Set())} /> all</label>
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Move ticked to"><option value="">— department —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!moveTo || !ticked.size} onClick={() => { setHomeOf((x) => ({ ...x, ...Object.fromEntries(Array.from(ticked).map((id) => [id, moveTo])) })); setTicked(new Set()); }}>Move ticked ({ticked.size}) to {moveTo ? deptName(moveTo) : "…"}</button>
            </div>
            <table style={{ fontSize: 12.5, width: "100%" }}><tbody>{homeRows.map((r) => (
              <tr key={r.id}><td style={{ width: 24 }}><input type="checkbox" checked={ticked.has(r.id)} onChange={() => setTicked((t) => { const n = new Set(t); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} aria-label={`Tick ${r.code}`} /></td>
                <td><b>{r.code}</b> {r.title}{r.matched ? <span className="small-note"> · synced</span> : ""}</td>
                <td><select value={homeVal(r)} onChange={(e) => setHomeOf((x) => ({ ...x, [r.id]: e.target.value }))} aria-label={`Home department of ${r.code}`}><option value="">— home department —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></td></tr>))}</tbody></table>
            <button type="button" className="btn" style={{ marginTop: 6 }} disabled={busy} onClick={() => run({ action: "homes", rows: homeRows.filter((r) => homeVal(r) && homeVal(r) !== r.homeId).map((r) => ({ courseId: r.id, departmentId: homeVal(r) })) }, () => { setHomeOf({}); location.hash = "names"; })}>Save and continue →</button>
          </div>))}
        {step(7, "Final names and codes", s2 && !status.naming.length, status.naming.length ? (
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
