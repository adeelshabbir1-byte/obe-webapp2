import { processStatus, NCEAC_FLOW } from "../lib/accreditation/processFlow";
import { ActionForm } from "./fyp/FypClient";

const C = { DONE: ["#23894f", "rgba(46,157,91,.14)", "Done"], CURRENT: ["#c98a0b", "rgba(224,165,38,.18)", "Now"], RETURNED: ["#c93c3c", "rgba(214,69,69,.14)", "Returned"], PENDING: ["#8a9099", "rgba(138,144,153,.10)", "Next"] } as const;

/** Figure 1 of the NCEAC Manual as a live tracker: where the program is, and when each step is expected. */
export default async function ProcessTracker({ cycleId, canEdit }: { cycleId: string; canEdit: boolean }) {
  const p = await processStatus(cycleId);
  if (!p) return null;
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <b>NCEAC accreditation process</b>
        <span className="small-note">{p.current ? <>Now: <b>{p.current}</b></> : "Decision received"}{p.finish ? ` · decision expected about ${p.finish}` : ""}{p.applyBy ? ` · apply by ${p.applyBy}` : ""}</span>
      </div>
      {p.missing && <p className="small-note" style={{ color: "#c93c3c" }}>Run prisma/migration_process_flow.sql in Supabase to save step dates.</p>}
      <div style={{ display: "flex", gap: 4, margin: "10px 0", flexWrap: "wrap" }}>
        {p.rows.map((r, i) => <div key={r.key} title={NCEAC_FLOW[i].title} style={{ flex: "1 1 60px", height: 8, borderRadius: 4, background: C[r.status][0] }} />)}
      </div>
      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
        {p.rows.map((r, i) => {
          const st = NCEAC_FLOW[i], [fg, bg, label] = C[r.status];
          return (
            <li key={r.key} style={{ background: bg, borderLeft: `3px solid ${fg}`, padding: "6px 10px", margin: "4px 0", listStylePosition: "inside" }}>
              <b>{st.title}</b> <span style={{ color: fg, fontWeight: 700, fontSize: 12 }}>· {label}</span>
              <div className="small-note">{st.who}{r.doneOn ? ` · done ${r.doneOn}` : r.expected ? ` · expected ${r.expected}` : ""}{r.auto ? ` · ${r.auto}` : ""}{r.note ? ` · ${r.note}` : ""}{st.note && r.status !== "DONE" ? ` — ${st.note}` : ""}</div>
              {canEdit && <ActionForm url="/api/accreditation/process" fixed={{ cycleId, key: r.key }} submit="Save" collapsed openLabel="Update" initial={{ status: r.status === "CURRENT" ? "PENDING" : r.status, doneOn: r.doneOn || "", expectedOn: r.expected || "", note: r.note || "" }}
                fields={[{ name: "status", label: "Status", type: "select", options: [["PENDING", "Not yet"], ["DONE", "Done"], ...(r.key === "desk" ? [["RETURNED", "Returned — information missing"] as [string, string]] : [])] }, { name: "doneOn", label: "Done on", type: "date" }, { name: "expectedOn", label: "Expected on", type: "date" }, { name: "note", label: "Note", width: 260 }]} />}
            </li>
          );
        })}
      </ol>
      <p className="small-note" style={{ margin: "6px 0 0" }}>Expected dates follow from the step before with typical gaps (desk audit ~1 month, visit ~6 weeks after, report and response ~2 weeks each, General Council ~2 months) — set the real dates as NCEAC confirms them.</p>
    </div>
  );
}
