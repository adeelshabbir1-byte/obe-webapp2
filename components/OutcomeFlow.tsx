"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Outcome Flow: Assessments -> CLOs -> Courses -> PLOs -> PEOs with the weight on every link and attainment
// (% of students reaching the target) on every box. Opens at Courses -> PLOs -> PEOs; clicking a course opens its CLOs,
// clicking a CLO its assessments. Each column opens step by step from the box clicked before it. The OMC edits Course->PLO and PLO->PEO weights
// by clicking a weight on those links; the lower levels come from the course plan and are only shown.

type PloCourse = { id: string; code: string; title: string; courseType: string; creditHours: number; semesterNumber: number | null; family: string; weight: number; attainment: number | null };
type Plo = { id: string; number: number; title: string; state: string; attainment: number | null; courses: PloCourse[]; equal: Record<string, number>; suggested: Record<string, number> };
type Course = { id: string; code: string; title: string; courseType: string; creditHours: number; semesterNumber: number | null; family: string };
type Peo = { index: number; text: string; links: { ploNumber: number; weight: number }[]; attainment: number | null; fromProfile?: boolean };
type Chain = {
  course: { id: string; code: string; title: string };
  source: string; enrolled: number;
  clos: { id: string; code: string; statement: string; bloom: string; ploNumber: number | null; contribution: number | null; target: number; weight: number; attainment: number | null; avg: number | null; perfAttainment?: number | null }[];
  assessments: { id: string; type: string; label: string; marksPct: number; cloId: string | null; avg: number | null; reached: number | null; graded: number; share: number; perfShare?: number | null }[];
};
type Cohort = { prevLabel: string | null; plos: Record<string, { last: number | null; suggested: Record<string, number> | null }> } | null;
export type FlowProps = { mode: "batch" | "course"; batchId: string | null; canEdit: boolean; target: number; courses: Course[]; plos: Plo[]; peos: Peo[]; initialChain?: Chain | null; cohort?: Cohort; peoNote?: string | null };

type Kind = "A" | "L" | "C" | "P" | "E"; // assessment, cLo, course, plo, pEo
const key = (k: Kind, id: string | number) => `${k}:${id}`;
const FAMILY: Record<string, string> = { COMPUTING: "Computing", GENERAL: "GE / IDS", CAPSTONE: "Capstone / FYP" };
const TIER: Record<Kind, { title: string; sub: string; color: string; bg: string }> = {
  A: { title: "Assessments", sub: "share of the CLO", color: "#3E5C8A", bg: "#EEF2F8" },
  L: { title: "CLOs", sub: "share of the course", color: "#6B3F8A", bg: "#F3EEF7" },
  C: { title: "Courses", sub: "weight on each GA", color: "#7E2435", bg: "#F8EEF0" },
  P: { title: "GAs", sub: "weight on each PEO", color: "#8A5A0F", bg: "#FBF3E4" },
  E: { title: "PEOs", sub: "program objectives", color: "#1F5E36", bg: "#EAF4EE" },
};

// Same colours as the CLO–PLO Flow report.
const TYPE_COLOR: Record<string, string> = { quiz: "#2F6FB0", assignment: "#2E7D5B", midterm: "#9A7B0A", final: "#A63D40", lab: "#0F7C8A", project: "#7A5C2E" };
const typeColor = (t: string) => TYPE_COLOR[t.toLowerCase()] || "#3E5C8A";

function Att({ v, target, avg }: { v: number | null; target: number; avg?: number | null }) {
  if (v === null) return <span style={{ fontSize: 10.5, color: "var(--slate)" }}>no results yet</span>;
  const ok = v >= target;
  return (
    <span title={`${v}% of students reached it (target ${target}%)${avg != null ? ` · class average ${avg}%` : ""}`} style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 10, background: ok ? "#E2F4E8" : "#FBEED2", color: ok ? "#1F5E36" : "#95650F", whiteSpace: "nowrap" }}>
      {v}%{avg != null && <span style={{ fontWeight: 400, opacity: 0.8 }}> · avg {avg}%</span>}
    </span>
  );
}

export default function OutcomeFlow(props: FlowProps) {
  const { mode, canEdit, target, courses, plos, peos } = props;
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [chains, setChains] = useState<Record<string, Chain>>(props.initialChain ? { [props.initialChain.course.id]: props.initialChain } : {});
  const [open, setOpen] = useState<string | null>(props.initialChain?.course.id || null);
  const [loading, setLoading] = useState<string | null>(null);
  const [edges, setEdges] = useState<{ id: string; x1: number; y1: number; x2: number; y2: number; label: string; on: boolean; color?: string; edit?: { kind: "plo"; ploId: string } | { kind: "peo"; index: number } }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [editing, setEditing] = useState<{ kind: "plo"; ploId: string } | { kind: "peo"; index: number } | null>(null);
  const [error, setError] = useState("");
  const [wide, setWide] = useState(false);

  const chain0 = open ? chains[open] : null;
  // Assessments grouped by CLO (CLO-1's first, then CLO-2's …), largest share first inside each, so lines don't cross.
  const chain = useMemo(() => {
    if (!chain0) return null;
    const ord = new Map(chain0.clos.map((c, i) => [c.id, i]));
    return { ...chain0, assessments: [...chain0.assessments].sort((a, b) => (ord.get(a.cloId || "") ?? 99) - (ord.get(b.cloId || "") ?? 99) || b.share - a.share) };
  }, [chain0]);
  const ploByNumber = useMemo(() => new Map(plos.map((p) => [p.number, p])), [plos]);

  // Step-by-step opening: batch view goes PEO -> PLOs -> courses -> CLOs -> assessments; a course view goes from the course
  // to its CLOs (left) and PLOs (right), then PLO -> PEOs. Clicking an open box closes it and everything opened after it.
  const [all, setAll] = useState(false);
  const [selE, setSelE] = useState<Set<number>>(new Set());
  const [selP, setSelP] = useState<Set<string>>(new Set());
  const [selL, setSelL] = useState<Set<string>>(new Set());
  const [courseOn, setCourseOn] = useState(false); // course view: the course box has been opened
  const flip = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  async function openCourse(id: string) {
    if (mode === "course") { setCourseOn(!courseOn); return; }
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (chains[id]) return;
    setLoading(id); setError("");
    const r = await fetch(`/api/outcome-flow/course/${id}`);
    const d = await r.json().catch(() => ({}));
    setLoading(null);
    if (!r.ok) { setError(d.error || "Could not open the course."); setOpen(null); return; }
    setChains((c) => ({ ...c, [id]: d }));
  }
  const toggle = (k: string) => {
    const [kind, id] = [k.slice(0, 1) as Kind, k.slice(2)];
    if (kind === "E") setSelE(flip(selE, Number(id)));
    if (kind === "P") setSelP(flip(selP, id));
    if (kind === "L") setSelL(flip(selL, id));
  };

  // What is visible at each level (everything when "Show all" is on).
  const vis = useMemo(() => {
    const peoPlos = (idx: Set<number>) => new Set(peos.filter((e) => idx.has(e.index)).flatMap((e) => e.links.map((l) => ploByNumber.get(l.ploNumber)?.id).filter((x): x is string => !!x)));
    let P: Set<string>, E: Set<number>, C: Set<string>;
    if (mode === "batch") {
      E = new Set(peos.map((e) => e.index));
      P = all ? new Set(plos.map((p) => p.id)) : peoPlos(selE);
      const openP = plos.filter((p) => P.has(p.id) && (all || selP.has(p.id)));
      C = all ? new Set(courses.map((c) => c.id)) : new Set(openP.flatMap((p) => p.courses.map((c) => c.id)));
    } else {
      C = new Set(courses.map((c) => c.id));
      P = all || courseOn ? new Set(plos.filter((p) => !chain || p.courses.some((c) => c.id === chain.course.id)).map((p) => p.id)) : new Set();
      E = all ? new Set(peos.map((e) => e.index)) : new Set(peos.filter((e) => e.links.some((l) => { const id = ploByNumber.get(l.ploNumber)?.id; return !!id && P.has(id) && selP.has(id); })).map((e) => e.index));
    }
    const courseOpen = mode === "batch" ? !!chain && C.has(chain.course.id) : all || courseOn;
    const L = new Set(courseOpen && chain ? chain.clos.map((l) => l.id) : []);
    const A = new Set(courseOpen && chain ? chain.assessments.filter((a) => a.cloId && (all || selL.has(a.cloId))).map((a) => a.id) : []);
    return { P, E, C, L, A, courseOpen };
  }, [mode, all, selE, selP, selL, courseOn, chain, plos, peos, courses, ploByNumber]);

  // Closing a box also closes what was opened from it.
  useEffect(() => {
    if (all) return;
    const keep = <T,>(set: Set<T>, ok: Set<T>) => (Array.from(set).every((x) => ok.has(x)) ? set : new Set(Array.from(set).filter((x) => ok.has(x))));
    setSelP((x) => keep(x, vis.P)); setSelL((x) => keep(x, vis.L));
    if (mode === "batch") setSelE((x) => keep(x, vis.E));
    if (mode === "batch" && open && !vis.C.has(open) && !loading) setOpen(null);
  }, [vis, all, mode, open, loading]);

  const related = useMemo(() => new Set<string>([
    ...Array.from(vis.E).map((x) => key("E", x)), ...Array.from(vis.P).map((x) => key("P", x)), ...Array.from(vis.C).map((x) => key("C", x)),
    ...Array.from(vis.L).map((x) => key("L", x)), ...Array.from(vis.A).map((x) => key("A", x)),
  ]), [vis]);
  const isOpen = (k: string) => { const [kind, id] = [k.slice(0, 1) as Kind, k.slice(2)]; return kind === "E" ? selE.has(Number(id)) : kind === "P" ? selP.has(id) : kind === "L" ? selL.has(id) : kind === "C" ? (mode === "batch" ? open === id : courseOn) : false; };

  // Lines between the boxes, measured from the page.
  useLayoutEffect(() => {
    const draw = () => {
      const el = box.current; if (!el) return;
      const r0 = el.getBoundingClientRect();
      const at = (k: string) => { const n = el.querySelector<HTMLElement>(`[data-k="${CSS.escape(k)}"]`); if (!n) return null; const r = n.getBoundingClientRect(); return { l: r.left - r0.left, r: r.right - r0.left, y: r.top - r0.top + r.height / 2 }; };
      const out: typeof edges = [];
      const add = (from: string, to: string, label: string, edit?: (typeof edges)[number]["edit"], color?: string) => {
        const a = at(from), b = at(to); if (!a || !b) return;
        out.push({ id: `${from}>${to}`, x1: a.r, y1: a.y, x2: b.l, y2: b.y, label, on: true, edit, color });
      };
      if (chain) {
        for (const a of chain.assessments) if (a.cloId) add(key("A", a.id), key("L", a.cloId), `${a.share}%`, undefined, typeColor(a.type));
        for (const l of chain.clos) add(key("L", l.id), key("C", chain.course.id), `${l.weight}%`);
      }
      for (const p of plos) for (const c of p.courses) add(key("C", c.id), key("P", p.id), `${c.weight}%`, { kind: "plo", ploId: p.id });
      for (const e of peos) for (const l of e.links) { const p = ploByNumber.get(l.ploNumber); if (p) add(key("P", p.id), key("E", e.index), `${l.weight}%`, { kind: "peo", index: e.index }); }
      setEdges(out); setSize({ w: el.scrollWidth, h: el.scrollHeight });
    };
    draw();
    const ro = new ResizeObserver(draw); if (box.current) ro.observe(box.current);
    window.addEventListener("resize", draw);
    return () => { ro.disconnect(); window.removeEventListener("resize", draw); };
  }, [chain, plos, peos, related, ploByNumber, open, loading]);

  const showBadges = edges.filter((e) => e.on).length <= 90;
  const node = (k: string, kind: Kind, onClick: () => void, children: React.ReactNode, active = isOpen(k)) => !related.has(k) ? null : (
    <div key={k} data-k={k} onClick={onClick} style={{ background: "#fff", border: `1px solid ${active ? TIER[kind].color : "var(--line)"}`, borderLeft: `4px solid ${TIER[kind].color}`, borderRadius: 8, padding: "7px 9px", cursor: "pointer", boxShadow: isOpen(k) ? `0 0 0 2px ${TIER[kind].color}` : "0 1px 2px rgba(0,0,0,.04)", fontSize: 12 }}>
      {children}
    </div>
  );
  const col = (kind: Kind, children: React.ReactNode, empty?: string) => (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, width: "100%" }}>
      <div style={{ textAlign: "center", borderBottom: `2px solid ${TIER[kind].color}`, paddingBottom: 4, marginBottom: 10 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: TIER[kind].color }}>{TIER[kind].title}</div>
        <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{TIER[kind].sub}</div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
        {children}
        {empty && <div style={{ fontSize: 11.5, color: "var(--slate)", textAlign: "center", padding: 10, border: "1px dashed var(--line)", borderRadius: 8 }}>{empty}</div>}
      </div>
    </div>
  );


  const shownCourses = mode === "course" && chain ? courses.filter((c) => c.id === chain.course.id) : courses;

  return (
    <div style={wide ? { position: "fixed", inset: 0, zIndex: 90, background: "var(--paper, #F7F4F3)", overflow: "auto", padding: "14px 20px" } : undefined}>
      {error && <div className="err">{error}</div>}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "var(--slate)", marginBottom: 8 }}>
        <span>Box figure: <b>% of students reaching the target</b> (green from {target}%) · avg = class average.</span>
        <span>Line figure: the weight of that link (assessment lines: its share of the CLO).</span>
        <span style={{ display: "inline-flex", gap: 8 }}>{Object.entries(TYPE_COLOR).map(([t, c]) => <span key={t} style={{ color: c, fontWeight: 700, textTransform: "capitalize" }}>■ {t}</span>)}</span>
        <span style={{ color: "#6B3F8A" }}>Purple “performance-weighted” figures: what attainment would be if better-done assessments counted more — for comparison only.</span>
        {mode === "batch" && <span>Figures refresh every 5 minutes.</span>}
        {canEdit && <span>Click a weight on a <b>Course → GA</b> or <b>GA → PEO</b> line to change it.</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => setAll(!all)}>{all ? "Step by step" : "Show all"}</button>
          <button className="btn btn-secondary" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => setWide(!wide)}>{wide ? "Exit full screen" : "Full screen"}</button>
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div ref={box} style={{ position: "relative", minWidth: 1450, display: "grid", gridTemplateColumns: "1fr 1.15fr 1.1fr 1.2fr 1.15fr", gap: 96, padding: "6px 4px 16px" }}>
          <svg width={size.w} height={size.h} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
            {edges.map((e) => {
              const dx = Math.max(20, (e.x2 - e.x1) * 0.5);
              const d = `M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2} ${e.y2}`;
              return <path key={e.id} d={d} fill="none" stroke={e.color || (e.on ? "#B9A3A8" : "#EEE7E8")} strokeOpacity={e.color ? 0.7 : 1} strokeWidth={1.6} />;
            })}
          </svg>
          <svg width={size.w} height={size.h} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
            {showBadges && edges.filter((e) => e.on).map((e) => {
              const mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2;
              const editable = canEdit && !!e.edit;
              return (
                <g key={e.id} transform={`translate(${mx},${my})`} style={{ pointerEvents: editable ? "auto" : "none", cursor: editable ? "pointer" : "default" }} onClick={() => editable && setEditing(e.edit!)}>
                  <rect x={-19} y={-9} width={38} height={18} rx={5} fill="#fff" stroke={editable ? "#7E2435" : "#D8CCCF"} strokeWidth={editable ? 1.4 : 1} />
                  <text x={0} y={4} textAnchor="middle" fontSize={10} fontWeight={700} fill={editable ? "#7E2435" : e.color || "#574C50"}>{e.label}</text>
                </g>
              );
            })}
          </svg>

          <div style={{ display: "contents" }}>
            <div style={{ zIndex: 1, position: "relative", display: "flex" }}>
              {col("A", chain ? chain.assessments.filter((a) => a.cloId).map((a) => node(key("A", a.id), "A", () => toggle(key("A", a.id)), (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}><b style={{ color: typeColor(a.type) }}>{a.label}</b><Att v={a.reached} target={target} avg={a.avg} /></div>
                  <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{a.marksPct}% of course · {a.share}% of {chain.clos.find((c) => c.id === a.cloId)?.code || "CLO"}{a.graded ? ` · ${a.graded} marked` : ""}</div>
                  {a.perfShare != null && Math.abs(a.perfShare - a.share) >= 0.5 && <div style={{ fontSize: 10.5, color: "#6B3F8A" }}>performance-weighted: {a.perfShare}% of the CLO</div>}
                </>
              ))) : null, !vis.courseOpen || !chain ? "Open a course, then click a CLO to see its assessments." : chain.assessments.filter((a) => a.cloId).length === 0 ? "No assessment is linked to a CLO yet." : vis.A.size === 0 ? "Click a CLO to see its assessments." : undefined)}
            </div>
            <div style={{ zIndex: 1, position: "relative", display: "flex" }}>
              {col("L", chain ? chain.clos.map((l) => node(key("L", l.id), "L", () => toggle(key("L", l.id)), (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}><b>{l.code} <span style={{ fontWeight: 400, color: "var(--slate)" }}>({l.bloom})</span></b><Att v={l.attainment} target={l.target || target} avg={l.avg} /></div>
                  <div style={{ fontSize: 11, lineHeight: 1.35, marginTop: 2 }}>{l.statement.length > 110 ? `${l.statement.slice(0, 110)}…` : l.statement}</div>
                  {l.perfAttainment != null && l.attainment != null && l.perfAttainment !== l.attainment && <div style={{ fontSize: 10.5, color: "#6B3F8A", marginTop: 2 }} title="If assessments the class did better on counted more (0.5×–1.5×). For comparison only — reports use the planned weights.">performance-weighted: {l.perfAttainment}%</div>}
                  <div style={{ fontSize: 10.5, color: "var(--slate)", marginTop: 2 }}>{l.ploNumber ? `→ GA-${l.ploNumber}${l.contribution != null ? ` (${l.contribution}% of it in this course)` : ""}` : "no GA mapped"}</div>
                </>
              ))) : null, loading ? "Opening the course…" : !chain || !vis.courseOpen ? "Click a course to see its CLOs." : chain.clos.length === 0 ? "This course has no CLOs yet." : undefined)}
            </div>
            <div style={{ zIndex: 1, position: "relative", display: "flex" }}>
              {col("C", shownCourses.map((c) => node(key("C", c.id), "C", () => openCourse(c.id), (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}><b>{c.code}</b><span style={{ fontSize: 10.5, color: "var(--slate)" }}>{FAMILY[c.family] || c.courseType}</span></div>
                  <div style={{ fontSize: 11.5 }}>{c.title}</div>
                  <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{c.creditHours} CH{c.semesterNumber ? ` · semester ${c.semesterNumber}` : ""}{isOpen(key("C", c.id)) ? " · open" : " · click to open"}</div>
                </>
              ), open === c.id)), shownCourses.length === 0 ? "No course is mapped to a GA yet (GA–Course Matrix)." : vis.C.size === 0 ? "Click a GA to see its courses." : undefined)}
            </div>
            <div style={{ zIndex: 1, position: "relative", display: "flex" }}>
              {col("P", plos.map((p) => node(key("P", p.id), "P", () => toggle(key("P", p.id)), (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}><b>GA-{p.number}</b><Att v={p.attainment} target={target} /></div>
                  <div style={{ fontSize: 11.5 }}>{p.title}</div>
                  <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{p.courses.length} course{p.courses.length === 1 ? "" : "s"} · {p.state === "DEFAULT" ? "suggested split (default)" : "weights set"}{props.cohort?.plos[p.id]?.last != null ? ` · last batch ${props.cohort.plos[p.id].last}%` : ""}</div>
                </>
              ))), plos.length === 0 ? "No GAs." : vis.P.size === 0 ? (mode === "batch" ? "Click a PEO to see its GAs." : "Click the course to see its CLOs and GAs.") : undefined)}
            </div>
            <div style={{ zIndex: 1, position: "relative", display: "flex" }}>
              {col("E", peos.map((e) => node(key("E", e.index), "E", () => toggle(key("E", e.index)), (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}><b>PEO-{e.index + 1}</b><Att v={e.attainment} target={target} /></div>
                  <div style={{ fontSize: 11, lineHeight: 1.35 }}>{e.text.length > 120 ? `${e.text.slice(0, 120)}…` : e.text}</div>
                  {e.links.length === 0 && <div style={{ fontSize: 10.5, color: "#95650F" }}>No GA linked yet{canEdit ? " — " : ""}{canEdit && <a onClick={(ev) => { ev.stopPropagation(); setEditing({ kind: "peo", index: e.index }); }} style={{ cursor: "pointer", textDecoration: "underline" }}>link GAs</a>}</div>}
                  {e.fromProfile && <div style={{ fontSize: 10.5, color: "var(--slate)" }}>GAs from the Program Profile, equal split</div>}
                  {e.links.length > 0 && canEdit && <div style={{ fontSize: 10.5 }}><a onClick={(ev) => { ev.stopPropagation(); setEditing({ kind: "peo", index: e.index }); }} style={{ cursor: "pointer", color: "var(--brass-dark)" }}>edit GA weights</a></div>}
                </>
              ))), peos.length === 0 ? (props.peoNote || "No PEOs yet — the Program Lead adds them in the Program Profile.") : vis.E.size === 0 ? "Click a GA to see its PEOs." : undefined)}
            </div>
          </div>
        </div>
      </div>
      {!showBadges && <p style={{ fontSize: 12, color: "var(--slate)" }}>Too many links to label at once — use “Step by step” to see the weights of one chain.</p>}

      {editing?.kind === "plo" && <PloEditor plo={plos.find((p) => p.id === editing.ploId)!} cohort={props.cohort?.plos[editing.ploId] || null} prevLabel={props.cohort?.prevLabel || null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
      {editing?.kind === "peo" && props.batchId && <PeoEditor peo={peos.find((e) => e.index === editing.index)!} plos={plos} batchId={props.batchId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(36,26,29,.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 720, width: "100%", maxHeight: "88vh", overflowY: "auto", margin: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3><button className="btn btn-secondary" style={{ padding: "2px 10px" }} onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

function useSave() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run(url: string, body: unknown, done: () => void) {
    setBusy(true); setErr("");
    const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(d.error || "Could not save."); return; }
    done();
  }
  return { busy, err, run };
}

function PloEditor({ plo, cohort, prevLabel, onClose, onSaved }: { plo: Plo; cohort: { last: number | null; suggested: Record<string, number> | null } | null; prevLabel: string | null; onClose: () => void; onSaved: () => void }) {
  const [w, setW] = useState<Record<string, string>>(Object.fromEntries(plo.courses.map((c) => [c.id, String(c.weight)])));
  const [source, setSource] = useState("MANUAL");
  const { busy, err, run } = useSave();
  const total = Math.round(plo.courses.reduce((s, c) => s + (Number(w[c.id]) || 0), 0) * 100) / 100;
  const set = (m: Record<string, number>, s: string) => { setW(Object.fromEntries(plo.courses.map((c) => [c.id, String(m[c.id] ?? 0)]))); setSource(s); };
  return (
    <Modal title={`GA-${plo.number}: ${plo.title} — course weights`} onClose={onClose}>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>{plo.number < 6 ? "Technical GA: computing courses weigh more in the suggestion." : "Soft-skill GA: General Education / IDS courses weigh more in the suggestion."} The weights must total 100%.</p>
      {cohort?.last != null && <p style={{ fontSize: 12.5, background: cohort.last < 60 ? "#FFF8EC" : "#EAF4EE", padding: "6px 10px", borderRadius: 6 }}>Last batch ({prevLabel}) reached this GA at <b>{cohort.last}%</b>.{cohort.suggested ? " The cohort suggestion leans on the courses where those students did best." : ""}</p>}
      <table style={{ fontSize: 12.5 }}>
        <thead><tr><th>Course</th><th>Type</th><th style={{ textAlign: "center" }}>CH</th><th style={{ textAlign: "center" }}>Equal</th><th style={{ textAlign: "center" }}>Suggested</th>{cohort?.suggested && <th style={{ textAlign: "center" }}>Cohort</th>}<th style={{ textAlign: "center" }}>Weight %</th></tr></thead>
        <tbody>{plo.courses.map((c) => (
          <tr key={c.id}>
            <td><b>{c.code}</b> {c.title}</td><td style={{ fontSize: 11.5 }}>{FAMILY[c.family]}</td><td style={{ textAlign: "center" }}>{c.creditHours}</td>
            <td style={{ textAlign: "center", color: "var(--slate)" }}>{plo.equal[c.id]}</td><td style={{ textAlign: "center", color: "var(--slate)" }}>{plo.suggested[c.id]}</td>
            {cohort?.suggested && <td style={{ textAlign: "center", color: "var(--slate)" }}>{cohort.suggested[c.id]}</td>}
            <td style={{ textAlign: "center" }}><input type="number" min={0} max={100} step={0.01} value={w[c.id]} onChange={(e) => { setW({ ...w, [c.id]: e.target.value }); setSource("MANUAL"); }} style={{ width: 80, textAlign: "right" }} /></td>
          </tr>
        ))}</tbody>
        <tfoot><tr><td colSpan={cohort?.suggested ? 6 : 5} style={{ textAlign: "right", fontWeight: 600 }}>Total</td><td style={{ textAlign: "center", fontWeight: 700, color: Math.abs(total - 100) <= 0.05 ? "#1F5E36" : "#B42318" }}>{total}%</td></tr></tfoot>
      </table>
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button className="btn btn-secondary" onClick={() => set(plo.equal, "EQUAL")}>Equal split</button>
        <button className="btn btn-secondary" onClick={() => set(plo.suggested, "SUGGESTED")}>Use suggestion</button>
        {cohort?.suggested && <button className="btn btn-secondary" onClick={() => set(cohort.suggested!, "SUGGESTED")}>Use cohort suggestion</button>}
        <button className="btn" style={{ marginLeft: "auto" }} disabled={busy || Math.abs(total - 100) > 0.05} onClick={() => run("/api/omc/plo-weights", { ploId: plo.id, source, weights: Object.fromEntries(plo.courses.map((c) => [c.id, Number(w[c.id]) || 0])) }, onSaved)}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}

function PeoEditor({ peo, plos, batchId, onClose, onSaved }: { peo: Peo; plos: Plo[]; batchId: string; onClose: () => void; onSaved: () => void }) {
  const init = Object.fromEntries(peo.links.map((l) => [l.ploNumber, String(l.weight)]));
  const [w, setW] = useState<Record<number, string>>(init);
  const { busy, err, run } = useSave();
  const on = plos.filter((p) => w[p.number] !== undefined);
  const total = Math.round(on.reduce((s, p) => s + (Number(w[p.number]) || 0), 0) * 100) / 100;
  const equal = () => { const n = on.length; if (!n) return; const each = Math.floor(10000 / n) / 100; setW(Object.fromEntries(on.map((p, i) => [p.number, String(i === 0 ? Math.round((100 - each * (n - 1)) * 100) / 100 : each)]))); };
  return (
    <Modal title={`PEO-${peo.index + 1} — which GAs serve it`} onClose={onClose}>
      <p style={{ fontSize: 12.5, marginTop: 0 }}>{peo.text}</p>
      <p style={{ fontSize: 12, color: "var(--slate)" }}>Tick the GAs that serve this objective and give each a weight (total 100%). This applies to every batch of the program.</p>
      <table style={{ fontSize: 12.5 }}>
        <thead><tr><th></th><th>GA</th><th style={{ textAlign: "center" }}>Weight %</th></tr></thead>
        <tbody>{plos.map((p) => (
          <tr key={p.id}>
            <td><input type="checkbox" checked={w[p.number] !== undefined} onChange={(e) => { const n = { ...w }; if (e.target.checked) n[p.number] = "0"; else delete n[p.number]; setW(n); }} /></td>
            <td><b>GA-{p.number}</b> {p.title}</td>
            <td style={{ textAlign: "center" }}>{w[p.number] !== undefined && <input type="number" min={0} max={100} step={0.01} value={w[p.number]} onChange={(e) => setW({ ...w, [p.number]: e.target.value })} style={{ width: 80, textAlign: "right" }} />}</td>
          </tr>
        ))}</tbody>
        <tfoot><tr><td colSpan={2} style={{ textAlign: "right", fontWeight: 600 }}>Total</td><td style={{ textAlign: "center", fontWeight: 700, color: !on.length || Math.abs(total - 100) <= 0.05 ? "#1F5E36" : "#B42318" }}>{on.length ? `${total}%` : "—"}</td></tr></tfoot>
      </table>
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button className="btn btn-secondary" disabled={!on.length} onClick={equal}>Equal split among ticked</button>
        <button className="btn" style={{ marginLeft: "auto" }} disabled={busy || (on.length > 0 && Math.abs(total - 100) > 0.05)} onClick={() => run("/api/omc/peo-weights", { batchId, peoIndex: peo.index, weights: Object.fromEntries(on.map((p) => [p.number, Number(w[p.number]) || 0])) }, onSaved)}>{busy ? "Saving…" : on.length ? "Save" : "Save (no GA)"}</button>
      </div>
    </Modal>
  );
}
