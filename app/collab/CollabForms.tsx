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
  const save = async (dd: boolean, nn: string) => { const r = await post({ action: "save", id, data: { [field]: { ...all, [k]: { done: dd, note: nn } } } }); setM(r.error || "✓"); };
  return <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={d} onChange={(e) => { setD(e.target.checked); save(e.target.checked, n); }} /><input value={n} onChange={(e) => setN(e.target.value)} onBlur={() => save(d, n)} placeholder="evidence / note" style={{ width: 200, fontSize: 12 }} /> <span className="small-note">{m}</span></span>;
}
export function MocField({ id, k, value, all }: { id: string; k: string; value: string; all: Record<string, string> }) {
  const [v, setV] = useState(value); const [m, setM] = useState("");
  return <span><input value={v} onChange={(e) => setV(e.target.value)} onBlur={async () => { const r = await post({ action: "save", id, data: { moc: { ...all, [k]: v } } }); setM(r.error || "✓"); }} placeholder="what the MoC says" style={{ width: 320, fontSize: 12 }} /> <span className="small-note">{m}</span></span>;
}
/** Simple fields + line lists (partners, ODL courses, KPIs) edited as text. */
export function Basics({ id, d, ddjd }: { id: string; d: Record<string, any>; ddjd: boolean }) {
  const f = (k: string) => d[k] ?? "";
  const [s, setS] = useState<Record<string, string>>({ mocFrom: f("mocFrom"), mocUntil: f("mocUntil"), nocNo: f("nocNo"), nocDate: f("nocDate"), nocUntil: f("nocUntil"), seats: String(f("seats")), published: f("published"), withdrawalNotice: f("withdrawalNotice"), moderationPct: String(f("moderationPct")), currency: f("currency"), timezone: f("timezone"), gradeScale: f("gradeScale"),
    partners: (d.partners || []).map((p: any) => [p.name, p.country || "", p.foreign ? "foreign" : "", p.recognised ? "recognised" : ""].join(" | ")).join("\n"),
    courses: (d.courses || []).map((c: any) => [c.code, c.mode, c.ch, c.f2fPct ?? "", c.recordedMin ?? "", c.moderatedH ?? "", c.gradedH ?? "", c.labH ?? "", c.teacher || ""].join(" | ")).join("\n"),
    kpis: Object.entries(d.kpis || {}).map(([a, b]) => `${a}=${b}`).join(", "), same: d.sameDiscipline === false ? "no" : "yes" });
  const [m, setM] = useState("");
  const num = (x: string) => (x.trim() === "" ? undefined : Number(x));
  const save = async () => {
    const data: Record<string, unknown> = { mocFrom: s.mocFrom, mocUntil: s.mocUntil, nocNo: s.nocNo, nocDate: s.nocDate, nocUntil: s.nocUntil, seats: num(s.seats), published: s.published, withdrawalNotice: s.withdrawalNotice, moderationPct: num(s.moderationPct), currency: s.currency, timezone: s.timezone, gradeScale: s.gradeScale, sameDiscipline: s.same !== "no",
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
