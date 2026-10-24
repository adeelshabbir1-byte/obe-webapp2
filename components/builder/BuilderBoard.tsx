"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KINDS, kindInfo, reqPresent, parseReq, splitText } from "../../lib/curriculumTemplates";
import type { BType, BCourse, BTrack } from "../../lib/curriculumBuilder";

type Cur = { id: string; title: string; version: string; authority: string; status: string; chairmanId: string | null; owner: string | null; reference: string | null; plos: number };
type Tpl = { key: string; label: string };
const STEPS = [["types", "1  Course types"], ["place", "2  Place courses"], ["tracks", "3  Elective tracks"], ["review", "4  Review & publish"]] as const;
const STATUS: Record<string, [string, string]> = { DRAFT: ["Draft", "#B26A00"], SUBMITTED: ["Waiting to publish", "#1565C0"], PUBLISHED: ["Published", "#2E7D32"], SUPERSEDED: ["Superseded", "#6B7177"] };
const UNPLACED = "__unplaced";

export default function BuilderBoard(props: { canEdit: boolean; cur: Cur; types: BType[]; tracks: BTrack[]; courses: BCourse[]; step: string; templates: Tpl[]; canPublish: boolean; older: { id: string; label: string }[]; packs?: { key: string; label: string }[] }) {
  const router = useRouter();
  const [step, setStep] = useState(STEPS.some(([k]) => k === props.step) ? props.step : props.types.length ? "place" : "types");
  const [courses, setCourses] = useState(props.courses);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setCourses(props.courses), [props.courses]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); }, [toast]);
  const locked = !props.canEdit;
  const published = props.cur.status === "PUBLISHED" || props.cur.status === "SUPERSEDED";

  async function post(body: Record<string, unknown>, refresh = true) {
    setBusy(true);
    const r = await fetch("/api/curriculum-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: props.cur.id, ...body }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setToast({ ok: r.ok, text: r.ok ? d.message || "Saved." : d.error || "Could not save." });
    if (r.ok && refresh) router.refresh();
    if (!r.ok) router.refresh();
    return r.ok;
  }

  // ---------- checks, computed live from local state
  const live = useMemo(() => {
    const per = new Map(props.types.map((t) => {
      const cs = courses.filter((c) => c.category === t.name);
      const ch = cs.reduce((s, c) => s + c.creditHours, 0);
      const missing = t.required.filter((r) => !reqPresent(r, cs.map((c) => c.title)));
      const counts = kindInfo(t.kind).counts;
      const chOk = !counts || ((t.minCredits == null || ch >= t.minCredits) && (t.maxCredits == null || ch <= t.maxCredits));
      const nOk = t.minCourses == null || cs.length >= t.minCourses;
      return [t.name, { cs, ch, missing, ok: chOk && nOk && !missing.length, chOk, nOk }] as const;
    }));
    const total = props.types.filter((t) => kindInfo(t.kind).counts).reduce((s, t) => s + (per.get(t.name)?.ch || 0), 0);
    const unplaced = courses.filter((c) => !props.types.some((t) => t.name === c.category));
    return { per, total, unplaced, met: Array.from(per.values()).filter((p) => p.ok).length };
  }, [courses, props.types]);
  const target = props.types.filter((t) => kindInfo(t.kind).counts).reduce((s, t) => s + (t.minCredits || 0), 0);

  const [st, color] = STATUS[props.cur.status] || [props.cur.status, "#555"];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <style>{`
        .bb-steps{display:flex;gap:4px;flex-wrap:wrap}
        .bb-step{border:0;border-radius:999px;padding:8px 16px;font:600 13px inherit;cursor:pointer;background:#EEF1F5;color:#334}
        .bb-step[aria-current="step"]{background:#0D2A4A;color:#fff}
        .bb-chip{display:inline-flex;gap:6px;align-items:center;border-radius:999px;padding:4px 10px;font-size:12.5px;background:#F3F5F8}
        .bb-cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px;padding-bottom:10px;align-items:start}
        .bb-col{min-width:0;background:#F6F8FA;border:1px solid #E1E5EA;border-radius:12px;display:flex;flex-direction:column}
        .bb-col.over{outline:3px dashed #1565C0;outline-offset:-3px;background:#EEF4FB}
        .bb-colhead{padding:10px 12px;border-bottom:1px solid #E1E5EA;background:#fff;border-radius:12px 12px 0 0}
        .bb-list{padding:8px;display:grid;gap:5px}
        .bb-move{display:none}.bb-card:hover .bb-move,.bb-card:focus-within .bb-move{display:block}@media (hover:none){.bb-move{display:block}}
        .bb-fold{border:0;background:none;cursor:pointer;color:#556;font-size:13px;padding:0 4px}
        .bb-card{background:#fff;border:1px solid #DDE2E8;border-radius:8px;padding:5px 8px;cursor:grab;box-shadow:0 1px 0 rgba(0,0,0,.03)}
        .bb-card:hover{border-color:#9CB3CC}
        .bb-card:focus-visible{outline:2px solid #1565C0}
        .bb-bar{height:6px;border-radius:3px;background:#E6EAEF;overflow:hidden;margin-top:6px}
        .bb-ghost{border:1px dashed #C9A227;background:#FFFBEA;border-radius:8px;padding:6px 9px;font-size:12px;cursor:pointer;text-align:left;color:#7A5B00}
        .bb-toast{position:fixed;right:max(18px,env(safe-area-inset-right,0px));bottom:max(18px,env(safe-area-inset-bottom,0px));padding:10px 16px;border-radius:10px;color:#fff;font-weight:600;z-index:50;box-shadow:0 6px 20px rgba(0,0,0,.18)}
        @media (prefers-reduced-motion: no-preference){.bb-card{transition:transform .08s}.bb-card:active{transform:scale(.98)}}
      `}</style>
      <div className="card" style={{ margin: 0, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7177" }}>{props.cur.authority} · {props.cur.owner || "Official"}{props.cur.reference ? ` · ${props.cur.reference}` : ""}</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{props.cur.title} <span style={{ fontWeight: 500 }}>{props.cur.version}</span> <span style={{ fontSize: 12, color, border: `1px solid ${color}`, borderRadius: 999, padding: "2px 8px", verticalAlign: "middle" }}>{st}</span></div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className="bb-chip" title="Credit hours of the counted types"><b>{live.total}</b> / {target || "—"} CH</span>
          <span className="bb-chip"><b style={{ color: live.met === props.types.length && props.types.length ? "#2E7D32" : "#B26A00" }}>{live.met}</b> of {props.types.length} types met</span>
          <span className="bb-chip" style={{ background: live.unplaced.length ? "#FDECEA" : undefined }}><b>{live.unplaced.length}</b> not placed</span>
        </div>
      </div>
      <nav className="bb-steps" aria-label="Steps">{STEPS.map(([k, l]) => <button key={k} type="button" className="bb-step" aria-current={step === k ? "step" : undefined} onClick={() => setStep(k)}>{l}</button>)}</nav>
      {published && !locked && <div className="card" style={{ margin: 0, borderLeft: "4px solid #1565C0", fontSize: 13.5 }}>This version is <b>{st.toLowerCase()}</b>: your changes go to the master straight away. Program Leads whose batches use it see them under “My Curriculum vs Master” and decide whether to apply them.</div>}
      {locked && <div className="card" style={{ margin: 0, borderLeft: "4px solid #6B7177", fontSize: 13.5 }}>You can look at this curriculum but not change it.</div>}
      {step === "types" && <TypesStep types={props.types} templates={props.templates} post={post} busy={busy} locked={locked} onDone={() => setStep("place")} />}
      {step === "place" && <PlaceStep types={props.types} courses={courses} setCourses={setCourses} live={live} post={post} locked={locked} />}
      {step === "tracks" && <TracksStep types={props.types} tracks={props.tracks} courses={courses} setCourses={setCourses} post={post} locked={locked} />}
      {step === "review" && <ReviewStep cur={props.cur} types={props.types} tracks={props.tracks} courses={courses} live={live} post={post} canPublish={props.canPublish} older={props.older} busy={busy} packs={props.packs || []} locked={locked} />}
      {toast && <div role="status" className="bb-toast" style={{ background: toast.ok ? "#1E6B34" : "#B3261E" }}>{toast.text}</div>}
    </div>
  );
}

type Post = (b: Record<string, unknown>, refresh?: boolean) => Promise<boolean>;

// ============================================================ Step 1: types
function TypesStep({ types, templates, post, busy, locked, onDone }: { types: BType[]; templates: Tpl[]; post: Post; busy: boolean; locked: boolean; onDone: () => void }) {
  const blank = (): BType => ({ id: "", name: "", kind: "CORE", minCourses: null, minCredits: null, maxCredits: null, required: [], note: null, position: 0, prefilled: false });
  const [rows, setRows] = useState<BType[]>(types.length ? types : []);
  const [tpl, setTpl] = useState("");
  useEffect(() => setRows(types), [types]);
  const set = (i: number, p: Partial<BType>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= rows.length) return; const x = rows.slice(); [x[i], x[j]] = [x[j], x[i]]; setRows(x); };
  const pre = types.some((t) => t.prefilled);
  const n = (v: number | null) => (v == null ? "" : v);
  const num = (v: string) => (v === "" ? null : Math.max(0, Math.round(Number(v))));
  const total = rows.filter((r) => kindInfo(r.kind).counts).reduce((s, r) => s + (r.minCredits || 0), 0);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ margin: 0 }}>
        <p style={{ margin: "0 0 8px" }}>A <b>course type</b> is a category of the curriculum — Computing Core, Domain Core, General Education, Elective slots … Give each its <b>number of courses</b>, its <b>credit hours</b> and the <b>courses it must contain</b>. The next step checks every column against these targets as you place courses.</p>
        {pre && <p style={{ margin: 0, padding: "8px 10px", background: "#FFF8E1", borderRadius: 8, fontSize: 13 }}>Pre-filled from what is generally known of this curriculum. <b>Check each number and course against the curriculum document</b>, then save.</p>}
        {!locked && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} aria-label="Template"><option value="">Load the types of…</option>{templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!tpl || busy} onClick={() => post({ action: "applyTemplate", templateKey: tpl })}>Load (replaces the types below)</button>
        </div>}
      </div>
      {rows.map((r, i) => {
        const k = kindInfo(r.kind);
        return (
          <div key={r.id || `new${i}`} className="card" style={{ margin: 0, borderLeft: `6px solid ${k.color}`, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
              <label style={{ flex: "1 1 220px" }}>Type name<br /><input value={r.name} disabled={locked} onChange={(e) => set(i, { name: e.target.value })} style={{ width: "100%", fontWeight: 700 }} /></label>
              <label>Behaves as<br /><select value={r.kind} disabled={locked} onChange={(e) => set(i, { kind: e.target.value as BType["kind"] })}>{KINDS.map((x) => <option key={x.kind} value={x.kind}>{x.label}</option>)}</select></label>
              <label>Courses (at least)<br /><input type="number" min={0} value={n(r.minCourses)} disabled={locked} onChange={(e) => set(i, { minCourses: num(e.target.value) })} style={{ width: 90 }} /></label>
              <label>Credit hours: min<br /><input type="number" min={0} value={n(r.minCredits)} disabled={locked || !k.counts} onChange={(e) => set(i, { minCredits: num(e.target.value) })} style={{ width: 80 }} /></label>
              <label>max<br /><input type="number" min={0} value={n(r.maxCredits)} disabled={locked || !k.counts} onChange={(e) => set(i, { maxCredits: num(e.target.value) })} style={{ width: 80 }} /></label>
              {!locked && <span style={{ display: "flex", gap: 4 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>↑</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => move(i, 1)} aria-label="Move down" disabled={i === rows.length - 1}>↓</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove type">Remove</button>
              </span>}
            </div>
            <div className="small-note">{k.help}{!k.counts ? " — its credit hours are not added to the degree." : ""}</div>
            <label>Courses this type must contain <span className="small-note">(one per line — the board shows any that are missing)</span><br />
              <textarea rows={Math.min(8, Math.max(2, r.required.length + 1))} disabled={locked} value={r.required.join("\n")} onChange={(e) => set(i, { required: e.target.value.split("\n") })} style={{ width: "100%", fontSize: 13 }} /></label>
          </div>
        );
      })}
      {!locked && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows([...rows, blank()])}>+ Add a type</button>
        <button type="button" className="btn" disabled={busy || !rows.length} onClick={async () => { if (await post({ action: "saveTypes", types: rows.map((r) => ({ ...r, required: r.required.map((x) => x.trim()).filter(Boolean) })) })) onDone(); }}>Save types and place courses →</button>
        <span className="small-note">Counted types add up to <b>{total}</b> CH (HEC UG policy: 120–144).</span>
      </div>}
    </div>
  );
}

// ============================================================ Step 2: place courses
function CourseCard({ c, color, onOpen, draggable = true, extra, types, onMove }: { c: BCourse; color: string; onOpen: () => void; draggable?: boolean; extra?: React.ReactNode; types?: BType[]; onMove?: (to: string) => void }) {
  return (
    <div className="bb-card" draggable={draggable} tabIndex={0} role="button" aria-label={`${c.code} ${c.title}, ${c.creditHours} credit hours. Press Enter to edit.`}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} style={{ borderLeft: `4px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "baseline" }}>
        <span style={{ fontSize: 13, lineHeight: 1.3, minWidth: 0 }}><span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 11, fontWeight: 700, color: "#556", marginRight: 6 }}>{c.code}</span>{c.title}</span>
        <span style={{ fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }} title={c.lab ? `${c.creditHours - c.lab} theory + ${c.lab} lab credit hours` : undefined}>{splitText(c.creditHours, c.lab)} CH{c.semesterNumber ? <span style={{ fontWeight: 500, color: "#778" }}> · S{c.semesterNumber}</span> : null}</span>
      </div>
      <div style={{ fontSize: 10.5, color: "#778", display: "flex", gap: 6 }} title="Course learning outcomes (mapped to a PLO) and lectures in the lecture plan">
        <span style={{ color: c.clos ? (c.mappedClos < c.clos ? "#B26A00" : "#2E7D32") : "#A0A6AD" }}>{c.clos ? `${c.clos} CLO${c.mappedClos < c.clos ? ` (${c.clos - c.mappedClos} unmapped)` : ""}` : "no CLOs"}</span>
        <span style={{ color: c.lectures >= 32 ? "#2E7D32" : c.lectures ? "#B26A00" : "#A0A6AD" }}>{c.lectures ? `${c.lectures} lectures` : "no lecture plan"}</span>
      </div>
      {c.from && <div style={{ fontSize: 10.5, color: c.fromOtherEdition ? "#B26A00" : "#556" }} title="CLOs / lecture plan copied from the same-named course of this curriculum">from {c.from}{c.fromOtherEdition ? " (other edition)" : ""}</div>}
      {types && onMove && <select value="" aria-label={`Move ${c.title} to`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => { if (e.target.value) onMove(e.target.value); }} className="bb-move" style={{ marginTop: 4, fontSize: 11, padding: "1px 4px", width: "100%", color: "#556", background: "#F6F8FA", border: "1px solid #E1E5EA", borderRadius: 6 }}>
        <option value="">Move to…</option>{types.filter((t) => t.name !== c.category).map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}</select>}
      {extra}
    </div>
  );
}

function Editor({ c, types, post, close, locked }: { c: BCourse; types: BType[]; post: Post; close: () => void; locked: boolean }) {
  const [v, setV] = useState({ code: c.code, title: c.title, creditHours: String(c.creditHours), lab: String(c.lab || 0), semesterNumber: c.semesterNumber ? String(c.semesterNumber) : "", type: c.category });
  return (
    <div role="dialog" aria-label={`Edit ${c.code}`} style={{ position: "fixed", inset: 0, background: "rgba(13,42,74,.35)", display: "grid", placeItems: "center", zIndex: 40, padding: 16 }} onClick={close}>
      <div className="card" style={{ margin: 0, width: "min(520px, 100%)", display: "grid", gap: 10 }} onClick={(e) => e.stopPropagation()}>
        <b style={{ fontSize: 16 }}>{c.code} · {c.title}</b>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label>Code<br /><input value={v.code} disabled={locked} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} style={{ width: "100%" }} /></label>
          <label>Type<br /><select value={v.type} disabled={locked} onChange={(e) => setV({ ...v, type: e.target.value })} style={{ width: "100%" }}>{types.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}</select></label>
          <label style={{ gridColumn: "1 / -1" }}>Title<br /><input value={v.title} disabled={locked} onChange={(e) => setV({ ...v, title: e.target.value })} style={{ width: "100%" }} /></label>
          <label>Credit hours<br /><input type="number" min={0} max={12} value={v.creditHours} disabled={locked} onChange={(e) => setV({ ...v, creditHours: e.target.value })} style={{ width: "100%" }} /></label>
          <label>Of which lab<br /><input type="number" min={0} max={12} value={v.lab} disabled={locked} onChange={(e) => setV({ ...v, lab: e.target.value })} style={{ width: "100%" }} /></label>
          <label>Semester<br /><input type="number" min={1} max={12} value={v.semesterNumber} disabled={locked} onChange={(e) => setV({ ...v, semesterNumber: e.target.value })} style={{ width: "100%" }} /></label>
          <div className="small-note" style={{ alignSelf: "end" }}>{Number(v.lab) > 0 ? `${Number(v.creditHours) - Number(v.lab)} theory + ${v.lab} lab credit hours (lab = 3 contact hours a week per credit hour)` : "No lab"}</div>
        </div>
        <div className="small-note">{c.prerequisite ? `Prerequisite: ${c.prerequisite} · ` : ""}{c.clos} CLO(s) · used by {c.adopted} batch course(s)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!locked && <button type="button" className="btn btn-sm" onClick={async () => { const ok = await post({ action: "updateCourse", courseId: c.id, code: v.code, title: v.title, creditHours: Number(v.creditHours), lab: Number(v.lab) || 0, semesterNumber: v.semesterNumber }); if (ok && v.type !== c.category) await post({ action: "place", courseId: c.id, type: v.type }); if (ok) close(); }}>Save</button>}
          <button type="button" className="btn btn-secondary btn-sm" onClick={close}>Close</button>
          {!locked && !c.adopted && <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: "auto", color: "#B3261E" }} onClick={async () => { if (await post({ action: "removeCourse", courseId: c.id })) close(); }}>Remove course</button>}
        </div>
      </div>
    </div>
  );
}

function PlaceStep({ types, courses, setCourses, live, post, locked }: { types: BType[]; courses: BCourse[]; setCourses: (c: BCourse[]) => void; live: { per: Map<string, { cs: BCourse[]; ch: number; missing: string[]; ok: boolean; chOk: boolean; nOk: boolean }>; unplaced: BCourse[] }; post: Post; locked: boolean }) {
  const [over, setOver] = useState<string | null>(null);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<BCourse | null>(null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState<{ type: string; title: string; ch: string } | null>(null);
  if (!types.length) return <div className="card">Define the course types first (step 1).</div>;
  const drop = async (typeName: string, id: string) => {
    const c = courses.find((x) => x.id === id);
    if (!c || c.category === typeName || locked || typeName === UNPLACED) return;
    setCourses(courses.map((x) => (x.id === id ? { ...x, category: typeName } : x))); // instant
    await post({ action: "place", courseId: id, type: typeName }, false);
  };
  const match = (c: BCourse) => !q || `${c.code} ${c.title}`.toLowerCase().includes(q.toLowerCase());
  const cols: { key: string; t: BType | null }[] = [...(live.unplaced.length ? [{ key: UNPLACED, t: null }] : []), ...types.map((t) => ({ key: t.name, t }))];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="Find a course…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a course" style={{ width: 240 }} />
        {!locked && live.unplaced.length > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => post({ action: "autoPlace" })}>Place the {live.unplaced.length} unplaced automatically</button>}
        <span className="small-note">Drag a card to another column (or use its “Move to…”). Click a card to edit it. Yellow cards are courses the column must have but doesn&apos;t — one click adds them.</span>
      </div>
      <div className="bb-cols">
        {cols.map(({ key, t }) => {
          const k = t ? kindInfo(t.kind) : { color: "#C62828", counts: false, label: "Not placed" };
          const p = t ? live.per.get(t.name)! : null;
          const cs = (t ? p!.cs : live.unplaced).slice().sort((a, b) => (a.semesterNumber ?? 99) - (b.semesterNumber ?? 99) || a.code.localeCompare(b.code));
          const pct = t && t.minCredits ? Math.min(100, Math.round((100 * p!.ch) / t.minCredits)) : 100;
          return (
            <section key={key} className={`bb-col${over === key ? " over" : ""}`} aria-label={t ? t.name : "Not placed"}
              onDragOver={(e) => { if (key !== UNPLACED) { e.preventDefault(); setOver(key); } }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); drop(key, e.dataTransfer.getData("text/plain")); }}>
              <header className="bb-colhead" style={{ borderTop: `5px solid ${k.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "baseline" }}>
                  <b style={{ fontSize: 14 }}>{t ? t.name : "Not placed yet"}</b>
                  <span>{t && <span aria-label={p!.ok ? "requirements met" : "requirements not met"} style={{ fontWeight: 800, color: p!.ok ? "#2E7D32" : "#C62828" }}>{p!.ok ? "✓" : "✗"}</span>}
                    <button type="button" className="bb-fold" aria-expanded={!folded.has(key)} title={folded.has(key) ? "Show the courses" : "Hide the courses of this type"} onClick={() => setFolded((f) => { const n = new Set(f); if (n.has(key)) n.delete(key); else n.add(key); return n; })}>{folded.has(key) ? "▸" : "▾"}</button></span>
                </div>
                {t ? (
                  <>
                    <div style={{ fontSize: 12.5, marginTop: 2 }}>
                      <b style={{ color: p!.chOk ? undefined : "#C62828" }}>{p!.ch}</b>{k.counts ? <> / {t.minCredits ?? "—"}{t.maxCredits ? `–${t.maxCredits}` : ""} CH</> : " CH listed (not counted)"} · <b style={{ color: p!.nOk ? undefined : "#C62828" }}>{cs.length}</b>{t.minCourses ? ` / ${t.minCourses}` : ""} courses
                    </div>
                    {k.counts && t.minCredits ? <div className="bb-bar"><div style={{ width: `${pct}%`, height: "100%", background: p!.chOk ? "#2E7D32" : k.color }} /></div> : null}
                  </>
                ) : <div style={{ fontSize: 12.5, color: "#C62828" }}>Drag each into its type</div>}
              </header>
              {!folded.has(key) && <div className="bb-list">
                {t && p!.missing.map((m) => { const q = parseReq(m); return <button key={m} type="button" className="bb-ghost" disabled={locked} title="Click to add it to this column" onClick={() => post({ action: "addCourse", type: t.name, title: m })}>＋ <b>{q.title}</b> <span style={{ float: "right" }}>{q.ch != null ? `${splitText(q.ch, q.lab)} CH` : ""}</span></button>; })}
                {cs.filter(match).map((c) => <CourseCard key={c.id} c={c} color={k.color} onOpen={() => setOpen(c)} draggable={!locked} types={locked ? undefined : types} onMove={(to) => drop(to, c.id)} />)}
                {t && !locked && (adding?.type === t.name ? (
                  <div className="bb-card" style={{ cursor: "default", display: "grid", gap: 6 }}>
                    <input autoFocus placeholder="Course title" value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} aria-label="New course title" />
                    <div style={{ display: "flex", gap: 6 }}><input type="number" min={0} max={12} value={adding.ch} onChange={(e) => setAdding({ ...adding, ch: e.target.value })} style={{ width: 60 }} aria-label="Credit hours" /><span className="small-note" style={{ alignSelf: "center" }}>CH</span>
                      <button type="button" className="btn btn-sm" onClick={async () => { if (await post({ action: "addCourse", type: t.name, title: adding.title, creditHours: Number(adding.ch) })) setAdding(null); }}>Add</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(null)}>Cancel</button></div>
                  </div>
                ) : <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding({ type: t.name, title: "", ch: "3" })}>+ Add a course</button>)}
              </div>}
            </section>
          );
        })}
      </div>
      {open && <Editor c={open} types={types} post={post} close={() => setOpen(null)} locked={locked} />}
    </div>
  );
}

// ============================================================ Step 3: elective tracks
function TracksStep({ types, tracks, courses, setCourses, post, locked }: { types: BType[]; tracks: BTrack[]; courses: BCourse[]; setCourses: (c: BCourse[]) => void; post: Post; locked: boolean }) {
  const [over, setOver] = useState<string | null>(null);
  const [name, setName] = useState("");
  const listT = types.find((t) => t.kind === "ELECTIVE_LIST");
  if (!listT) return <div className="card">Add a type that “Behaves as” <b>Elective list (options)</b> on step 1, then sort its courses into tracks here.</div>;
  const list = courses.filter((c) => c.category === listT.name);
  const slots = courses.filter((c) => types.some((t) => t.kind === "ELECTIVE_SLOT" && t.name === c.category)).length;
  const nameOf = new Map(tracks.map((t) => [t.id, t.name]));
  const drop = async (trackId: string, id: string, move: boolean, from: string | null) => {
    const c = courses.find((x) => x.id === id); if (!c || locked) return;
    if (trackId === "__none") { if (from) { setCourses(courses.map((x) => (x.id === id ? { ...x, tracks: x.tracks.filter((t) => t !== from) } : x))); await post({ action: "track", courseId: id, trackId: from, on: false }, false); } return; }
    if (c.tracks.includes(trackId)) return;
    setCourses(courses.map((x) => (x.id === id ? { ...x, tracks: [...x.tracks.filter((t) => !(move && t === from)), trackId] } : x)));
    await post({ action: "track", courseId: id, trackId, move: move && !!from, fromTrackId: from || "" }, false);
  };
  const col = (id: string, title: string, cs: BCourse[], need: number | null, color: string) => (
    <section key={id} className={`bb-col${over === id ? " over" : ""}`} aria-label={title}
      onDragOver={(e) => { e.preventDefault(); setOver(id); }} onDragLeave={() => setOver(null)}
      onDrop={(e) => { e.preventDefault(); setOver(null); const [cid, from] = e.dataTransfer.getData("text/plain").split("|"); drop(id, cid, e.shiftKey, from || null); }}>
      <header className="bb-colhead" style={{ borderTop: `5px solid ${color}` }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><b>{title}</b>{need != null && <span style={{ fontWeight: 800, color: cs.length >= need ? "#2E7D32" : "#C62828" }}>{cs.length >= need ? "✓" : "✗"}</span>}</div>
        <div style={{ fontSize: 12.5 }}>{cs.length} course(s){need != null ? ` · needs ${need} to fill the slots` : ""}</div>
        {id !== "__none" && !locked && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 4, fontSize: 11 }} onClick={() => post({ action: "removeTrack", trackId: id })}>Remove track</button>}
      </header>
      <div className="bb-list">{cs.map((c) => (
        <div key={c.id} className="bb-card" draggable={!locked} tabIndex={0} onDragStart={(e) => e.dataTransfer.setData("text/plain", `${c.id}|${id === "__none" ? "" : id}`)} style={{ borderLeft: `4px solid ${color}` }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 11.5, fontWeight: 700 }}>{c.code}</span><span style={{ fontSize: 11.5, fontWeight: 800 }}>{splitText(c.creditHours, c.lab)} CH</span></div>
          <div style={{ fontSize: 13 }}>{c.title}</div>
          {c.tracks.length > 1 && <div style={{ fontSize: 11, color: "#6A1B9A" }}>also in {c.tracks.filter((t) => t !== id).map((t) => nameOf.get(t)).join(", ")}</div>}
          {id !== "__none" && !locked && <button type="button" aria-label={`Take ${c.title} out of ${title}`} style={{ border: 0, background: "none", color: "#B3261E", fontSize: 11, padding: 0, cursor: "pointer" }} onClick={() => drop("__none", c.id, false, id)}>remove from this track</button>}
        </div>
      ))}</div>
    </section>
  );
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="card" style={{ margin: 0, fontSize: 13.5 }}>
        Sort the <b>{list.length}</b> courses of “{listT.name}” into specialisation tracks. <b>Drag</b> a course into a track to <b>add</b> it — it stays in its other tracks, so a shared elective like Machine Learning can sit in AI, CS and Data Science together. <b>Shift + drag</b> moves it instead. The curriculum has <b>{slots}</b> elective slot(s), so each track should offer at least that many courses.
        {!locked && <div style={{ display: "flex", gap: 6, marginTop: 8 }}><input placeholder="New track, e.g. Robotics" value={name} onChange={(e) => setName(e.target.value)} aria-label="New track name" /><button type="button" className="btn btn-secondary btn-sm" disabled={!name.trim()} onClick={async () => { if (await post({ action: "addTrack", name })) setName(""); }}>Add track</button></div>}
      </div>
      <div className="bb-cols">
        {col("__none", "Not in any track", list.filter((c) => !c.tracks.length), null, "#9E9E9E")}
        {tracks.map((t, i) => col(t.id, t.name, list.filter((c) => c.tracks.includes(t.id)), t.minCourses ?? slots, ["#6A1B9A", "#1565C0", "#2E7D32", "#C62828", "#EF6C00", "#00838F", "#AD1457", "#5D4037"][i % 8]))}
      </div>
    </div>
  );
}

// ============================================================ Step 4: review
function ReviewStep({ cur, types, tracks, courses, live, post, canPublish, older, busy, packs, locked }: { packs: { key: string; label: string }[]; locked: boolean; cur: Cur; types: BType[]; tracks: BTrack[]; courses: BCourse[]; live: { per: Map<string, { cs: BCourse[]; ch: number; missing: string[]; ok: boolean }>; total: number; unplaced: BCourse[] }; post: Post; canPublish: boolean; older: { id: string; label: string }[]; busy: boolean }) {
  const [sup, setSup] = useState("");
  const listT = types.find((t) => t.kind === "ELECTIVE_LIST");
  const list = listT ? courses.filter((c) => c.category === listT.name) : [];
  const items: [string, boolean, string][] = [
    ...types.map((t) => { const p = live.per.get(t.name)!; return [t.name, p.ok, `${p.ch} CH, ${p.cs.length} courses${p.missing.length ? ` — missing: ${p.missing.join(", ")}` : ""}`] as [string, boolean, string]; }),
    ["Total credit hours", live.total >= 120 && live.total <= 144, `${live.total} CH (HEC UG policy 120–144)`],
    ["Every course placed", !live.unplaced.length, live.unplaced.length ? `${live.unplaced.length} not placed` : "all placed"],
    ...(listT ? [["Elective list sorted into tracks", !list.some((c) => !c.tracks.length), `${list.filter((c) => !c.tracks.length).length} not in any track; ${tracks.length} track(s)`] as [string, boolean, string]] : []),
    ["Every counted course has a semester", courses.filter((c) => types.some((t) => t.name === c.category && kindInfo(t.kind).counts) && !c.semesterNumber).length === 0, `${courses.filter((c) => types.some((t) => t.name === c.category && kindInfo(t.kind).counts) && !c.semesterNumber).length} without a semester`],
  ];
  const ok = items.every((i) => i[1]);
  // The master copy: what Subject Experts and instructors inherit.
  const countedT = new Set(types.filter((t) => kindInfo(t.kind).counts && !["ELECTIVE_SLOT", "INTERNSHIP", "NONCREDIT"].includes(t.kind)).map((t) => t.name));
  const own = courses.filter((c) => countedT.has(c.category) && !/certification/i.test(c.title));
  const master: [string, number, number, string][] = [
    ["Required courses with CLOs", own.filter((c) => c.clos).length, own.length, "Elective slots take the chosen elective's CLOs"],
    ["CLOs mapped to a PLO", courses.reduce((a, c) => a + c.mappedClos, 0), courses.reduce((a, c) => a + c.clos, 0), "HEC-tagged where the document tags them, otherwise suggested by the system"],
    ["Required courses with a 32-lecture plan", own.filter((c) => c.lectures >= 32).length, own.length, "Each lecture is linked to the CLO it serves"],
    ...(listT ? [["Track electives with CLOs", list.filter((c) => c.clos).length, list.length, "Official CLOs from the curriculum document"] as [string, number, number, string], ["Track electives with a lecture plan", list.filter((c) => c.lectures >= 32).length, list.length, "Written by the Subject Expert when the elective is first offered"] as [string, number, number, string]] : []),
  ];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ margin: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <h3 style={{ margin: 0 }}>Master copy</h3>
          <span className="small-note">{cur.plos ? `${cur.plos} PLOs` : "No PLOs yet"} · semester, CLOs, PLO mapping and lecture plan flow into every batch that imports this curriculum</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginTop: 10 }}>
          {master.map(([l, n, of, note]) => { const pct = of ? Math.round((n / of) * 100) : 100; return (
            <div key={l} style={{ border: "1px solid #E1E5EA", borderRadius: 10, padding: "8px 10px" }} title={note}>
              <div style={{ fontSize: 12, color: "#556" }}>{l}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: pct === 100 ? "#2E7D32" : pct ? "#B26A00" : "#C62828" }}>{n}<span style={{ fontSize: 12, fontWeight: 500, color: "#778" }}> / {of}</span></div>
              <div style={{ height: 4, background: "#EEF1F4", borderRadius: 2 }}><div style={{ width: `${pct}%`, height: 4, borderRadius: 2, background: pct === 100 ? "#2E7D32" : "#E0A030" }} /></div>
              <div className="small-note" style={{ marginTop: 4 }}>{note}</div>
            </div>); })}
        </div>
        {!locked && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => post({ action: "fillShared" })}>Fill empty CLOs, PLO mapping and lecture plans from same-named courses of other curricula</button>
          <span className="small-note">e.g. Programming Fundamentals of BS SE from Programming Fundamentals of BS CS — same edition preferred; the source is shown on each course.</span>
        </div>}
        {!locked && packs.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
          {packs.map((p) => <button key={p.key} type="button" className="btn btn-sm" disabled={busy} onClick={() => post({ action: "fillContent", pack: p.key })}>Fill empty semesters, PLOs, CLOs and lecture plans from {p.label}</button>)}
          <span className="small-note">Only empty things are filled; nothing already entered changes. Edit CLOs and lectures in the full editor.</span>
        </div>}
      </div>
      <div className="card" style={{ margin: 0 }}>
        <h3 style={{ marginTop: 0 }}>{ok ? "Ready to publish" : "Before publishing"}</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>{items.map(([l, good, d]) => <li key={l} style={{ display: "flex", gap: 10 }}><span style={{ fontWeight: 800, color: good ? "#2E7D32" : "#C62828", width: 16 }}>{good ? "✓" : "✗"}</span><span><b>{l}</b> — <span className="small-note">{d}</span></span></li>)}</ul>
      </div>
      <div className="card" style={{ margin: 0, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {cur.status === "DRAFT" && <button type="button" className="btn" disabled={busy} onClick={() => post({ action: "submit" })}>Submit for publishing</button>}
        {canPublish && cur.status !== "PUBLISHED" && <>
          {older.length > 0 && <select value={sup} onChange={(e) => setSup(e.target.value)} aria-label="Version this one replaces"><option value="">Replaces no earlier version</option>{older.map((o) => <option key={o.id} value={o.id}>Replaces {o.label}</option>)}</select>}
          <button type="button" className="btn btn-brass" disabled={busy} onClick={() => post({ action: "publish", supersede: sup || undefined })}>{ok ? "Publish" : "Publish anyway"}</button>
        </>}
        <span className="small-note">Published versions are read-only; universities import them from the Curriculum Library.</span>
      </div>
    </div>
  );
}
