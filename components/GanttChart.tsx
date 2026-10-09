import type { PlanLine, PlanState } from "../lib/deadlines";

const COLOUR: Record<PlanState, string> = { BEHIND: "#B3261E", AT_RISK: "#B7791F", ON_TRACK: "#1B6CA8", COMPLETE: "#2E7D4F" };
const DAY = 86400000;
const LABEL_W = 330, ROW = 26, HEAD = 44, PX = 5; // pixels per day

/** A Gantt chart of the semester plan: one bar per task, filled by progress, with today and the semester start marked. */
export default function GanttChart({ lines, start, now }: { lines: PlanLine[]; start: Date | null; now: Date }) {
  if (!lines.length) return null;
  const items = lines.map((l) => ({ l, from: new Date(l.dueDate.getTime() - l.days * DAY), to: l.dueDate }));
  items.sort((a, b) => a.l.dueDate.getTime() - b.l.dueDate.getTime());
  const min0 = Math.min(...items.map((i) => i.from.getTime()), now.getTime(), start ? start.getTime() : Infinity);
  const max0 = Math.max(...items.map((i) => i.to.getTime()), now.getTime());
  const t0 = new Date(min0 - 5 * DAY); t0.setUTCDate(1); // start of that month
  const t1 = new Date(max0 + 10 * DAY);
  const x = (d: number) => LABEL_W + ((d - t0.getTime()) / DAY) * PX;
  const W = x(t1.getTime()) + 20;
  const H = HEAD + items.length * ROW + 10;
  const months: { at: number; text: string }[] = [];
  for (const m = new Date(t0); m.getTime() <= t1.getTime(); m.setUTCMonth(m.getUTCMonth() + 1)) months.push({ at: m.getTime(), text: m.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }) });
  const phases = Array.from(new Set(items.map((i) => i.l.phase)));
  const cut = (t: string) => (t.length > 46 ? t.slice(0, 45) + "…" : t);
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 6, background: "#fff" }}>
      <svg width={W} height={H} style={{ display: "block", fontFamily: "inherit" }} role="img" aria-label="Semester plan Gantt chart">
        {months.map((m, i) => (
          <g key={i}>
            <rect x={x(m.at)} y={0} width={Math.max(0, (i + 1 < months.length ? x(months[i + 1].at) : x(t1.getTime())) - x(m.at))} height={H} fill={i % 2 ? "#f6f7f8" : "#ffffff"} />
            <text x={x(m.at) + 4} y={16} fontSize={11} fill="#555">{m.text}</text>
          </g>
        ))}
        <rect x={0} y={0} width={LABEL_W} height={H} fill="#fff" />
        <line x1={LABEL_W} y1={0} x2={LABEL_W} y2={H} stroke="#ccc" />
        <text x={8} y={16} fontSize={11} fontWeight={700} fill="#333">Task</text>
        <text x={8} y={34} fontSize={10} fill="#777">bar = work window · fill = courses/people done · ◆ = final date</text>
        <line x1={0} y1={HEAD} x2={W} y2={HEAD} stroke="#ccc" />
        {items.map(({ l, from, to }, i) => {
          const y = HEAD + i * ROW;
          const pct = l.total ? l.done / l.total : 0;
          const x1 = x(from.getTime()), x2 = x(to.getTime() + DAY);
          const c = COLOUR[l.state];
          const first = i === 0 || items[i - 1].l.phase !== l.phase;
          return (
            <g key={l.id}>
              <line x1={0} y1={y + ROW} x2={W} y2={y + ROW} stroke="#eee" />
              <text x={8} y={y + 17} fontSize={11} fill={l.state === "BEHIND" ? "#B3261E" : "#222"} fontWeight={l.state === "BEHIND" ? 700 : 400}>{cut(l.title.replace(/ \(.*\)$/, ""))}</text>
              {first && <text x={LABEL_W - 6} y={y + 9} fontSize={8} fill="#999" textAnchor="end">{l.phase.toUpperCase()}</text>}
              <rect x={x1} y={y + 6} width={Math.max(6, x2 - x1)} height={14} rx={3} fill={c} opacity={0.22} stroke={c} />
              <rect x={x1} y={y + 6} width={Math.max(0, Math.max(6, x2 - x1) * pct)} height={14} rx={3} fill={c} />
              <text x={x2 + 6} y={y + 17} fontSize={10} fill="#555">{l.total ? `${l.done}/${l.total}` : "—"} · {to.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</text>
              <path d={`M${x2} ${y + 6} l6 7 l-6 7 l-6 -7 z`} fill={c} stroke="#fff" />
              {l.passed.map((p, k) => {
                const px = x(p.dueDate.getTime() + DAY);
                return <path key={k} d={`M${px} ${y + 8} l4 5 l-4 5 l-4 -5 z`} fill="#fff" stroke="#333" strokeWidth={1.3}><title>{`${p.by}: ${p.dueDate.toISOString().slice(0, 10)} (${p.slack} days slack)`}</title></path>;
              })}
              <title>{`${l.title} — ${l.done} of ${l.total} done`}</title>
            </g>
          );
        })}
        {start && <g><line x1={x(start.getTime())} y1={HEAD} x2={x(start.getTime())} y2={H} stroke="#2E7D4F" strokeDasharray="4 3" /><text x={x(start.getTime()) + 3} y={HEAD + 10} fontSize={9} fill="#2E7D4F">semester starts</text></g>}
        <g><line x1={x(now.getTime())} y1={HEAD - 4} x2={x(now.getTime())} y2={H} stroke="#B3261E" strokeWidth={1.5} /><text x={x(now.getTime()) + 3} y={HEAD - 6} fontSize={10} fill="#B3261E" fontWeight={700}>today</text></g>
      </svg>
      <div style={{ fontSize: 11.5, padding: "6px 10px", color: "#555", display: "flex", gap: 14, flexWrap: "wrap" }}>
        {([ ["BEHIND", "Behind"], ["AT_RISK", "At risk"], ["ON_TRACK", "On track"], ["COMPLETE", "Complete"] ] as [PlanState, string][]).map(([s, t]) => <span key={s}><span style={{ display: "inline-block", width: 10, height: 10, background: COLOUR[s], borderRadius: 2, marginRight: 4 }} />{t}</span>)}
        <span>◇ white diamond = a date passed down by a Dean, Chairman or Program Lead</span>
        <span>{phases.length} groups of work</span>
      </div>
    </div>
  );
}
