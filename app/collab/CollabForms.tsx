"use client";

import { useState } from "react";

const post = (b: unknown) => fetch("/api/collab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not save." }));
const go = (r: { error?: string; id?: string }, id?: string) => { if (r.error) alert(r.error); else location.href = `/collab?id=${r.id || id}`; };

export function NewProg({ kinds }: { kinds: Record<string, string> }) {
  const [k, setK] = useState("JOINT"); const [t, setT] = useState("");
  return <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}><select value={k} onChange={(e) => setK(e.target.value)}>{Object.entries(kinds).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select><input value={t} onChange={(e) => setT(e.target.value)} placeholder="Programme title" style={{ width: 240 }} /><button type="button" className="btn btn-sm" onClick={async () => go(await post({ action: "create", kind: k, title: t }))}>Start</button></span>;
}
export function Check({ id, k, done, note, field = "checks", all }: { id: string; k: string; done: boolean; note: string; field?: "checks"; all: Record<string, { done: boolean; note?: string }> }) {
  const [d, setD] = useState(done); const [n, setN] = useState(note); const [m, setM] = useState("");
  const save = async (dd: boolean, nn: string) => { const r = await post({ action: "save", id, data: { [field]: { [k]: { done: dd, note: nn } } } }); setM(r.error || "✓"); };
  return <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={d} onChange={(e) => { setD(e.target.checked); save(e.target.checked, n); }} /><input value={n} onChange={(e) => setN(e.target.value)} onBlur={() => save(d, n)} placeholder="evidence / note" style={{ width: 200, fontSize: 12 }} /> <span className="small-note">{m}</span></span>;
}
export function MocField({ id, k, value, all }: { id: string; k: string; value: string; all: Record<string, string> }) {
  const [v, setV] = useState(value); const [m, setM] = useState("");
  return <span><input value={v} onChange={(e) => setV(e.target.value)} onBlur={async () => { const r = await post({ action: "save", id, data: { moc: { [k]: v } } }); setM(r.error || "✓"); }} placeholder="what the MoC says" style={{ width: 320, fontSize: 12 }} /> <span className="small-note">{m}</span></span>;
}
/** Simple fields + line lists (partners, ODL courses, KPIs) edited as text. */
export function Basics({ id, d, ddjd }: { id: string; d: Record<string, any>; ddjd: boolean }) {
  const f = (k: string) => d[k] ?? "";
  const [s, setS] = useState<Record<string, string>>({ mocFrom: f("mocFrom"), mocUntil: f("mocUntil"), nocNo: f("nocNo"), nocDate: f("nocDate"), nocUntil: f("nocUntil"), seats: String(f("seats")), published: f("published"), withdrawalNotice: f("withdrawalNotice"), moderationPct: String(f("moderationPct")), currency: f("currency"), fees: f("fees"), feeCapPct: String(f("feeCapPct")), timezone: f("timezone"), gradeScale: f("gradeScale"),
    partners: (d.partners || []).map((p: any) => [p.name, p.country || "", p.foreign ? "foreign" : "", p.recognised ? "recognised" : ""].join(" | ")).join("\n"),
    courses: (d.courses || []).map((c: any) => [c.code, c.mode, c.ch, c.f2fPct ?? "", c.recordedMin ?? "", c.moderatedH ?? "", c.gradedH ?? "", c.labH ?? "", c.teacher || ""].join(" | ")).join("\n"),
    kpis: Object.entries(d.kpis || {}).map(([a, b]) => `${a}=${b}`).join(", "), same: d.sameDiscipline === false ? "no" : "yes" });
  const [m, setM] = useState("");
  const num = (x: string) => (x.trim() === "" ? undefined : Number(x));
  const save = async () => {
    const data: Record<string, unknown> = { mocFrom: s.mocFrom, mocUntil: s.mocUntil, nocNo: s.nocNo, nocDate: s.nocDate, nocUntil: s.nocUntil, seats: num(s.seats), published: s.published, withdrawalNotice: s.withdrawalNotice, moderationPct: num(s.moderationPct), currency: s.currency, fees: s.fees, feeCapPct: num(s.feeCapPct), timezone: s.timezone, gradeScale: s.gradeScale, sameDiscipline: s.same !== "no",
      partners: s.partners.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((x) => x[0]).map(([name, country, fo, rec]) => ({ name, country, foreign: /foreign/i.test(fo || ""), recognised: /recognised/i.test(rec || "") })),
      courses: s.courses.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((x) => x[0]).map(([code, mode, ch, f2f, rec, mod, gr, lab, teacher]) => ({ code, mode: (["SYNC", "ASYNC", "BLENDED"].includes((mode || "").toUpperCase()) ? mode.toUpperCase() : "SYNC"), ch: Number(ch) || 3, f2fPct: num(f2f || ""), recordedMin: num(rec || ""), moderatedH: num(mod || ""), gradedH: num(gr || ""), labH: num(lab || ""), teacher })),
      kpis: Object.fromEntries(s.kpis.split(",").map((x) => x.split("=").map((y) => y.trim())).filter((x) => x[0] && x[1]).map(([a, b]) => [a, Number(b)])) };
    const r = await post({ action: "save", id, data }); setM(r.error || "Saved ✓");
  };
  const inp = (k: string, ph: string, w = 130) => <input value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} placeholder={ph} style={{ width: w }} />;
  return <div style={{ display: "grid", gap: 8, fontSize: 12.5 }}>
    {ddjd && <div>Partners (one per line: name | country | foreign | recognised)<br /><textarea rows={3} value={s.partners} onChange={(e) => setS({ ...s, partners: e.target.value })} style={{ width: "100%" }} /></div>}
    {ddjd && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>MoC from {inp("mocFrom", "YYYY-MM-DD", 110)} until {inp("mocUntil", "YYYY-MM-DD", 110)} · joint moderation % {inp("moderationPct", "e.g. 20", 70)} · same discipline <select value={s.same} onChange={(e) => setS({ ...s, same: e.target.value })}><option>yes</option><option>no</option></select></div>}
    {ddjd && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>Fee currency {inp("currency", "PKR / USD", 80)} · partner time zone {inp("timezone", "e.g. Europe/London", 140)} · partner grade scale {inp("gradeScale", "e.g. UK classes", 140)}</div>}
    {ddjd && <div>Full fee structure for the whole duration (DDJD 5.i) · cap on yearly increase % {inp("feeCapPct", "e.g. 10", 60)}<br /><textarea rows={2} value={s.fees} onChange={(e) => setS({ ...s, fees: e.target.value })} style={{ width: "100%" }} /></div>}
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>HEC NOC no. {inp("nocNo", "number")} date {inp("nocDate", "YYYY-MM-DD", 110)} valid until {inp("nocUntil", "YYYY-MM-DD", 110)} seats {inp("seats", "n", 60)}</div>
    {ddjd && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>Published on website {inp("published", "URL or date", 200)} · withdrawal notice given {inp("withdrawalNotice", "date (blank = none)", 150)}</div>}
    <div>Courses (one per line: code | SYNC/ASYNC/BLENDED | CH | F2F-sync % | recorded min | moderated h | graded h | lab h | teacher)<br /><textarea rows={4} value={s.courses} onChange={(e) => setS({ ...s, courses: e.target.value })} style={{ width: "100%" }} /></div>
    {ddjd && <div>KPIs (enrolment=85, graduation=72, satisfaction=81, employability=76) {inp("kpis", "key=value, …", 320)}</div>}
    <div><button type="button" className="btn btn-sm" onClick={save}>Save</button> <span className="small-note">{m}</span></div>
  </div>;
}
export function Cem({ id, curricula }: { id: string; curricula: { id: string; label: string }[] }) {
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [m, setM] = useState("");
  return <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}><select value={a} onChange={(e) => setA(e.target.value)}><option value="">our curriculum…</option>{curricula.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select><select value={b} onChange={(e) => setB(e.target.value)}><option value="">partner curriculum…</option>{curricula.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select><button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "cem", id, ours: a, theirs: b }); if (r.error) setM(r.error); else location.reload(); }}>Draft the matrix</button> {m}</span>;
}
export function CemOk({ id, i, cem }: { id: string; i: number; cem: { ok: boolean; assessment: string }[] }) {
  const [ok, setOk] = useState(cem[i].ok); const [as, setAs] = useState(cem[i].assessment);
  const save = (o: boolean, x: string) => post({ action: "save", id, data: { cem: cem.map((r, j) => (j === i ? { ...r, ok: o, assessment: x } : r)) } });
  return <span style={{ display: "inline-flex", gap: 4 }}><input value={as} onChange={(e) => setAs(e.target.value)} onBlur={() => save(ok, as)} placeholder="assessment" style={{ width: 110, fontSize: 12 }} /><input type="checkbox" checked={ok} onChange={(e) => { setOk(e.target.checked); save(e.target.checked, as); }} /></span>;
}

const save = (id: string, data: Record<string, unknown>) => post({ action: "save", id, data });
export function Field({ id, k, label, type, value }: { id: string; k: string; label: string; type: "text" | "date" | "number" | "long"; value: string }) {
  const [v, setV] = useState(value); const [m, setM] = useState("");
  const commit = async () => { if (v === value && !m) return; const r = await save(id, { [k]: type === "number" ? (v === "" ? undefined : Number(v)) : v }); setM(r.error || "✓"); };
  return <label style={{ display: "block", fontSize: 13, margin: "6px 0" }}>{label}<br />
    {type === "long" ? <textarea rows={3} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} style={{ width: "100%" }} /> : <input type={type === "number" ? "number" : type === "date" ? "date" : "text"} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} style={{ width: type === "text" ? 320 : 170 }} />} <span className="small-note">{m}</span></label>;
}
type Partner = { name: string; country?: string; foreign?: boolean; recognised?: boolean };
export function Partners({ id, partners }: { id: string; partners: Partner[] }) {
  const [list, setList] = useState<Partner[]>(partners.length ? partners : [{ name: "" }]); const [m, setM] = useState("");
  const set = (i: number, p: Partial<Partner>) => setList(list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return <div>{list.map((p, i) => <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "4px 0" }}>
    <input value={p.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Partner university / department" style={{ width: 260 }} />
    <input value={p.country || ""} onChange={(e) => set(i, { country: e.target.value })} placeholder="Country" style={{ width: 110 }} />
    <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={!!p.foreign} onChange={(e) => set(i, { foreign: e.target.checked })} /> foreign</label>
    <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={!!p.recognised} onChange={(e) => set(i, { recognised: e.target.checked })} /> recognised / chartered {p.foreign ? "(WHED or home country)" : "(HEC)"}</label>
    <button type="button" className="btn-link" onClick={() => setList(list.filter((_, j) => j !== i))}>remove</button></div>)}
    <button type="button" className="btn-link" onClick={() => setList([...list, { name: "" }])}>+ partner</button> <button type="button" className="btn btn-sm" onClick={async () => { const r = await save(id, { partners: list.filter((x) => x.name.trim()) }); setM(r.error || "Saved ✓"); }}>Save partners</button> <span className="small-note">{m}</span></div>;
}
export function SameDiscipline({ id, value }: { id: string; value: boolean }) {
  const [v, setV] = useState(value);
  return <label style={{ fontSize: 13, display: "block", marginTop: 8 }}><input type="checkbox" checked={v} onChange={async (e) => { setV(e.target.checked); await save(id, { sameDiscipline: e.target.checked }); }} /> Both degrees are in the same discipline (required for a double degree)</label>;
}
type Course = { code: string; mode: "SYNC" | "ASYNC" | "BLENDED"; ch: number; f2fPct?: number; recordedMin?: number; moderatedH?: number; gradedH?: number; labH?: number; teacher?: string };
export function Courses({ id, courses }: { id: string; courses: Course[] }) {
  const [list, setList] = useState<Course[]>(courses.length ? courses : [{ code: "", mode: "SYNC", ch: 3 }]); const [m, setM] = useState("");
  const set = (i: number, p: Partial<Course>) => setList(list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const n = (v: string) => (v === "" ? undefined : Number(v));
  const need = (c: Course) => c.mode === "ASYNC" ? `needs ${425 * c.ch} min recorded, ${5 * c.ch} h moderated, ${4 * c.ch} h graded` : c.mode === "BLENDED" ? "needs ≥ 34% face-to-face / live" : `needs ${15 * c.ch}–${16 * c.ch} live hours`;
  return <div style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Mode</th><th>CH</th><th>F2F / live %</th><th>Recorded min</th><th>Moderated h</th><th>Graded h</th><th>Lab h</th><th>Teacher</th><th /></tr></thead><tbody>
    {list.map((c, i) => <tr key={i}><td><input value={c.code} onChange={(e) => set(i, { code: e.target.value })} style={{ width: 80 }} /></td>
      <td><select value={c.mode} onChange={(e) => set(i, { mode: e.target.value as Course["mode"] })}><option value="SYNC">Synchronous</option><option value="ASYNC">Asynchronous</option><option value="BLENDED">Blended</option></select><div className="small-note">{need(c)}</div></td>
      <td><input type="number" value={c.ch} onChange={(e) => set(i, { ch: Number(e.target.value) || 1 })} style={{ width: 45 }} /></td>
      {(["f2fPct", "recordedMin", "moderatedH", "gradedH", "labH"] as const).map((k) => <td key={k}><input type="number" value={c[k] ?? ""} onChange={(e) => set(i, { [k]: n(e.target.value) })} style={{ width: 60 }} /></td>)}
      <td><input value={c.teacher || ""} onChange={(e) => set(i, { teacher: e.target.value })} style={{ width: 120 }} /></td><td><button type="button" className="btn-link" onClick={() => setList(list.filter((_, j) => j !== i))}>×</button></td></tr>)}
  </tbody></table><button type="button" className="btn-link" onClick={() => setList([...list, { code: "", mode: "SYNC", ch: 3 }])}>+ course</button> <button type="button" className="btn btn-sm" onClick={async () => { const r = await save(id, { courses: list.filter((x) => x.code.trim()) }); if (r.error) setM(r.error); else location.reload(); }}>Save and check</button> <span className="small-note">{m}</span></div>;
}
export function Kpis({ id, kpis, defs }: { id: string; kpis: Record<string, number>; defs: [string, string, number][] }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(defs.map(([k]) => [k, kpis[k] == null ? "" : String(kpis[k])]))); const [m, setM] = useState("");
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>{defs.map(([k, label, b]) => <label key={k} style={{ fontSize: 12.5 }}>{label}<br /><input type="number" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} style={{ width: 70 }} /> <span className="small-note">bench {k === "enrolment" ? "≥" : ">"} {b}</span></label>)}
    <button type="button" className="btn btn-sm" onClick={async () => { const r = await save(id, { kpis: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "").map(([a, x]) => [a, Number(x)])) }); setM(r.error || "Saved ✓"); }}>Save KPIs</button> <span className="small-note">{m}</span></div>;
}
export function Assign({ id, current, staff }: { id: string; current: string; staff: { id: string; name: string; role: string }[] }) {
  const [v, setV] = useState(current); const [m, setM] = useState("");
  return <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><select value={v} onChange={(e) => setV(e.target.value)}><option value="">— nobody —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "assign", id, userId: v }); setM(r.error || "Assigned ✓ — they were told"); }}>Assign</button> <span className="small-note">{m}</span></span>;
}

export function LectureModes({ id, code, courseId, lectures, pct }: { id: string; code: string; courseId: string; lectures: { n: number; topic: string; mode: string }[]; pct: number | null }) {
  const [m, setM] = useState<Record<string, string>>(Object.fromEntries(lectures.map((l) => [String(l.n), l.mode]))); const [msg, setMsg] = useState("");
  const live = lectures.filter((l) => m[String(l.n)] && m[String(l.n)] !== "REC").length; const share = lectures.length ? Math.round((100 * live) / lectures.length) : 0;
  return <details style={{ marginTop: 6, fontSize: 12.5 }}><summary style={{ cursor: "pointer" }}><b>{code}</b> — tag each lecture ({lectures.length}) · face-to-face or live <b style={{ color: share >= 34 ? "#1E6B3A" : "#B3261E" }}>{share}%</b>{pct != null ? "" : " (not tagged yet)"}</summary>
    <div style={{ display: "flex", gap: 6, margin: "6px 0" }}>{(["F2F", "LIVE", "REC"] as const).map((k) => <button key={k} type="button" className="btn-link" onClick={() => setM(Object.fromEntries(lectures.map((l) => [String(l.n), k])))}>all {k === "F2F" ? "face-to-face" : k === "LIVE" ? "live" : "recorded"}</button>)}</div>
    <div style={{ columns: "2 300px" }}>{lectures.map((l) => <div key={l.n} style={{ breakInside: "avoid", display: "flex", gap: 6, alignItems: "center", padding: "1px 0" }}><span style={{ width: 30 }}>L{l.n}</span><select value={m[String(l.n)] || ""} onChange={(e) => setM({ ...m, [String(l.n)]: e.target.value })}><option value="">—</option><option value="F2F">Face-to-face</option><option value="LIVE">Live online</option><option value="REC">Recorded</option></select><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.topic}</span></div>)}</div>
    <button type="button" className="btn btn-sm" onClick={async () => { const r = await post({ action: "modes", id, courseId, code, modes: m }); setMsg(r.error || `Saved — ${r.pct}% face-to-face or live (blended needs ≥ 34%, ODL 8.2.3)`); }}>Save tags</button> <span className="small-note">{msg}</span></details>;
}
