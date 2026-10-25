"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { assessName } from "../lib/assessName";

// One course's outcome flow, left to right: Assessments → CLOs → GAs (each CLO linked straight to its GA).
// Each CLO shows the GA it maps to. Pick a GA (or a CLO / assessment) to see only what is linked to it.

type Clo = { id: string; code: string; statement: string; bloom: string; ploNumber: number | null; weight: number; attainment: number | null; avg: number | null; contribution?: number | null };
type Asmt = { id: string; type: string; label: string; marksPct: number; cloId: string | null; reached: number | null; share: number };
type Ga = { number: number; title: string; attainment: number | null; weight: number | null };
type Pick = { kind: "A" | "L" | "G"; id: string } | null;

const TYPE_COLOR: Record<string, string> = { quiz: "#2F6FB0", assignment: "#2E7D5B", midterm: "#9A7B0A", final: "#A63D40", lab: "#0F7C8A", project: "#7A5C2E" };
const tc = (t: string) => TYPE_COLOR[t.toLowerCase()] || "#3E5C8A";
const AMBER = "#B26A00";

function Att({ v, target }: { v: number | null; target: number }) {
  if (v === null) return <span className="cgf-muted">no results yet</span>;
  const ok = v >= target;
  return <span title={`${v}% of students reached it (target ${target}%)`} className="cgf-att" style={{ background: ok ? "#E2F4E8" : "#FBEED2", color: ok ? "#1F5E36" : "#95650F" }}>{v}%</span>;
}

export default function CourseGaFlow({ course, clos: rawClos, assessments: rawA, gas, target, edit }: { course: { code: string; title: string; creditHours: number }; clos: Clo[]; assessments: Asmt[]; gas: Ga[]; target: number; edit?: { courseId: string; source: "SE" | "INSTRUCTOR" } }) {
  const router = useRouter();
  // Always in order, so lines don't cross: CLOs grouped by the GA they map to (bigger contributor first), then each CLO's
  // assessments behind it (largest share of the CLO first); unlinked ones last.
  const clos = useMemo(() => [...rawClos].sort((a, b) => (a.ploNumber ?? 999) - (b.ploNumber ?? 999) || (b.contribution ?? b.weight) - (a.contribution ?? a.weight) || a.code.localeCompare(b.code)), [rawClos]);
  const assessments = useMemo(() => { const ord = new Map(clos.map((c, i) => [c.id, i])); return [...rawA].sort((a, b) => (ord.get(a.cloId || "") ?? 999) - (ord.get(b.cloId || "") ?? 999) || (b.share || 0) - (a.share || 0)); }, [rawA, clos]);
  const [editing, setEditing] = useState<{ id: string; v: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  // New share of its CLO for one assessment: the CLO's total marks stay the same; the others of that CLO share the rest
  // in their current proportions. Saved through the assessment plan's own save (all its checks apply).
  async function saveShare(a: Asmt, pct: number) {
    if (!edit || !a.cloId || isNaN(pct) || pct <= 0 || pct >= 100) { setMsg("Give a share between 0 and 100."); return; }
    const same = rawA.filter((x) => x.cloId === a.cloId);
    const T = same.reduce((t, x) => t + x.marksPct, 0);
    const mine = Math.round((pct / 100) * T * 100) / 100;
    const restOld = T - a.marksPct;
    const others = same.filter((x) => x.id !== a.id);
    const edits = [{ instrumentId: a.id, marksPct: mine }, ...others.map((x) => ({ instrumentId: x.id, marksPct: Math.round((restOld > 0 ? (x.marksPct * (T - mine)) / restOld : (T - mine) / others.length) * 100) / 100 }))];
    const diff = Math.round((T - edits.reduce((t, e) => t + e.marksPct, 0)) * 100) / 100;
    if (diff && edits.length > 1) edits[edits.length - 1].marksPct = Math.round((edits[edits.length - 1].marksPct + diff) * 100) / 100;
    setSaving(true); setMsg("");
    const url = edit.source === "SE" ? `/api/subjectexpert/courses/${edit.courseId}/instruments/batch-save` : `/api/instructor/courses/${edit.courseId}/instruments/batch-save`;
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edits }) });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setMsg(d.error || "Could not save — the plan may be locked (marks entered or approved by the OMC)."); return; }
    setEditing(null); setMsg(`${assessName(a.type, a.label)} is now ${pct}% of its CLO.`); router.refresh();
  }
  const [pick, setPick] = useState<Pick>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ k: string; d: string; on: boolean; color: string; label: string; mx: number; my: number }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // GAs: every GA a CLO maps to, plus GAs the course is linked to without a CLO (shown amber).
  const allGas = useMemo(() => {
    const m = new Map<number, Ga>(gas.map((g) => [g.number, g]));
    for (const c of clos) if (c.ploNumber !== null && !m.has(c.ploNumber)) m.set(c.ploNumber, { number: c.ploNumber, title: "", attainment: null, weight: null });
    return Array.from(m.values()).sort((a, b) => a.number - b.number);
  }, [gas, clos]);

  // What is visible for the current pick.
  const vis = useMemo(() => {
    let L = new Set(clos.map((c) => c.id)), A = new Set(assessments.map((a) => a.id)), G = new Set(allGas.map((g) => String(g.number)));
    if (pick?.kind === "G") {
      L = new Set(clos.filter((c) => String(c.ploNumber) === pick.id).map((c) => c.id));
      A = new Set(assessments.filter((a) => a.cloId && L.has(a.cloId)).map((a) => a.id));
      G = new Set([pick.id]);
    } else if (pick?.kind === "L") {
      const c = clos.find((x) => x.id === pick.id);
      L = new Set([pick.id]);
      A = new Set(assessments.filter((a) => a.cloId === pick.id).map((a) => a.id));
      G = new Set(c?.ploNumber != null ? [String(c.ploNumber)] : []);
    } else if (pick?.kind === "A") {
      const a = assessments.find((x) => x.id === pick.id);
      const c = clos.find((x) => x.id === a?.cloId);
      A = new Set([pick.id]);
      L = new Set(c ? [c.id] : []);
      G = new Set(c?.ploNumber != null ? [String(c.ploNumber)] : []);
    }
    return { L, A, G };
  }, [pick, clos, assessments, allGas]);

  // Focused on a CLO / GA: its assessments in order of their contribution (largest first).
  const shownA = assessments.filter((a) => vis.A.has(a.id));
  const shownL = clos.filter((c) => vis.L.has(c.id));
  const shownG = allGas.filter((g) => vis.G.has(String(g.number)));
  const unassessedA = assessments.filter((a) => !a.cloId);

  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    const draw = () => {
      const r = el.getBoundingClientRect();
      const pos = (id: string, side: "l" | "r") => {
        const n = el.querySelector(`[data-node="${id}"]`) as HTMLElement | null; if (!n) return null;
        const b = n.getBoundingClientRect();
        return { x: (side === "r" ? b.right : b.left) - r.left, y: b.top + b.height / 2 - r.top };
      };
      const curve = (p: { x: number; y: number }, q: { x: number; y: number }) => { const mx = (p.x + q.x) / 2; return `M${p.x},${p.y} C${mx},${p.y} ${mx},${q.y} ${q.x},${q.y}`; };
      const out: { k: string; d: string; on: boolean; color: string; label: string; mx: number; my: number }[] = [];
      const shownA = assessments.filter((a) => vis.A.has(a.id)), shownL = clos.filter((c) => vis.L.has(c.id)), shownG = allGas.filter((g) => vis.G.has(String(g.number)));
      for (const a of shownA) { if (!a.cloId || !vis.L.has(a.cloId)) continue; const p = pos(`A:${a.id}`, "r"), q = pos(`L:${a.cloId}`, "l"); if (p && q) out.push({ k: `a${a.id}`, d: curve(p, q), on: !!pick, color: tc(a.type), label: `${a.share}%`, mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 }); }
      for (const c of shownL) { if (c.ploNumber === null) continue; const p = pos(`L:${c.id}`, "r"), q = pos(`G:${c.ploNumber}`, "l"); if (p && q) out.push({ k: `l${c.id}`, d: curve(p, q), on: !!pick, color: "#6B3F8A", label: c.contribution != null ? `${c.contribution}%` : "", mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 }); }
      setLines(out); setSize({ w: el.scrollWidth, h: el.scrollHeight });
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(el);
    return () => ro.disconnect();
  }, [vis, pick, clos, assessments, allGas]);

  const toggle = (p: NonNullable<Pick>) => setPick((x) => (x && x.kind === p.kind && x.id === p.id ? null : p));
  const isPicked = (k: string, id: string) => pick?.kind === k && pick.id === id;
  const cloOf = new Map(clos.map((c) => [c.id, c]));
  const gaTitle = (n: number | null) => (n === null ? "" : allGas.find((g) => g.number === n)?.title || "");

  return (
    <div>
      <style>{`
        .cgf-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
        .cgf-chip{border:1px solid #E1E5EA;background:#fff;border-radius:999px;padding:4px 10px;font:600 12px inherit;cursor:pointer;color:#5A3A00}
        .cgf-chip[aria-pressed="true"]{background:#8A5A0F;color:#fff;border-color:#8A5A0F}
        .cgf{position:relative;overflow-x:auto}
        .cgf-grid.focus{grid-template-columns:minmax(320px,2fr) minmax(220px,1fr) minmax(180px,.8fr)}.cgf-grid{display:grid;grid-template-columns:minmax(220px,1.2fr) minmax(240px,1.3fr) minmax(200px,1fr);gap:64px;position:relative;z-index:1;min-width:880px}
        .cgf-col h4{margin:0 0 2px;font-size:13px}
        .cgf-col .cgf-sub{font-size:11px;color:var(--slate);margin-bottom:8px}
        .cgf-node{display:block;width:100%;text-align:left;background:#fff;border:1px solid #DDE2E8;border-radius:9px;padding:7px 9px;margin-bottom:7px;cursor:pointer;font:inherit;color:inherit}
        .cgf-node:hover{border-color:#9CB3CC}
        .cgf-node:focus-visible{outline:2px solid #1565C0}
        .cgf-node[aria-pressed="true"]{box-shadow:0 0 0 2px #1565C0}
        .cgf-node.gap{border-color:#E0B060;background:#FFF8EC}
        .cgf-muted{font-size:10.5px;color:var(--slate)}
        .cgf-att{font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px;white-space:nowrap}
        .cgf-row{display:flex;justify-content:space-between;gap:6px;align-items:baseline}
        .cgf-tag{font-size:10.5px;font-weight:700;border-radius:6px;padding:1px 6px;background:#FBF3E4;color:#8A5A0F;white-space:nowrap}
        .cgf-svg{position:absolute;left:0;top:0;pointer-events:none;z-index:2}
        @media (prefers-reduced-motion: no-preference){.cgf-node{transition:border-color .1s, box-shadow .1s}}
      `}</style>

      {msg && <p className="small-note" style={{ marginTop: 0, color: /now/.test(msg) ? "#1E6B34" : "#B3261E" }}>{msg}</p>}
      {edit && <p className="small-note" style={{ marginTop: 0 }}>Click an assessment&apos;s <b>% of its CLO</b> to change it; the other assessments of that CLO share the rest.</p>}
      <div className="small-note" style={{ marginTop: 0 }}><b>{course.code} {course.title}</b> · {course.creditHours} CH · {clos.length} CLOs · {allGas.length} GAs</div>
      <div className="cgf-bar" role="group" aria-label="Show one GA">
        <b style={{ fontSize: 12.5 }}>Show one GA:</b>
        {allGas.map((g) => <button key={g.number} type="button" className="cgf-chip" aria-pressed={isPicked("G", String(g.number))} onClick={() => toggle({ kind: "G", id: String(g.number) })} title={g.title}>GA{g.number}</button>)}
        {pick && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPick(null)}>Show all</button>}
        <span className="small-note" style={{ margin: 0 }}>Or click any box to see only what links to it.</span>
      </div>

      <div className="cgf" ref={wrap}>
        <svg className="cgf-svg" width={size.w} height={size.h} aria-hidden="true">
          {lines.map((l) => <path key={l.k} d={l.d} fill="none" stroke={l.color} strokeOpacity={l.on ? 0.85 : 0.35} strokeWidth={l.on ? 2.2 : 1.4} />)}
          {lines.length <= 80 && lines.filter((l) => l.label).map((l) => <g key={`t${l.k}`} transform={`translate(${l.mx},${l.my})`}><rect x={-17} y={-8} width={34} height={16} rx={5} fill="#fff" stroke="#D8CCCF" /><text x={0} y={4} textAnchor="middle" fontSize={10} fontWeight={700} fill={l.color}>{l.label}</text></g>)}
        </svg>
        <div className={`cgf-grid${pick?.kind === "L" ? " focus" : ""}`}>
          <div className="cgf-col">
            <h4 style={{ color: "#3E5C8A" }}>Assessments <span className="cgf-muted">({shownA.length})</span></h4>
            <div className="cgf-sub">which CLO each one assesses</div>
            {shownA.map((a) => { const c = a.cloId ? cloOf.get(a.cloId) : null; return (
              <div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "INPUT") toggle({ kind: "A", id: a.id }); }} key={a.id} data-node={`A:${a.id}`} className={`cgf-node${a.cloId ? "" : " gap"}`} aria-pressed={isPicked("A", a.id)} onClick={() => toggle({ kind: "A", id: a.id })} style={{ borderLeft: `4px solid ${tc(a.type)}` }}>
                <div className="cgf-row"><b style={{ fontSize: 12.5 }}>{assessName(a.type, a.label)}</b><span className="cgf-muted">{a.marksPct}% of course</span></div>
                <div className="cgf-row"><span style={{ fontSize: 11, color: a.cloId ? "#556" : AMBER }}>{c ? <>→ {c.code}{" · "}{edit && editing?.id === a.id ? <span onClick={(e) => e.stopPropagation()}><input type="number" min={1} max={99} step={0.5} value={editing.v} autoFocus onChange={(e) => setEditing({ id: a.id, v: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") saveShare(a, Number(editing.v)); if (e.key === "Escape") setEditing(null); }} style={{ width: 56, fontSize: 11 }} aria-label={`Share of ${c.code}`} />% <a role="button" onClick={() => saveShare(a, Number(editing.v))}>{saving ? "…" : "save"}</a></span> : <span role={edit ? "button" : undefined} title={edit ? "Click to change this assessment's share of the CLO" : undefined} onClick={(e) => { if (!edit) return; e.stopPropagation(); setEditing({ id: a.id, v: String(a.share) }); }} style={edit ? { textDecoration: "underline dotted", cursor: "pointer", fontWeight: 700 } : undefined}>{a.share}% of it</span>}</> : "not linked to a CLO"}</span><Att v={a.reached} target={target} /></div>
              </div>); })}
            {!shownA.length && <p className="small-note">{pick ? "No assessment for this selection." : "No assessments in the plan yet."}</p>}
          </div>

          <div className="cgf-col">
            <h4 style={{ color: "#6B3F8A" }}>CLOs <span className="cgf-muted">({shownL.length})</span></h4>
            <div className="cgf-sub">and the GA each maps to</div>
            {shownL.map((c) => { const n = assessments.filter((a) => a.cloId === c.id).length; const gap = !n || c.ploNumber === null; return (
              <button key={c.id} type="button" data-node={`L:${c.id}`} className={`cgf-node${gap ? " gap" : ""}`} aria-pressed={isPicked("L", c.id)} onClick={() => toggle({ kind: "L", id: c.id })} style={{ borderLeft: "4px solid #6B3F8A" }}>
                <div className="cgf-row"><b style={{ fontSize: 12.5 }}>{c.code}</b>{c.ploNumber !== null ? <span className="cgf-tag" title={gaTitle(c.ploNumber)}>→ GA{c.ploNumber}</span> : <span className="cgf-tag" style={{ background: "#FFF1D6", color: AMBER }}>no GA</span>}</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.35, margin: "2px 0" }}>{c.statement}</div>
                <div className="cgf-row"><span className="cgf-muted" style={{ color: n ? undefined : AMBER }}>{c.bloom ? `${c.bloom} · ` : ""}{n ? `${n} assessment${n > 1 ? "s" : ""} · ${c.weight}% of course` : "no assessment yet"}</span><Att v={c.attainment} target={target} /></div>
              </button>); })}
            {!shownL.length && <p className="small-note">{pick?.kind === "G" ? "No CLO maps to this GA." : "No CLOs yet."}</p>}
          </div>

          <div className="cgf-col">
            <h4 style={{ color: "#8A5A0F" }}>GAs <span className="cgf-muted">({shownG.length})</span></h4>
            <div className="cgf-sub">graduate attributes this course serves</div>
            {shownG.map((g) => { const nl = clos.filter((c) => c.ploNumber === g.number); const na = assessments.filter((a) => a.cloId && nl.some((c) => c.id === a.cloId)).length; return (
              <button key={g.number} type="button" data-node={`G:${g.number}`} className={`cgf-node${nl.length ? "" : " gap"}`} aria-pressed={isPicked("G", String(g.number))} onClick={() => toggle({ kind: "G", id: String(g.number) })} style={{ borderLeft: "4px solid #8A5A0F" }}>
                <div className="cgf-row"><b style={{ fontSize: 12.5 }}>GA{g.number}</b><Att v={g.attainment} target={target} /></div>
                {g.title && <div style={{ fontSize: 11.5, lineHeight: 1.35, margin: "2px 0" }}>{g.title}</div>}
                <div className="cgf-muted" style={{ color: nl.length ? undefined : AMBER }}>{nl.length ? `${nl.length} CLO${nl.length > 1 ? "s" : ""} · ${na} assessment${na === 1 ? "" : "s"}` : "linked to the course but no CLO maps to it"}{g.weight != null ? ` · course weight ${g.weight}%` : ""}</div>
              </button>); })}
            {!shownG.length && <p className="small-note">No GA for this selection.</p>}
          </div>

        </div>
      </div>
      {unassessedA.length > 0 && !pick && <p className="small-note" style={{ color: AMBER }}>{unassessedA.length} assessment(s) not linked to a CLO — link their lectures to a CLO in the lecture plan.</p>}
    </div>
  );
}
