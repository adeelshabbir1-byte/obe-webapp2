"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Board, SourceRow } from "../lib/batchBoard";

// A batch's (or a source's) courses by type or by semester, like the Curriculum Builder. Editable for the batch
// (move, add missing, make the SE the owner); read-only for a preview.

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong.");
  return d;
}

export function CourseBoard({ board, batchId, editable }: { board: Board; batchId?: string; editable?: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<"type" | "semester">("type");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const total = board.courses.filter((c) => !c.deficiency && board.types.find((t) => t.name === c.type)?.counts !== false).reduce((t, c) => t + c.ch, 0);
  const obeCs = board.courses.filter((c) => !c.gradesOnly); const noSe = obeCs.filter((c) => !c.se).length, noClo = obeCs.filter((c) => !c.clos).length, gOnly = board.courses.length - obeCs.length;
  const cols = useMemo(() => view === "type"
    ? board.types.map((t) => ({ key: t.name, label: t.name, color: t.color, t, cs: board.courses.filter((c) => c.type === t.name), miss: board.missing.filter((m) => m.type === t.name) }))
    : Array.from(new Set(board.courses.map((c) => c.semester ?? 0))).sort((a, b) => (a || 99) - (b || 99)).map((s) => ({ key: String(s), label: s ? `Semester ${s}` : "No semester", color: "#0D2A4A", t: null, cs: board.courses.filter((c) => (c.semester ?? 0) === s), miss: [] as Board["missing"] })), [view, board]);
  const run = async (fn: () => Promise<{ message?: string }>) => { setBusy(true); setMsg(null); try { const d = await fn(); setMsg({ ok: true, text: d.message || "Done." }); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } setBusy(false); };
  const addMissing = (ids: string[]) => board.curriculumId && batchId && run(() => post("/api/coordinator/courses/import-hec", { batchId, curriculumId: board.curriculumId, courseIds: ids }).then((d) => ({ message: `Added ${d.created} course(s).` })));
  return (
    <div>
      <style>{`.cb-cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px;align-items:start}.cb-col{background:#F6F8FA;border:1px solid #E1E5EA;border-radius:12px;min-width:0}.cb-head{background:#fff;padding:8px 10px;border-radius:12px 12px 0 0;border-bottom:1px solid #E1E5EA}.cb-list{padding:7px;display:grid;gap:5px}.cb-card{background:#fff;border:1px solid #DDE2E8;border-radius:8px;padding:5px 8px;font-size:12.5px}.cb-ghost{border:1px dashed #C9A227;background:#FFFBEA;border-radius:8px;padding:5px 8px;font-size:12px;text-align:left;cursor:pointer;color:#7A5B00}.cb-move{display:none}.cb-card:hover .cb-move,.cb-card:focus-within .cb-move{display:inline-block}@media (hover:none){.cb-move{display:inline-block}}`}</style>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <b style={{ fontSize: 14 }}>{board.title}</b>
        <span className="bb-chip" style={{ fontSize: 12.5, background: "#F3F5F8", borderRadius: 999, padding: "3px 10px" }}><b style={{ color: total >= board.target[0] && total <= board.target[1] ? "#2E7D32" : "#B26A00" }}>{total}</b> CH (degree {board.target[0]}–{board.target[1]})</span>
        <span style={{ fontSize: 12.5 }}>{board.courses.length} courses</span>
        {editable && <span style={{ fontSize: 12.5, color: noSe ? "#B3261E" : "#2E7D32" }}>{noSe} without a Subject Expert</span>}
        {editable && <span style={{ fontSize: 12.5, color: noClo ? "#B26A00" : "#2E7D32" }}>{noClo} without CLOs</span>}
        {gOnly > 0 && <span className="small-note" style={{ margin: 0 }}>{gOnly} taught before OBE (grades only — no CLOs needed)</span>}
        {board.listPool > 0 && <span className="small-note" style={{ margin: 0 }}>+ {board.listPool} elective / IDS list options (a pool, not counted)</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button type="button" className={view === "type" ? "btn btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setView("type")}>By type</button>
          <button type="button" className={view === "semester" ? "btn btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setView("semester")}>By semester</button>
        </span>
      </div>
      {board.obeNote && <p className="small-note" style={{ marginTop: 0 }}>{board.obeNote}</p>}
      {editable && board.missing.length > 0 && <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ color: "#7A5B00", fontSize: 12.5 }}><b>{board.missing.length}</b> course(s) of the curriculum are not in this batch (yellow).</span><button type="button" className="btn btn-sm" disabled={busy} onClick={() => addMissing(board.missing.map((m) => m.masterCourseId))}>Add all missing</button></div>}
      {msg && <p className={msg.ok ? "small-note" : "err"} style={{ color: msg.ok ? "#1E6B34" : undefined }}>{msg.text}</p>}
      <div className="cb-cols">
        {cols.map((col) => { const ch = col.cs.reduce((t, c) => t + c.ch, 0); const t = col.t; const ok = !t || ((!t.minCredits || ch >= t.minCredits) && (!t.minCourses || col.cs.length >= t.minCourses)); return (
          <section key={col.key} className="cb-col" aria-label={col.label} style={dragOver === col.key ? { outline: "2px dashed #1565C0" } : undefined}
            onDragOver={(e) => { if (editable) { e.preventDefault(); setDragOver(col.key); } }} onDragLeave={() => setDragOver(null)}
            onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/plain"); if (!editable || !id) return; run(() => post("/api/coordinator/batch-board", view === "type" ? { action: "move", courseId: id, type: col.key } : { action: "move", courseId: id, semester: col.key === "0" ? "" : col.key })); }}>
            <header className="cb-head" style={{ borderTop: `5px solid ${col.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><b style={{ fontSize: 13.5 }}>{col.label}</b>{t && (t.minCredits || t.minCourses) ? <span style={{ fontWeight: 800, color: ok ? "#2E7D32" : "#C62828" }}>{ok ? "✓" : "✗"}</span> : null}</div>
              <div style={{ fontSize: 12 }}><b>{ch}</b>{t?.minCredits ? ` / ${t.minCredits}${t.maxCredits ? `–${t.maxCredits}` : ""}` : ""} CH · {col.cs.length}{t?.minCourses ? ` / ${t.minCourses}` : ""} courses</div>
            </header>
            <div className="cb-list">
              {col.miss.map((m) => <button key={m.masterCourseId} type="button" className="cb-ghost" disabled={busy || !editable} onClick={() => addMissing([m.masterCourseId])} title="Missing from this batch — click to add">＋ <b>{m.code}</b> {m.title} <span style={{ float: "right" }}>{m.ch} CH</span></button>)}
              {col.cs.sort((a, b) => (a.semester ?? 99) - (b.semester ?? 99) || a.code.localeCompare(b.code)).map((c) => (
                <div key={c.id} className="cb-card" draggable={!!editable} onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; }} style={{ borderLeft: `4px solid ${col.color}`, cursor: editable ? "grab" : undefined }} title={editable ? "Drag onto another column to move it" : undefined}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}><span><span style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: 11, fontWeight: 700, color: "#556", marginRight: 5 }}>{c.code}</span>{c.title}</span>{editable && batchId && <button type="button" aria-label={`Remove ${c.code}`} title="Remove from this batch (only while it has no students, marks or attendance)" disabled={busy} onClick={() => { const why = prompt(`Remove ${c.code} ${c.title} from this batch? Why?`); if (why !== null) run(() => post("/api/coordinator/batch-setup", { action: "remove", batchId, courseId: c.id, why })); }} style={{ border: "none", background: "none", color: "#B3261E", cursor: "pointer", padding: 0, fontSize: 13, order: 3 }}>×</button>}<b style={{ whiteSpace: "nowrap", fontSize: 11.5 }}>{c.ch} CH{c.semester ? <span style={{ fontWeight: 400, color: "#778" }}> · S{c.semester}</span> : null}</b></div>
                  {editable && <div style={{ fontSize: 11, color: "#556" }}>SE: {c.se ? c.se : <b style={{ color: "#B3261E" }}>none</b>} · Teacher: {c.instructor || "—"}</div>}
                  <div style={{ fontSize: 10.5, display: "flex", gap: 6, color: "#778" }}>{c.gradesOnly ? <span title={c.gradesOnly} style={{ color: "#6B7177" }}>grades only</span> : <><span style={{ color: c.clos ? (editable && c.mapped < c.clos ? "#B26A00" : "#2E7D32") : "#A0A6AD" }}>{c.clos ? `${c.clos} CLOs${editable && c.mapped < c.clos ? ` (${c.clos - c.mapped} not mapped)` : ""}` : "no CLOs"}</span><span style={{ color: c.lectures ? "#2E7D32" : "#A0A6AD" }}>{c.lectures ? `${c.lectures} lectures` : "no lecture plan"}</span></>}</div>
                  {c.deficiency && <div style={{ fontSize: 10.5, fontWeight: 700, color: "#8D6E63" }}>{c.deficiency} · not in CH or GPA</div>}
                  {c.semNote && <div style={{ fontSize: 10.5, color: "#0D2A4A" }} title="Semester taken from the previous batch's course it is synced with">{c.semNote}</div>}
                  {c.planFlag && <div style={{ fontSize: 10.5, fontWeight: 700, color: "#B3261E" }} title="The Subject Expert's plan is not OMC-approved yet">⚑ {c.planFlag}</div>}
                  {editable && <div style={{ fontSize: 10.5, color: c.home ? "#556" : "#B26A00" }}>Home: {c.home || "not set"}</div>}
                  {c.from && <div style={{ fontSize: 10.5, color: "#556", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.from}>from {c.from}</div>}
                  {editable && <div className="cb-move" style={{ marginTop: 3 }}>
                    <select aria-label={`Move ${c.title} to type`} value="" disabled={busy} onChange={(e) => e.target.value && run(() => post("/api/coordinator/batch-board", { action: "move", courseId: c.id, type: e.target.value }))} style={{ fontSize: 11, maxWidth: 120 }}><option value="">Type…</option>{board.types.filter((t) => t.name !== c.type).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}</select>{" "}
                    <select aria-label={`Semester of ${c.title}`} value="" disabled={busy} onChange={(e) => e.target.value && run(() => post("/api/coordinator/batch-board", { action: "move", courseId: c.id, semester: e.target.value }))} style={{ fontSize: 11 }}><option value="">Semester…</option>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i + 1}>S{i + 1}</option>)}</select>{" "}
                    <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 10.5, padding: "1px 6px" }} disabled={busy} title="A course offering with no CLOs / attainment, e.g. a non-credit deficiency course" onClick={() => { if (c.gradesOnly?.startsWith("marked")) { run(() => post("/api/obe-start", { scope: "course", courseId: c.id, off: false })); return; } if (c.gradesOnly) { alert(`This course is ${c.gradesOnly}.`); return; } const r = prompt(`Why is ${c.code} grades-only (no CLOs, not in attainment)?`); if (r && r.trim()) run(() => post("/api/obe-start", { scope: "course", courseId: c.id, off: true, reason: r })); }}>{c.gradesOnly?.startsWith("marked") ? "Make OBE again" : "Grades only…"}</button>{" "}
                    {c.se && <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 10.5, padding: "1px 6px" }} disabled={busy} title="This Subject Expert gets the course in every future batch" onClick={() => run(() => post("/api/coordinator/batch-board", { action: "owner", courseId: c.id }))}>Owner for future batches</button>}
                  </div>}
                </div>))}
              {!col.cs.length && !col.miss.length && <span className="small-note" style={{ margin: 0 }}>None</span>}
            </div>
          </section>); })}
      </div>
    </div>
  );
}

/** The table of where this batch's courses can come from — Preview opens it as a board; Import brings it in. */
export function SourcePicker({ rows, batchId, previewKey }: { rows: SourceRow[]; batchId: string; previewKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function importCurriculum(curriculumId: string, fromPreviousBatch = false) {
    const d = await post("/api/coordinator/courses/import-hec", { batchId, curriculumId, fromPreviousBatch });
    return `Imported ${d.created} course(s)${d.listSkipped ? ` (${d.listSkipped} elective / IDS list options left in the curriculum as the pool)` : ""}.`;
  }
  async function copyBatch(sourceBatchId: string) {
    let cursor: string | undefined, total = 0;
    for (let i = 0; i < 200; i++) { const d = await post("/api/coordinator/courses/copy-from-batch", { sourceBatchId, targetBatchId: batchId, cursor }); total += d.created || 0; cursor = d.nextCursor; if (!d.mightHaveMore || !cursor) break; }
    return `Copied ${total} course(s) as they were taught (elective list options left out).`;
  }
  const go = async (key: string, fn: () => Promise<string>, confirmText: string) => { if (!confirm(confirmText)) return; setBusy(key); setMsg(null); try { setMsg({ ok: true, text: await fn() }); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } setBusy(null); };
  if (!rows.length) return <p className="small-note">No curriculum of this program's discipline is available yet, and no earlier batch to copy from.</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      {msg && <p className={msg.ok ? "small-note" : "err"} style={{ color: msg.ok ? "#1E6B34" : undefined }}>{msg.text}</p>}
      <table style={{ fontSize: 12.5, width: "100%" }}>
        <thead><tr><th>Source</th><th>Courses by category</th><th>CH</th><th>Used by</th><th /></tr></thead>
        <tbody>{rows.map((r) => { const key = `${r.kind === "BATCH" ? "b" : "c"}:${r.id}`; return (
          <tr key={key} style={previewKey === key ? { background: "#F3F7FC" } : undefined}>
            <td><span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: r.badgeColor, borderRadius: 999, padding: "1px 8px", marginRight: 6 }}>{r.badge}</span><b>{r.name}</b>{r.revision ? <span className="small-note"> · rev {r.revision}</span> : null}{r.isNew && <span style={{ fontSize: 11, fontWeight: 700, color: "#1E6B34", marginLeft: 6 }}>New — newer than your last batch&apos;s</span>}
              {r.basedOn && <div className="small-note" style={{ margin: 0 }}>{r.basedOn}</div>}</td>
            <td style={{ fontSize: 11.5 }}>{r.byType.map(([t, n]) => `${t} ${n}`).join(" · ")}{r.listPool ? <div className="small-note" style={{ margin: 0 }}>+ {r.listPool} elective / IDS list options (pool)</div> : null}</td>
            <td>{r.ch}</td>
            <td style={{ fontSize: 11.5 }}>{r.usedBy.slice(0, 4).join(", ") || "—"}{r.usedBy.length > 4 ? " …" : ""}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              <a className="btn btn-secondary btn-sm" href={`/coordinator/courses?batchId=${batchId}&preview=${key}#Add%20courses`}>Preview</a>{" "}
              {r.kind === "CURRICULUM" ? <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => go(key, () => importCurriculum(r.id), `Import ${r.name} into this batch? Each course comes with the university's latest approved plan (or the curriculum's CLOs and lecture plan); elective / IDS list options stay in the curriculum as the pool.`)}>{busy === key ? "Importing…" : "Import"}</button>
                : <>
                  {r.curriculumId && <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => go(key + "L", () => importCurriculum(r.curriculumId!), `Use the same curriculum as ${r.name}, at its latest approved revision?`)}>Same curriculum, latest</button>}{" "}
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => go(key + "T", () => copyBatch(r.id), `Copy ${r.name} as it was taught? Every change made in that semester comes along — including one-off ones (e.g. topics dropped for a strike).`)}>As taught</button>
                </>}
            </td>
          </tr>); })}</tbody>
      </table>
    </div>
  );
}
