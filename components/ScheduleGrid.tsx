/** A schedule as a grid: rows are days or dates, columns are times, each cell lists what happens there (course, venue). */
export type GridCell = { title: string; sub?: string; tone?: "class" | "duty" | "paper" | "pref" };
const BG: Record<string, string> = { class: "#E8F0FA", duty: "#FFF1DC", paper: "#E7F4EA", pref: "#F1ECFA" };

export default function ScheduleGrid({ rows, cols, cells, corner = "" }: { rows: { key: string; label: string }[]; cols: { key: string; label: string }[]; cells: Map<string, GridCell[]>; corner?: string }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", minWidth: Math.max(480, 140 + cols.length * 150) }}>
        <thead><tr><th style={{ border: "1px solid #CBD5E1", padding: 6, background: "#F4F6F9", textAlign: "left" }}>{corner}</th>{cols.map((c) => <th key={c.key} style={{ border: "1px solid #CBD5E1", padding: 6, background: "#F4F6F9", fontSize: 12.5 }}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.key}><th style={{ border: "1px solid #CBD5E1", padding: 6, background: "#F4F6F9", textAlign: "left", fontSize: 12.5, whiteSpace: "nowrap" }}>{r.label}</th>
            {cols.map((c) => { const xs = cells.get(`${r.key}|${c.key}`) || []; return (
              <td key={c.key} style={{ border: "1px solid #CBD5E1", padding: 4, verticalAlign: "top", minWidth: 140 }}>
                {xs.map((x, i) => <div key={i} style={{ background: BG[x.tone || "class"], borderRadius: 5, padding: "4px 6px", marginBottom: 3, fontSize: 12 }}><b>{x.title}</b>{x.sub && <div style={{ color: "#4B5563" }}>{x.sub}</div>}</div>)}
              </td>); })}</tr>))}</tbody>
      </table>
    </div>
  );
}
