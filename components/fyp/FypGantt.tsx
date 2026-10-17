// A small Gantt: task bars (coloured by status) and milestones (diamonds), with month bands and today's line.
type Item = { label: string; sub?: string; from: string; to: string; kind: "task" | "milestone"; status?: string; critical?: boolean };
const DAY = 86400000, LW = 300, ROW = 24, HEAD = 30, PX = 4;
const COL: Record<string, string> = { TODO: "#9AA3AD", IN_PROGRESS: "#1B6CA8", DONE: "#2E7D4F", LATE: "#B3261E" };

export default function FypGantt({ items, holidays = [] }: { items: Item[]; holidays?: string[] }) {
  if (!items.length) return <p className="small-note">Nothing planned yet.</p>;
  const now = Date.now();
  const ts = items.flatMap((i) => [Date.parse(i.from), Date.parse(i.to)]).concat(now);
  const t0 = new Date(Math.min(...ts) - 7 * DAY); t0.setUTCDate(1);
  const t1 = Math.max(...ts) + 14 * DAY;
  const x = (t: number) => LW + ((t - t0.getTime()) / DAY) * PX;
  const W = x(t1) + 10, H = HEAD + items.length * ROW + 8;
  const months: number[] = [];
  for (const m = new Date(t0); m.getTime() <= t1; m.setUTCMonth(m.getUTCMonth() + 1)) months.push(m.getTime());
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 6, background: "#fff" }}>
      <svg width={W} height={H} style={{ display: "block" }}>
        {months.map((m, i) => <g key={m}><rect x={x(m)} y={0} width={Math.max(0, (months[i + 1] ? x(months[i + 1]) : W) - x(m))} height={H} fill={i % 2 ? "#F6F7F8" : "#fff"} /><text x={x(m) + 4} y={16} fontSize={11} fill="#555">{new Date(m).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })}</text></g>)}
        {holidays.map((h) => { const t = Date.parse(h); return t >= t0.getTime() && t <= t1 ? <rect key={h} x={x(t)} y={20} width={PX} height={H - 20} fill="#F4C7C3" opacity={0.6}><title>{h}</title></rect> : null; })}
        <line x1={x(now)} x2={x(now)} y1={20} y2={H} stroke="#B3261E" strokeDasharray="4 3" />
        {items.map((it, i) => {
          const y = HEAD + i * ROW, a = Date.parse(it.from), b = Date.parse(it.to);
          const late = it.kind === "task" && it.status !== "DONE" && b < now;
          return (
            <g key={i}>
              <text x={6} y={y + 15} fontSize={11.5} fill="#222">{(it.label.length > 40 ? it.label.slice(0, 39) + "…" : it.label)}{it.sub ? <tspan fill="#888"> · {it.sub.slice(0, 18)}</tspan> : null}</text>
              {it.kind === "milestone"
                ? <polygon points={`${x(b)},${y + 4} ${x(b) + 7},${y + 12} ${x(b)},${y + 20} ${x(b) - 7},${y + 12}`} fill="#7E2435" />
                : <rect x={x(a)} y={y + 5} width={Math.max(4, x(b + DAY) - x(a))} height={14} rx={3} fill={late ? COL.LATE : COL[it.status || "TODO"]} stroke={it.critical ? "#3A1218" : "none"} strokeWidth={it.critical ? 2 : 0} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
