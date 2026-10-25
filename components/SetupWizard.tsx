"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Shape, TFamily } from "../lib/instituteSetup";

// The Institute Head's day-1 set-up on one page: 1 shape · 2 disciplines (pre-filled branches, trim what you don't
// have) · 3 management logins (download, fill, upload) · 4 put each person in their position.

type Pos = { id: string; title: string; role: string; facultyId: string | null; departmentId: string | null; program: string | null; holderId: string | null; covers: string[]; scope: string };
type Person = { id: string; name: string; email: string };
type Row = { line: number; positionId: string; title: string; name: string; email: string; status: string; userId?: string };
const post = async (url: string, body: unknown) => { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); return { ok: r.ok, error: d.error as string | undefined, data: d }; };
const box: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginBottom: 12, background: "#fff" };
const stepHead = (n: number, t: string, done: boolean) => <h3 style={{ margin: "0 0 8px", display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 24, height: 24, borderRadius: 999, background: done ? "#2E7D32" : "#0D2A4A", color: "#fff", display: "inline-grid", placeItems: "center", fontSize: 13 }}>{done ? "✓" : n}</span>{t}</h3>;

export default function SetupWizard({ shapes, families: start, hasStructure, positions, people, chairmanId }: { shapes: { key: Shape; label: string; note: string }[]; families: TFamily[]; hasStructure: boolean; positions: Pos[]; people: Person[]; chairmanId: string }) {
  const router = useRouter();
  const [shape, setShape] = useState<Shape>("FDP");
  const [fams, setFams] = useState<TFamily[]>(start);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pick, setPick] = useState<Record<string, string>>(() => Object.fromEntries(positions.map((p) => [p.id, p.holderId || ""])));
  const set = (fi: number, f: (x: TFamily) => TFamily) => setFams((all) => all.map((x, i) => (i === fi ? f(structuredClone(x)) : x)));
  const say = (ok: boolean, text: string) => setMsg({ ok, text });

  async function create() {
    setBusy(true); setMsg(null);
    const r = await post("/api/chairman/setup", { action: "structure", shape, families: fams });
    setBusy(false); say(r.ok, r.ok ? r.data.message : r.error || "Could not create."); if (r.ok) router.refresh();
  }
  async function upload(dry: boolean) {
    if (!file) return say(false, "Choose the filled file first.");
    setBusy(true); setMsg(null);
    const fd = new FormData(); fd.append("file", file); fd.append("dryRun", dry ? "1" : "0");
    const r = await fetch("/api/chairman/setup", { method: "POST", body: fd }); const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return say(false, d.error || "Upload failed.");
    setRows(d.rows);
    if (!dry) { setPick((p) => ({ ...p, ...Object.fromEntries((d.rows as Row[]).filter((x) => x.userId && x.positionId).map((x) => [x.positionId, x.userId!])) })); say(true, d.message); router.refresh(); }
    else say(true, "Checked — nothing saved yet. Look at the list, then create the logins.");
  }
  // Same calls as the organisation chart: the role endpoints keep all their checks.
  async function roleCall(pos: Pos, role: string, userId: string) {
    if (userId === chairmanId) return { ok: true } as { ok: boolean; error?: string };
    let r;
    if (["EXAM_CONTROLLER", "QEC_INCHARGE", "OMC_CONVENER"].includes(role)) r = await post("/api/org/duty", { duty: role, userId, revoke: false });
    else r = await post("/api/chairman/give-role", { userId, role, facultyId: pos.facultyId, departmentId: pos.departmentId, program: pos.program });
    if (!r.ok && /already/i.test(r.error || "")) return { ok: true };
    return r;
  }
  async function assignAll() {
    setBusy(true); setMsg(null);
    const errs: string[] = []; let done = 0;
    for (const pos of positions) {
      const uid = pick[pos.id]; if (!uid || uid === pos.holderId) continue;
      if (pos.holderId) { errs.push(`${pos.title}: already held — change it on the organisation chart.`); continue; }
      let failed = "";
      for (const role of [pos.role, ...pos.covers]) { const r = await roleCall(pos, role, uid); if (!r.ok) { failed = r.error || "could not give the role"; break; } }
      if (failed) { errs.push(`${pos.title}: ${failed}`); continue; }
      const r = await post("/api/org/positions", { action: "assign", id: pos.id, userId: uid });
      if (!r.ok) { errs.push(`${pos.title}: ${r.error}`); continue; }
      if (pos.role === "PROGRAM_LEAD" && pos.program) await post("/api/chairman/setup", { action: "program", userId: uid, program: pos.program });
      done++;
    }
    setBusy(false); say(!errs.length, `${done} position(s) filled.${errs.length ? ` ${errs.join(" · ")}` : ""}`); router.refresh();
  }

  const filled = positions.filter((p) => p.holderId).length;
  return (
    <div>
      {msg && <p className={msg.ok ? "small-note" : "err"} style={{ color: msg.ok ? "#1E6B34" : undefined, position: "sticky", top: 0, background: "#fff", padding: 6, zIndex: 5 }}>{msg.text}</p>}

      <section style={box}>
        {stepHead(1, "Shape of the institute", hasStructure)}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {shapes.map((s) => <label key={s.key} style={{ flex: "1 1 220px", border: `2px solid ${shape === s.key ? "#0D2A4A" : "var(--line)"}`, borderRadius: 10, padding: 10, cursor: "pointer" }}>
            <input type="radio" name="shape" checked={shape === s.key} onChange={() => setShape(s.key)} /> <b>{s.label}</b><div className="small-note" style={{ margin: "4px 0 0" }}>{s.note}</div></label>)}
        </div>
      </section>

      <section style={box}>
        {stepHead(2, "Which faculties / disciplines?", hasStructure)}
        <p className="small-note" style={{ marginTop: 0 }}>Each tick makes the whole branch with its positions. Untick or rename what you don&apos;t have — deleting is easier than adding. Running this again never makes anything twice.</p>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
          {fams.map((f, fi) => (
            <div key={f.key} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10, opacity: f.on ? 1 : 0.6 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={f.on} onChange={(e) => set(fi, (x) => ({ ...x, on: e.target.checked }))} aria-label={`Include ${f.faculty}`} />
                {shape === "FDP" ? <input value={f.faculty} onChange={(e) => set(fi, (x) => ({ ...x, faculty: e.target.value }))} style={{ fontWeight: 700, flex: 1 }} aria-label="Faculty name" /> : <b style={{ flex: 1 }}>{f.faculty.replace(/^Faculty of /i, "")}</b>}
                <span className="small-note" style={{ margin: 0 }}>{f.council}</span></label>
              {f.on && f.departments.map((d, di) => (
                <div key={di} style={{ margin: "6px 0 0 18px" }}>
                  {shape !== "P" && <label style={{ display: "flex", gap: 6 }}><input type="checkbox" checked={d.on} onChange={(e) => set(fi, (x) => { x.departments[di].on = e.target.checked; return x; })} aria-label={`Include ${d.name}`} /><input value={d.name} onChange={(e) => set(fi, (x) => { x.departments[di].name = e.target.value; return x; })} style={{ flex: 1, fontSize: 12.5 }} aria-label="Department name" /></label>}
                  {d.on && <div style={{ marginLeft: shape === "P" ? 0 : 20 }}>{d.programs.map((p, pi) => (
                    <label key={pi} style={{ display: "flex", gap: 6, fontSize: 12.5, marginTop: 3 }}><input type="checkbox" checked={p.on} onChange={(e) => set(fi, (x) => { x.departments[di].programs[pi].on = e.target.checked; return x; })} aria-label={`Include ${p.name}`} /><input value={p.name} onChange={(e) => set(fi, (x) => { x.departments[di].programs[pi].name = e.target.value; return x; })} style={{ flex: 1, fontSize: 12 }} aria-label="Program name" /></label>))}
                    <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 11, marginTop: 3 }} onClick={() => set(fi, (x) => { x.departments[di].programs.push({ name: "New program", short: "", on: true }); return x; })}>+ program</button>
                  </div>}
                </div>))}
              {f.on && shape !== "P" && <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 11, margin: "6px 0 0 18px" }} onClick={() => set(fi, (x) => { x.departments.push({ name: "Department of …", on: true, programs: [{ name: "New program", short: "", on: true }] }); return x; })}>+ department</button>}
            </div>))}
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="btn" disabled={busy} onClick={create}>{busy ? "Creating…" : hasStructure ? "Add what's ticked" : "Create the structure"}</button>
          <span className="small-note" style={{ margin: 0 }}>Also makes the Controller of Examinations, QEC Convener and each department&apos;s OMC Convener positions.</span>
        </div>
      </section>

      <section style={box}>
        {stepHead(3, "Management logins", !!rows?.some((r) => r.userId))}
        <p className="small-note" style={{ marginTop: 0 }}>Download the list of positions, write a name and email against each one you want to fill (same email on several rows = one person holding several posts), and upload it. First password 12345678, changed at first sign-in.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <a className={`btn btn-secondary btn-sm${positions.length ? "" : " disabled"}`} href="/api/chairman/setup" aria-disabled={!positions.length}>Download the template</a>
          <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] || null); setRows(null); }} aria-label="Filled template" />
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !file} onClick={() => upload(true)}>Check (dry run)</button>
          <button type="button" className="btn btn-sm" disabled={busy || !file} onClick={() => upload(false)}>Create the logins</button>
        </div>
        {rows && <table style={{ fontSize: 12.5, width: "100%", marginTop: 8 }}><thead><tr><th>Row</th><th>Position</th><th>Name</th><th>Email</th><th>Result</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.line}><td>{r.line}</td><td>{r.title}</td><td>{r.name}</td><td>{r.email}</td><td style={{ color: /^(New|Existing|Same)/.test(r.status) ? "#1E6B34" : "#B3261E" }}>{r.status}</td></tr>)}</tbody></table>}
      </section>

      <section style={box}>
        {stepHead(4, `Put each person in their position (${filled} of ${positions.length} filled)`, positions.length > 0 && filled === positions.length)}
        {!positions.length ? <p className="small-note">Create the structure first.</p> : <>
          <table style={{ fontSize: 12.5, width: "100%" }}><thead><tr><th>Position</th><th>Of</th><th>Person</th></tr></thead>
            <tbody>{positions.map((p) => <tr key={p.id}><td><b>{p.title}</b></td><td>{p.scope}</td><td>
              {p.holderId ? <span style={{ color: "#1E6B34" }}>✓ {people.find((x) => x.id === p.holderId)?.name || "held"}</span>
                : <select value={pick[p.id] || ""} onChange={(e) => setPick((x) => ({ ...x, [p.id]: e.target.value }))} aria-label={`Person for ${p.title}`} style={{ maxWidth: 280 }}><option value="">— later —</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select>}
            </td></tr>)}</tbody></table>
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={busy || !positions.some((p) => !p.holderId && pick[p.id])} onClick={assignAll}>{busy ? "Saving…" : "Assign the chosen people"}</button>
            <a className="btn btn-secondary btn-sm" href="/chairman/org-chart">Open the organisation chart</a>
            <span className="small-note" style={{ margin: 0 }}>Teachers are added afterwards by the Deans, Chairmen and Program Leads (Data Import).</span>
          </div>
        </>}
      </section>
    </div>
  );
}
