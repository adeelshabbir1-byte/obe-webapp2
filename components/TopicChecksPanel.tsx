"use client";

import { useEffect, useMemo, useState } from "react";

// The Checks tab of the Topic Workspace: warnings for the courses open in the workspace (missing prerequisites, Bloom
// drops, council coverage, time budget by importance, Core not assessed, calendar, lab vs theory, question bank, GA
// reach, readings, compare with last semester), prerequisite loops, and the zoomable program map.

const API = "/api/faculty/topic-workspace";
type CourseCheck = {
  courseId: string; code: string; title: string; missingPrereqs: string[]; bloomDrops: string[]; council: { missing: string[]; fewer: { topic: string; council: number; plan: number }[] } | null;
  budget: { line: string; warn: string }; coreNotAssessed: string[]; calendar: string[]; labVsTheory: string[]; bank: string[]; ga: string[]; gaReach: { plo: number; lectures: number }[];
  noReading: string[]; textbook: string; lastSemester: { previous: string | null; added: string[]; removed: string[]; moved: { topic: string; now: number; then: number }[]; history: { id: string; at: string; by: string; label: string; undone: boolean }[] } | null;
};
type MapData = { courses: { id: string; code: string; title: string; semester: number | null; topics: { topic: string; importance: string | null; notTaught: boolean }[] }[]; links: { from: string; fromTopic: string; to: string; toTopic: string; level: string; kind: string; pending: boolean }[]; chains: string[][]; keyTopics: { code: string; topic: string; dependents: number }[] };

export default function TopicChecksPanel() {
  const [open, setOpen] = useState<{ courseId: string; plan?: string | null }[] | null>(null);
  const [data, setData] = useState<{ courses: CourseCheck[]; loops: string[]; hardest: { code: string; topic: string; avg: number; below: number; students: number; offerings: number }[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { fetch(`${API}/state`).then((r) => r.json()).then((d) => setOpen(d.open || [])).catch(() => setOpen([])); }, []);
  useEffect(() => {
    if (!open) return;
    fetch(`${API}/checks?open=${encodeURIComponent(JSON.stringify(open))}`).then(async (r) => { const d = await r.json(); if (r.ok) setData(d); else setErr(d.error || "Could not run the checks."); }).catch(() => setErr("Could not reach the server."));
  }, [open]);
  if (err) return <div className="err">{err}</div>;
  if (!open || !data) return <p className="small-note">Running the checks on the courses open in your workspace…</p>;
  return (
    <div>
      {!data.courses.length && <p className="small-note">Open courses in the Workspace tab first; the checks run on them.</p>}
      {data.loops.length > 0 && <div className="err"><b>Prerequisite loop:</b> {data.loops.join(" · ")} — a course can&apos;t (indirectly) be its own prerequisite. New links that would close a loop are refused.</div>}
      {data.courses.map((c) => <CourseChecks key={c.courseId} c={c} />)}
      {data.hardest.length > 0 && <div className="card"><h3 style={{ fontSize: 15, marginTop: 0 }}>Hardest topics in the program</h3>
        <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Topic</th><th>Average</th><th>Below pass</th><th>Students</th><th>Offerings</th></tr></thead>
          <tbody>{data.hardest.map((h, i) => <tr key={i}><td>{h.code}</td><td>{h.topic}</td><td>{h.avg}%</td><td>{h.below}%</td><td>{h.students}</td><td>{h.offerings}</td></tr>)}</tbody></table></div>}
      {data.courses[0] && <ProgramMap courseId={data.courses[0].courseId} />}
    </div>
  );
}

function List({ title, items, tone = "warn" }: { title: string; items: string[]; tone?: "warn" | "bad" | "ok" }) {
  if (!items.length) return null;
  return <div style={{ margin: "6px 0" }}><b style={{ fontSize: 13, color: tone === "bad" ? "#B3261E" : tone === "ok" ? "#1E6B34" : "#8A3D0D" }}>{title} ({items.length})</b><ul style={{ fontSize: 12.5, margin: "2px 0", paddingLeft: 18 }}>{items.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}</ul>{items.length > 8 && <details style={{ fontSize: 12.5 }}><summary>{items.length - 8} more</summary><ul style={{ margin: "2px 0", paddingLeft: 18 }}>{items.slice(8, 200).map((x, i) => <li key={i}>{x}</li>)}</ul></details>}</div>;
}

function CourseChecks({ c }: { c: CourseCheck }) {
  const total = c.missingPrereqs.length + c.bloomDrops.length + (c.council ? c.council.missing.length + c.council.fewer.length : 0) + (c.budget.warn ? 1 : 0) + c.coreNotAssessed.length + c.calendar.length + c.labVsTheory.length + c.bank.length + c.ga.length;
  const ls = c.lastSemester;
  return (
    <div className="card">
      <h3 style={{ fontSize: 15, marginTop: 0 }}>{c.code} — {c.title} <span className="small-note">{total ? `${total} warning(s)` : "no warnings"}</span></h3>
      <p style={{ fontSize: 12.5, margin: "2px 0" }}><b>Time budget:</b> {c.budget.line}{c.budget.warn && <span style={{ color: "#B3261E" }}> — {c.budget.warn}</span>}</p>
      <List title="Missing prerequisites (not taught in an earlier semester)" items={c.missingPrereqs} tone="bad" />
      <List title="Bloom level drops" items={c.bloomDrops} />
      {c.council && <List title="Council outline coverage" items={c.council.missing.map((t) => `Missing: ${t}`).concat(c.council.fewer.map((f) => `"${f.topic}": ${f.plan} lecture(s), council has ${f.council}`))} />}
      <List title="Core topics not assessed" items={c.coreNotAssessed} tone="bad" />
      <List title="Semester calendar" items={c.calendar} />
      <List title="Lab follows theory" items={c.labVsTheory} />
      <List title="Question bank" items={c.bank} />
      <List title="GA reach" items={c.ga} />
      {c.gaReach.length > 0 && <p className="small-note">Lectures reaching each GA: {c.gaReach.map((g) => `PLO ${g.plo}: ${g.lectures}`).join(" · ")}</p>}
      {c.noReading.length > 0 && <p className="small-note">{c.noReading.length} topic(s) have no reading yet{c.textbook ? ` (required books: ${c.textbook})` : ""}.</p>}
      {ls && <div style={{ marginTop: 6 }}>
        <b style={{ fontSize: 13 }}>Compared with {ls.previous || "the last semester"}</b>
        {ls.previous ? <p className="small-note">{ls.added.length} new · {ls.removed.length} dropped · {ls.moved.length} moved{ls.added.length ? ` · new: ${ls.added.slice(0, 6).join(", ")}` : ""}{ls.removed.length ? ` · dropped: ${ls.removed.slice(0, 6).join(", ")}` : ""}</p> : <p className="small-note">No earlier offering of this course.</p>}
        {ls.history.length > 0 && <p className="small-note">Saved versions: {ls.history.slice(0, 6).map((h) => `${new Date(h.at).toLocaleString()} by ${h.by}${h.undone ? " (undone)" : ""}`).join(" · ")}</p>}
      </div>}
    </div>
  );
}

function ProgramMap({ courseId }: { courseId: string }) {
  const [m, setM] = useState<MapData | null>(null);
  const [zoom, setZoom] = useState(1);
  const [f, setF] = useState({ prereq: true, overlap: true, pending: true, topics: true });
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => { fetch(`${API}/checks?map=${courseId}`).then((r) => r.json()).then(setM).catch(() => null); }, [courseId]);
  const layout = useMemo(() => {
    if (!m) return null;
    const sems = Array.from(new Set(m.courses.map((c) => c.semester ?? 0))).sort((a, b) => a - b);
    const W = 200, GAP = 60, LH = 13;
    const pos = new Map<string, { x: number; y: number; h: number }>();
    const topicY = new Map<string, number>();
    let H = 0;
    sems.forEach((s, i) => {
      let y = 30;
      for (const c of m.courses.filter((x) => (x.semester ?? 0) === s)) {
        const h = 22 + (f.topics ? c.topics.length * LH : 0) + 6;
        pos.set(c.code, { x: 10 + i * (W + GAP), y, h });
        c.topics.forEach((t, k) => topicY.set(`${c.code}|${t.topic}`, y + 22 + k * LH + 4));
        y += h + 12;
      }
      H = Math.max(H, y);
    });
    return { sems, W, GAP, LH, pos, topicY, width: 20 + sems.length * (W + GAP), height: H + 10 };
  }, [m, f.topics]);
  if (!m || !layout) return <div className="card"><p className="small-note">Loading the program map…</p></div>;
  const color: Record<string, string> = { STRONG: "#8E1B1B", MILD: "#C46A12", WEAK: "#8A8A8A", PROGRESSION: "#1565C0", DUPLICATION: "#6A3FA0" };
  const shown = m.links.filter((l) => (l.kind === "PREREQ" ? f.prereq : f.overlap) && (f.pending || !l.pending));
  const inChain = (code: string) => !focus || focus === code || shown.some((l) => (l.from === focus && l.to === code) || (l.to === focus && l.from === code));
  const openIn = async (id: string) => {
    const st = await fetch(`${API}/state`).then((r) => r.json()).catch(() => ({ open: [] }));
    const open = (st.open || []) as { courseId: string }[];
    if (!open.some((o) => o.courseId === id)) await fetch(`${API}/state`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ open: open.concat({ courseId: id }) }) });
    window.location.href = "/faculty/topic-workspace";
  };
  return (
    <div className="card">
      <h3 style={{ fontSize: 15, marginTop: 0 }}>Program map</h3>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12.5, alignItems: "center" }}>
        <label>Zoom <input type="range" min={0.4} max={1.6} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
        <label><input type="checkbox" checked={f.prereq} onChange={(e) => setF({ ...f, prereq: e.target.checked })} /> prerequisites</label>
        <label><input type="checkbox" checked={f.overlap} onChange={(e) => setF({ ...f, overlap: e.target.checked })} /> overlaps</label>
        <label><input type="checkbox" checked={f.pending} onChange={(e) => setF({ ...f, pending: e.target.checked })} /> waiting approval</label>
        <label><input type="checkbox" checked={f.topics} onChange={(e) => setF({ ...f, topics: e.target.checked })} /> topics</label>
        {focus && <button className="btn btn-secondary btn-sm" onClick={() => setFocus(null)}>Show all</button>}
      </div>
      {m.chains.length > 0 && <p className="small-note">Longest chains: {m.chains.map((c) => c.join(" → ")).join(" · ")}</p>}
      {m.keyTopics.length > 0 && <p className="small-note">Key topics (most needed): {m.keyTopics.map((k) => `${k.code} ${k.topic} (${k.dependents})`).join(" · ")}</p>}
      <div style={{ overflow: "auto", maxHeight: 620, border: "1px solid var(--line)", borderRadius: 8 }}>
        <svg width={layout.width * zoom} height={layout.height * zoom} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Program map: courses by semester and the links between their topics">
          {layout.sems.map((s, i) => <text key={s} x={10 + i * (layout.W + layout.GAP)} y={18} fontSize={12} fontWeight={700} fill="#574C50">Semester {s || "?"}</text>)}
          {shown.map((l, i) => {
            const a = layout.pos.get(l.from), b = layout.pos.get(l.to);
            if (!a || !b) return null;
            const y1 = (f.topics && layout.topicY.get(`${l.from}|${l.fromTopic}`)) || a.y + 11, y2 = (f.topics && layout.topicY.get(`${l.to}|${l.toTopic}`)) || b.y + 11;
            const x1 = a.x + layout.W, x2 = b.x; const mx = (x1 + x2) / 2;
            const dim = focus && !(l.from === focus || l.to === focus);
            return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} stroke={color[l.level] || "#999"} strokeWidth={1.4} fill="none" strokeDasharray={l.pending ? "5 4" : ""} opacity={dim ? 0.1 : 0.8}><title>{`${l.from} ${l.fromTopic} → ${l.to} ${l.toTopic} (${l.level.toLowerCase()}${l.pending ? ", waiting" : ""})`}</title></path>;
          })}
          {m.courses.map((c) => { const p = layout.pos.get(c.code)!; return (
            <g key={c.code} opacity={inChain(c.code) ? 1 : 0.25} style={{ cursor: "pointer" }} onClick={() => setFocus(focus === c.code ? null : c.code)}>
              <rect x={p.x} y={p.y} width={layout.W} height={p.h} rx={7} fill="#fff" stroke="#D8C4C8" />
              <text x={p.x + 6} y={p.y + 15} fontSize={11.5} fontWeight={700} fill="#3A1218">{c.code} <tspan fontWeight={400}>{c.title.slice(0, 22)}</tspan></text>
              {f.topics && c.topics.map((t, k) => <text key={k} x={p.x + 10} y={p.y + 22 + k * layout.LH + 8} fontSize={9.5} fill={t.notTaught ? "#999" : "#574C50"} textDecoration={t.notTaught ? "line-through" : undefined}>{t.importance === "CORE" ? "■ " : t.importance === "OPTIONAL" ? "□ " : "▪ "}{t.topic.slice(0, 34)}</text>)}
            </g>); })}
        </svg>
      </div>
      <p className="small-note">Click a course to see only its links; {m.courses.length} courses. <select defaultValue="" onChange={(e) => e.target.value && openIn(e.target.value)} aria-label="Open a course of the map in the workspace"><option value="">Open in the workspace…</option>{m.courses.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}</select></p>
    </div>
  );
}
