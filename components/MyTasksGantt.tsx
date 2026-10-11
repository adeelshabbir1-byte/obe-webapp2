import { STATUS_COLOUR, STATUS_TEXT, type DlStatus } from "../lib/deadlines";

// A Gantt chart of one person's own tasks. Each bar is the work window (due date minus the usual days the work takes).
// A task that is holding up someone else is outlined in red, and the tasks waiting on it are drawn under it in grey,
// with an arrow from the end of my bar to the start of theirs.

export type GanttTask = {
  id: string; label: string; sub: string; from: Date; to: Date; status: DlStatus;
  blocking?: "now" | "soon";
  waiting?: { label: string; who: string; from: Date; to: Date }[];
  waitingMore?: number;
};

const DAY = 86400000;
const LABEL_W = 300, ROW = 26, SUB = 20, HEAD = 40, PX = 6;
const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default function MyTasksGantt({ tasks, now }: { tasks: GanttTask[]; now: Date }) {
  if (!tasks.length) return null;
  const all = tasks.flatMap((t) => [t.from, t.to, ...(t.waiting || []).flatMap((w) => [w.from, w.to])]).map((d) => d.getTime());
  const t0 = new Date(Math.min(...all, now.getTime()) - 4 * DAY); t0.setUTCDate(1);
  const t1 = new Date(Math.max(...all, now.getTime()) + 12 * DAY);
  const x = (d: number) => LABEL_W + ((d - t0.getTime()) / DAY) * PX;
  const W = x(t1.getTime()) + 10;
  type Line = { kind: "task"; t: GanttTask; y: number } | { kind: "wait"; t: GanttTask; w: NonNullable<GanttTask["waiting"]>[number]; y: number } | { kind: "more"; t: GanttTask; y: number };
  const lines: Line[] = [];
  let y = HEAD;
  for (const t of tasks) {
    lines.push({ kind: "task", t, y }); y += ROW;
    for (const w of t.waiting || []) { lines.push({ kind: "wait", t, w, y }); y += SUB; }
    if (t.waitingMore) { lines.push({ kind: "more", t, y }); y += SUB; }
  }
  const H = y + 8;
  const months: { at: number; text: string }[] = [];
  for (const m = new Date(t0); m.getTime() <= t1.getTime(); m.setUTCMonth(m.getUTCMonth() + 1)) months.push({ at: m.getTime(), text: m.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) });
  const taskY = new Map(lines.filter((l) => l.kind === "task").map((l) => [l.t.id, l.y]));

  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }}>
      <svg width={W} height={H} style={{ display: "block", fontFamily: "inherit" }} role="img" aria-label="My tasks Gantt chart">
        <defs>
          <marker id="mtg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#B3261E" /></marker>
        </defs>
        {months.map((m, i) => (
          <g key={i}>
            <rect x={x(m.at)} y={0} width={Math.max(0, (i + 1 < months.length ? x(months[i + 1].at) : x(t1.getTime())) - x(m.at))} height={H} fill={i % 2 ? "#F7F5F4" : "#fff"} />
            <text x={x(m.at) + 4} y={16} fontSize={11} fill="#666">{m.text}</text>
          </g>
        ))}
        <rect x={0} y={0} width={LABEL_W} height={H} fill="#fff" />
        <line x1={LABEL_W} y1={0} x2={LABEL_W} y2={H} stroke="#ddd" />
        <text x={8} y={16} fontSize={11} fontWeight={700} fill="#333">My task</text>
        <text x={8} y={31} fontSize={9.5} fill="#888">grey rows = tasks waiting for mine</text>
        <line x1={0} y1={HEAD} x2={W} y2={HEAD} stroke="#ddd" />
        {lines.map((l, i) => {
          if (l.kind === "task") {
            const t = l.t, c = STATUS_COLOUR[t.status];
            const x1 = x(t.from.getTime()), x2 = x(t.to.getTime() + DAY);
            const done = t.status === "ON_TIME" || t.status === "LATE_DONE";
            const late = t.status === "OVERDUE" ? x(now.getTime()) : null;
            return (
              <g key={i}>
                <line x1={0} y1={l.y + ROW} x2={W} y2={l.y + ROW} stroke="#f0f0f0" />
                <text x={8} y={l.y + 12} fontSize={11} fontWeight={t.blocking ? 700 : 500} fill={t.blocking === "now" ? "#B3261E" : "#222"}>{t.blocking ? "⚠ " : ""}{cut(t.label, 44)}</text>
                <text x={8} y={l.y + 23} fontSize={9.5} fill="#888">{cut(t.sub, 52)}</text>
                <rect x={x1} y={l.y + 6} width={Math.max(6, x2 - x1)} height={14} rx={4} fill={c} opacity={done ? 0.9 : 0.25} stroke={t.blocking ? "#B3261E" : c} strokeWidth={t.blocking ? 2 : 1} />
                {late !== null && late > x2 && <rect x={x2} y={l.y + 9} width={late - x2} height={8} fill="#B3261E" opacity={0.35}><title>{`Overdue by ${Math.round((now.getTime() - t.to.getTime()) / DAY)} days`}</title></rect>}
                <text x={Math.max(x2, late ?? 0) + 6} y={l.y + 17} fontSize={10} fill="#555">{fmt(t.to)} · {STATUS_TEXT[t.status]}</text>
                <title>{`${t.label} — ${t.sub} — due ${fmt(t.to)} (${STATUS_TEXT[t.status]})`}</title>
              </g>
            );
          }
          if (l.kind === "more") return <text key={i} x={24} y={l.y + 13} fontSize={9.5} fill="#888">… and {l.t.waitingMore} more waiting</text>;
          const w = l.w, x1 = x(w.from.getTime()), x2 = x(w.to.getTime() + DAY);
          const from = x(l.t.to.getTime() + DAY), ty = taskY.get(l.t.id)! + 13;
          return (
            <g key={i}>
              <text x={24} y={l.y + 13} fontSize={10} fill="#777" fontStyle="italic">↳ {cut(`${w.label} — ${w.who}`, 46)}</text>
              <rect x={x1} y={l.y + 5} width={Math.max(6, x2 - x1)} height={10} rx={3} fill="#C9C3C5" />
              <path d={`M${from} ${ty} C ${from + 14} ${ty}, ${x1 - 14} ${l.y + 10}, ${x1} ${l.y + 10}`} fill="none" stroke={l.t.blocking === "now" ? "#B3261E" : "#B7791F"} strokeWidth={1.2} markerEnd="url(#mtg-arrow)" />
              <title>{`${w.label} (${w.who}) can start once your task is done — planned ${fmt(w.from)} to ${fmt(w.to)}`}</title>
            </g>
          );
        })}
        <line x1={x(now.getTime())} y1={HEAD - 4} x2={x(now.getTime())} y2={H} stroke="#B3261E" strokeWidth={1.5} />
        <text x={x(now.getTime()) + 3} y={HEAD - 6} fontSize={10} fill="#B3261E" fontWeight={700}>today</text>
      </svg>
      <div style={{ fontSize: 11.5, padding: "6px 10px", color: "#555", display: "flex", gap: 14, flexWrap: "wrap" }}>
        {(["OVERDUE", "SOON", "UPCOMING", "ON_TIME", "LATE_DONE"] as DlStatus[]).map((s) => <span key={s}><span style={{ display: "inline-block", width: 10, height: 10, background: STATUS_COLOUR[s], borderRadius: 3, marginRight: 4 }} />{STATUS_TEXT[s]}</span>)}
        <span>⚠ red outline = holding up someone</span>
      </div>
    </div>
  );
}
