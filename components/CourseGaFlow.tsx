"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

// One course's outcome flow, left to right: Assessments → CLOs → GAs → Course.
// Each CLO shows the GA it maps to. Pick a GA (or a CLO / assessment) to see only what is linked to it.

type Clo = { id: string; code: string; statement: string; bloom: string; ploNumber: number | null; weight: number; attainment: number | null; avg: number | null };
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

export default function CourseGaFlow({ course, clos, assessments, gas, target }: { course: { code: string; title: string; creditHours: number }; clos: Clo[]; assessments: Asmt[]; gas: Ga[]; target: number }) {
  const [pick, setPick] = useState<Pick>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ k: string; d: string; on: boolean; color: string }[]>([]);
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
      const out: { k: string; d: string; on: boolean; color: string }[] = [];
      const shownA = assessments.filter((a) => vis.A.has(a.id)), shownL = clos.filter((c) => vis.L.has(c.id)), shownG = allGas.filter((g) => vis.G.has(String(g.number)));
      for (const a of shownA) { if (!a.cloId || !vis.L.has(a.cloId)) continue; const p = pos(`A:${a.id}`, "r"), q = pos(`L:${a.cloId}`, "l"); if (p && q) out.push({ k: `a${a.id}`, d: curve(p, q), on: !!pick, color: tc(a.type) }); }
      for (const c of shownL) { if (c.ploNumber === null) continue; const p = pos(`L:${c.id}`, "r"), q = pos(`G:${c.ploNumber}`, "l"); if (p && q) out.push({ k: `l${c.id}`, d: curve(p, q), on: !!pick, color: "#6B3F8A" }); }
      for (const g of shownG) { const p = pos(`G:${g.number}`, "r"), q = pos("C", "l"); if (p && q) out.push({ k: `g${g.number}`, d: curve(p, q), on: !!pick, color: "#8A5A0F" }); }
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
        .cgf-grid{display:grid;grid-template-columns:minmax(190px,1fr) minmax(230px,1.3fr) minmax(190px,1fr) minmax(160px,.8fr);gap:56px;position:relative;z-index:1;min-width:880px}
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
        .cgf-svg{position:absolute;left:0;top:0;pointer-events:none;z-index:0}
        @media (prefers-reduced-motion: no-preference){.cgf-node{transition:border-color .1s, box-shadow .1s}}
      `}</style>

      <div className="cgf-bar" role="group" aria-label="Show one GA">
        <b style={{ fontSize: 12.5 }}>Show one GA:</b>
        {allGas.map((g) => <button key={g.number} type="button" className="cgf-chip" aria-pressed={isPicked("G", String(g.number))} onClick={() => toggle({ kind: "G", id: String(g.number) })} title={g.title}>GA{g.number}</button>)}
        {pick && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPick(null)}>Show all</button>}
        <span className="small-note" style={{ margin: 0 }}>Or click any box to see only what links to it.</span>
      </div>

      <div className="cgf" ref={wrap}>
        <svg className="cgf-svg" width={size.w} height={size.h} aria-hidden="true">
          {lines.map((l) => <path key={l.k} d={l.d} fill="none" stroke={l.color} strokeOpacity={l.on ? 0.85 : 0.35} strokeWidth={l.on ? 2.2 : 1.4} />)}
        </svg>
        <div className="cgf-grid">
          <div className="cgf-col">
            <h4 style={{ color: "#3E5C8A" }}>Assessments <span className="cgf-muted">({shownA.length})</span></h4>
            <div className="cgf-sub">which CLO each one assesses</div>
            {shownA.map((a) => { const c = a.cloId ? cloOf.get(a.cloId) : null; return (
              <button key={a.id} type="button" data-node={`A:${a.id}`} className={`cgf-node${a.cloId ? "" : " gap"}`} aria-pressed={isPicked("A", a.id)} onClick={() => toggle({ kind: "A", id: a.id })} style={{ borderLeft: `4px solid ${tc(a.type)}` }}>
                <div className="cgf-row"><b style={{ fontSize: 12.5 }}>{a.label}</b><span className="cgf-muted">{a.marksPct}%</span></div>
                <div className="cgf-row"><span style={{ fontSize: 11, color: a.cloId ? "#556" : AMBER }}>{c ? `→ ${c.code}${a.share ? ` · ${a.share}% of it` : ""}` : "not linked to a CLO"}</span><Att v={a.reached} target={target} /></div>
              </button>); })}
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

          <div className="cgf-col">
            <h4 style={{ color: "#7E2435" }}>Course</h4>
            <div className="cgf-sub">&nbsp;</div>
            <div data-node="C" className="cgf-node" style={{ cursor: "default", borderLeft: "4px solid #7E2435" }}>
              <b style={{ fontSize: 12.5 }}>{course.code}</b>
              <div style={{ fontSize: 12, lineHeight: 1.35 }}>{course.title}</div>
              <div className="cgf-muted">{course.creditHours} CH · {clos.length} CLOs · {allGas.length} GAs</div>
            </div>
          </div>
        </div>
      </div>
      {unassessedA.length > 0 && !pick && <p className="small-note" style={{ color: AMBER }}>{unassessedA.length} assessment(s) not linked to a CLO — link their lectures to a CLO in the lecture plan.</p>}
    </div>
  );
}
