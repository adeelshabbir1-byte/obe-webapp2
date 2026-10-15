"use client";

import { useEffect, useMemo, useState } from "react";

type Node = { id: string; code: string; title: string; semester: number | null; depth: number };
type Data = {
  course: { id: string; code: string; title: string; semester: number | null };
  upstream: Node[]; downstream: Node[];
  links: { prereqCourseCode: string; prereqTopic: string; dependentCourseCode: string; dependentTopic: string }[];
  overlaps: { id: string; code: string; title: string; semester: number | null; pairs: { mine: string; theirs: string; score: number }[] }[];
};
type Placed = { code: string; title: string; x: number; y: number; kind: "self" | "up" | "down" | "overlap" };

const W = 960, NODE_W = 150, NODE_H = 46;

/**
 * One course in the middle; the courses it needs on the left, the courses that need it on the right (formal
 * prerequisites and topic links), and courses that teach overlapping topics below. Click a course for the topics.
 */
export default function TopicOverlapGraph({ courses }: { courses: { id: string; code: string; title: string; category: string }[] }) {
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    let alive = true;
    setLoading(true); setError(""); setPicked(null);
    fetch(`/api/faculty/topic-workspace/overlaps?courseId=${courseId}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!alive) return;
      if (!r.ok) { setError(d.error || "Could not load."); setData(null); } else setData(d);
      setLoading(false);
    }).catch((e) => { if (alive) { setError(String(e)); setLoading(false); } });
    return () => { alive = false; };
  }, [courseId]);

  const layout = useMemo(() => {
    if (!data) return null;
    const placed: Placed[] = [];
    const cx = W / 2;
    const upDepth = Math.max(1, ...data.upstream.map((n) => n.depth));
    const downDepth = Math.max(1, ...data.downstream.map((n) => n.depth));
    const colStep = Math.min(200, (W / 2 - NODE_W) / Math.max(upDepth, downDepth, 1));
    const chainRows = Math.max(1, ...[...Array(upDepth + 1).keys()].map((d) => data.upstream.filter((n) => n.depth === d).length), ...[...Array(downDepth + 1).keys()].map((d) => data.downstream.filter((n) => n.depth === d).length));
    const chainH = Math.max(140, chainRows * (NODE_H + 18) + 30);
    const cy = chainH / 2;
    placed.push({ code: data.course.code, title: data.course.title, x: cx, y: cy, kind: "self" });
    const place = (nodes: Node[], dir: -1 | 1, kind: "up" | "down") => {
      const depths = Array.from(new Set(nodes.map((n) => n.depth))).sort((a, b) => a - b);
      for (const d of depths) {
        const col = nodes.filter((n) => n.depth === d);
        col.forEach((n, i) => placed.push({ code: n.code, title: n.title, x: cx + dir * d * colStep, y: cy + (i - (col.length - 1) / 2) * (NODE_H + 18), kind }));
      }
    };
    place(data.upstream, -1, "up");
    place(data.downstream, 1, "down");
    const onChain = new Set(placed.map((p) => p.code));
    const extra = data.overlaps.filter((o) => !onChain.has(o.code)).slice(0, 10);
    const perRow = 5;
    extra.forEach((o, i) => {
      const row = Math.floor(i / perRow), inRow = Math.min(perRow, extra.length - row * perRow), k = i % perRow;
      placed.push({ code: o.code, title: o.title, x: cx + (k - (inRow - 1) / 2) * (NODE_W + 24), y: chainH + 50 + row * (NODE_H + 40), kind: "overlap" });
    });
    const height = extra.length ? chainH + 50 + Math.ceil(extra.length / perRow) * (NODE_H + 40) : chainH;
    return { placed, height };
  }, [data]);

  if (!courses.length) return <p className="small-note">You have no courses yet.</p>;
  const at = (code: string) => layout?.placed.find((p) => p.code === code);
  const overlapOf = (code: string) => data?.overlaps.find((o) => o.code === code);
  const linkCount = (a: string, b: string) => data?.links.filter((l) => (l.prereqCourseCode === a && l.dependentCourseCode === b) || (l.prereqCourseCode === b && l.dependentCourseCode === a)).length || 0;
  const pickedLinks = picked && data ? data.links.filter((l) => l.prereqCourseCode === picked || l.dependentCourseCode === picked) : [];
  const pickedOverlap = picked ? overlapOf(picked) : null;

  return (
    <div>
      <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        Course
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={{ minWidth: 300 }}>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}{c.category ? ` (${c.category})` : ""}</option>)}
        </select>
      </label>
      {error && <div className="err">{error}</div>}
      {loading && <p className="small-note">Working out overlaps…</p>}
      {data && layout && !loading && (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, marginBottom: 6 }}>
            <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--brass)" strokeWidth="2.5" /></svg> prerequisite chain</span>
            <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--sage)" strokeWidth="2" strokeDasharray="5 4" /></svg> overlapping topics</span>
            <span className="small-note">Numbers on the lines: topic links / overlapping topics. Click a course to see them.</span>
          </div>
          <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 8, background: "#FCFAF9" }}>
            <svg viewBox={`0 0 ${W} ${layout.height + 20}`} width="100%" style={{ minWidth: 720, display: "block" }} role="img" aria-label={`Prerequisite chain and topic overlaps of ${data.course.code}`}>
              {layout.placed.filter((p) => p.kind !== "self").map((p) => {
                const self = at(data.course.code)!;
                const ov = overlapOf(p.code)?.pairs.length || 0;
                const lk = linkCount(p.code, data.course.code);
                const chain = p.kind === "up" || p.kind === "down";
                // Chain edges join neighbouring depths; draw each node to the centre for clarity.
                const x1 = p.kind === "up" ? p.x + NODE_W / 2 : p.kind === "down" ? p.x - NODE_W / 2 : p.x;
                const y1 = p.kind === "overlap" ? p.y - NODE_H / 2 : p.y;
                const x2 = p.kind === "up" ? self.x - NODE_W / 2 : p.kind === "down" ? self.x + NODE_W / 2 : self.x;
                const y2 = p.kind === "overlap" ? self.y + NODE_H / 2 : self.y;
                const label = [lk ? `${lk} link${lk > 1 ? "s" : ""}` : "", ov ? `${ov} overlap${ov > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
                return (
                  <g key={`e-${p.code}`}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={chain ? "var(--brass)" : "var(--sage)"} strokeWidth={chain ? 2.5 : 2} strokeDasharray={chain ? undefined : "6 5"} strokeOpacity={0.8} />
                    {label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" fontSize="11" fill="var(--slate)" style={{ paintOrder: "stroke", stroke: "#FCFAF9", strokeWidth: 4 }}>{label}</text>}
                  </g>
                );
              })}
              {layout.placed.map((p) => (
                <g key={`n-${p.code}`} transform={`translate(${p.x - NODE_W / 2}, ${p.y - NODE_H / 2})`} style={{ cursor: p.kind === "self" ? "default" : "pointer" }} onClick={() => p.kind !== "self" && setPicked(picked === p.code ? null : p.code)}>
                  <rect width={NODE_W} height={NODE_H} rx={10} fill={p.kind === "self" ? "var(--navy-900)" : picked === p.code ? "#FBEED2" : "#fff"} stroke={p.kind === "self" ? "var(--navy-900)" : p.kind === "overlap" ? "var(--sage)" : "var(--brass)"} strokeWidth={picked === p.code ? 2.5 : 1.5} />
                  <text x={NODE_W / 2} y={19} textAnchor="middle" fontSize="13" fontWeight="700" fill={p.kind === "self" ? "#fff" : "var(--ink)"}>{p.code}</text>
                  <text x={NODE_W / 2} y={35} textAnchor="middle" fontSize="10.5" fill={p.kind === "self" ? "#F3E6E8" : "var(--slate)"}>{p.title.length > 24 ? p.title.slice(0, 23) + "…" : p.title}</text>
                  <title>{p.code} — {p.title}</title>
                </g>
              ))}
              {!data.upstream.length && !data.downstream.length && !data.overlaps.length && (
                <text x={W / 2} y={layout.height - 10} textAnchor="middle" fontSize="12" fill="var(--slate)">No prerequisites, dependent courses or overlapping topics found in this program yet.</text>
              )}
            </svg>
          </div>
          {picked && (
            <div className="card" style={{ marginTop: 12 }}>
              <h4 style={{ marginTop: 0 }}>{data.course.code} and {picked}</h4>
              {pickedLinks.length > 0 && (
                <>
                  <b style={{ fontSize: 13 }}>Prerequisite topic links</b>
                  <ul style={{ fontSize: 12.5, paddingLeft: 18 }}>{pickedLinks.map((l, i) => <li key={i}>{l.prereqCourseCode}: {l.prereqTopic} → {l.dependentCourseCode}: {l.dependentTopic}</li>)}</ul>
                </>
              )}
              {pickedOverlap && pickedOverlap.pairs.length > 0 && (
                <>
                  <b style={{ fontSize: 13 }}>Overlapping topics</b>
                  <table style={{ marginTop: 6 }}>
                    <thead><tr><th>{data.course.code}</th><th>{picked}</th><th style={{ width: 80 }}>Match</th></tr></thead>
                    <tbody>{pickedOverlap.pairs.map((p, i) => <tr key={i}><td>{p.mine}</td><td>{p.theirs}</td><td>{Math.round(p.score * 100)}%</td></tr>)}</tbody>
                  </table>
                </>
              )}
              {!pickedLinks.length && !pickedOverlap?.pairs.length && <p className="small-note">On the prerequisite chain, but no topic links or overlapping topics yet. Link topics on Prerequisite Topics.</p>}
            </div>
          )}
          {data.overlaps.length > 0 && !picked && (
            <p className="small-note" style={{ marginTop: 8 }}>
              Most overlap: {data.overlaps.slice(0, 5).map((o) => `${o.code} (${o.pairs.length})`).join(", ")}. Overlap is not always wrong — but the same topic taught twice should be planned on purpose.
            </p>
          )}
        </>
      )}
    </div>
  );
}
