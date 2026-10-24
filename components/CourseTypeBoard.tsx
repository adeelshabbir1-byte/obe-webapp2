"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { COURSE_TYPES, typeKey, countsTowardDegree, type CourseType } from "../lib/courseTypes";

type C = { id: string; code: string; title: string; creditHours: number; category: string; semesterNumber: number | null; domain: string | null };
type Rules = { minTotal: number; maxTotal: number; minGenEd: number; minIds: number; minMajor: number };

/** Sort a curriculum's courses by type: one panel per type, drag a course (or tick several) to change its type. Credit
 *  hours count the slots only — the elective and IDS lists are lists of options. */
export default function CourseTypeBoard({ curriculumId, courses, rules }: { curriculumId: string; courses: C[]; rules: Rules }) {
  const router = useRouter();
  const start = useMemo(() => courses.map((c) => ({ ...c, category: typeKey(c.category) })), [courses]);
  const [rows, setRows] = useState(start);
  const [tick, setTick] = useState<Set<string>>(new Set());
  const [to, setTo] = useState("Core");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const changed = rows.filter((r) => { const o = start.find((x) => x.id === r.id)!; return o.category !== r.category || o.creditHours !== r.creditHours || o.semesterNumber !== r.semesterNumber || (o.domain || "") !== (r.domain || ""); });
  const set = (id: string, patch: Partial<C>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const sum = (f: (c: C) => boolean) => rows.filter(f).reduce((t, c) => t + (c.creditHours || 0), 0);
  const total = sum((c) => countsTowardDegree(c.category));
  const ge = sum((c) => c.category === "General Education"), ids = sum((c) => c.category === "IDS");
  const major = sum((c) => ["Core", "Lab", "Elective", "Capstone Project"].includes(c.category));
  const slots = rows.filter((c) => c.category === "Elective"), list = rows.filter((c) => c.category === "Domain Elective");
  const idsSlots = rows.filter((c) => c.category === "IDS"), idsList = rows.filter((c) => c.category === "Domain IDS");
  const checks: [string, string, boolean][] = [
    ["Credit hours (slots only)", `${total} (policy ${rules.minTotal}–${rules.maxTotal})`, total >= rules.minTotal && total <= rules.maxTotal],
    ["General Education", `${ge} CH (at least ${rules.minGenEd})`, ge >= rules.minGenEd],
    ["Interdisciplinary", `${ids} CH (at least ${rules.minIds})`, ids >= rules.minIds],
    ["Major (core, labs, electives, FYP)", `${major} CH (at least ${rules.minMajor})`, major >= rules.minMajor],
    ["Elective slots vs list", `${slots.length} slot(s), ${list.length} course(s) to choose from`, !slots.length || list.length >= slots.length],
    ["IDS slots vs list", `${idsSlots.length} IDS course(s)/slot(s), ${idsList.length} option(s) listed`, !idsList.length || idsList.length >= idsSlots.length],
  ];
  async function save() {
    setBusy(true); setMsg("");
    const r = await fetch(`/api/admin/curricula/${curriculumId}/course-types`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates: changed.map(({ id, category, creditHours, semesterNumber, domain }) => ({ id, category, creditHours, semesterNumber, domain })) }) });
    const d = await r.json().catch(() => ({})); setBusy(false); setMsg(r.ok ? d.message : d.error || "Failed."); if (r.ok) router.refresh();
  }
  const inp = { fontSize: 12, padding: "2px 4px" } as const;
  const known = new Set(COURSE_TYPES.map((t) => t.key));
  const panels: CourseType[] = [...COURSE_TYPES, ...Array.from(new Set(rows.map((r) => r.category).filter((k) => !known.has(k)))).map((k) => ({ key: k, short: k, label: `${k} (unknown type — move these)`, counts: true, color: "#C62828", note: "" }))];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
        {checks.map(([l, v, ok]) => <div key={l} style={{ borderLeft: `4px solid ${ok ? "#2E7D32" : "#C62828"}`, paddingLeft: 8 }}><div className="small-note">{l}</div><b style={{ color: ok ? undefined : "#C62828" }}>{v}</b></div>)}
      </div>
      <div className="card" style={{ margin: 0, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", position: "sticky", top: 0, zIndex: 5 }}>
        <span className="small-note">{tick.size} ticked</span>
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Move ticked courses to">{COURSE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!tick.size} onClick={() => { setRows(rows.map((r) => (tick.has(r.id) ? { ...r, category: to } : r))); setTick(new Set()); }}>Move ticked</button>
        <button type="button" className="btn btn-sm" disabled={busy || !changed.length} onClick={save}>{busy ? "Saving…" : `Save ${changed.length} change(s)`}</button>
        {changed.length > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows(start)}>Undo changes</button>}
        {msg && <b style={{ fontSize: 13 }}>{msg}</b>}
        <span className="small-note" style={{ marginLeft: "auto" }}>Drag a course onto another panel to change its type.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 12 }}>
        {panels.map((t) => {
          const xs = rows.filter((r) => r.category === t.key).sort((a, b) => (a.semesterNumber ?? 99) - (b.semesterNumber ?? 99) || a.code.localeCompare(b.code));
          const ch = xs.reduce((s, c) => s + c.creditHours, 0);
          return (
            <div key={t.key} className="card" style={{ margin: 0, borderTop: `5px solid ${t.color}`, outline: over === t.key ? `2px dashed ${t.color}` : undefined, minWidth: 0 }}
              onDragOver={(e) => { e.preventDefault(); setOver(t.key); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) set(id, { category: t.key }); }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <b style={{ color: t.color }}>{t.label}</b>
                <span style={{ fontSize: 12.5 }}>{xs.length} course(s) · {t.counts ? <b>{ch} CH</b> : <span className="small-note">{ch} CH listed, not counted</span>}</span>
              </div>
              <div className="small-note" style={{ marginBottom: 4 }}>{t.note}</div>
              {xs.length === 0 ? <div className="small-note" style={{ padding: 10, textAlign: "center", border: "1px dashed #ccc", borderRadius: 6 }}>Drop courses here</div> : (
                <table style={{ fontSize: 12, width: "100%" }}><tbody>{xs.map((c) => (
                  <tr key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)} style={{ cursor: "grab", background: changed.some((x) => x.id === c.id) ? "#FFF8E1" : undefined }}>
                    <td style={{ width: 18 }}><input type="checkbox" checked={tick.has(c.id)} onChange={(e) => { const s = new Set(tick); if (e.target.checked) s.add(c.id); else s.delete(c.id); setTick(s); }} aria-label={`Tick ${c.code}`} /></td>
                    <td style={{ whiteSpace: "nowrap" }}><b>{c.code}</b></td>
                    <td>{c.title}{t.listFor && <div><input style={{ ...inp, width: 150 }} placeholder="track (e.g. AI, Networks)" value={c.domain || ""} onChange={(e) => set(c.id, { domain: e.target.value })} /></div>}</td>
                    <td style={{ width: 50 }}><input style={{ ...inp, width: 40 }} type="number" min={0} max={12} title="Credit hours" value={c.creditHours} onChange={(e) => set(c.id, { creditHours: Number(e.target.value) })} /></td>
                    <td style={{ width: 50 }}>{!t.listFor && <input style={{ ...inp, width: 40 }} type="number" min={1} max={12} title="Semester" placeholder="sem" value={c.semesterNumber ?? ""} onChange={(e) => set(c.id, { semesterNumber: e.target.value ? Number(e.target.value) : null })} />}</td>
                    <td style={{ width: 120 }}><select style={inp} value={c.category} onChange={(e) => set(c.id, { category: e.target.value })} aria-label={`Type of ${c.code}`}>{COURSE_TYPES.map((x) => <option key={x.key} value={x.key}>{x.short}</option>)}{!known.has(c.category) && <option value={c.category}>{c.category}</option>}</select></td>
                  </tr>
                ))}</tbody></table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
