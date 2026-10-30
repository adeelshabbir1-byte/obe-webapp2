import { meter } from "../lib/goldenCopy";
import { ActionForm } from "./fyp/FypClient";

// The live compliance meter of an institute's copy of an HEC Golden Copy: green 100%, yellow 80–99.99% (local
// additions, justified at accreditation), red < 80% (core mandates missing — accreditation submission is blocked).
export default async function GoldenMeter({ curriculumId, canJustify }: { curriculumId: string; canJustify: boolean }) {
  const m = await meter(curriculumId).catch(() => null);
  if (!m) return null;
  const colour = m.band === "GREEN" ? "#2F7A4D" : m.band === "YELLOW" ? "#B76E00" : "#B3261E";
  return (
    <div className="card" data-testid="golden-meter" style={{ borderLeft: `5px solid ${colour}` }}>
      <b>HEC Golden Copy compliance: <span style={{ color: colour }}>{m.score}% {m.band === "GREEN" ? "green" : m.band === "YELLOW" ? "yellow" : "red"}</span></b>
      <span className="small-note"> — against {m.golden.authority} {m.golden.title} {m.golden.version}. Locked here: course codes, titles, credit hours, mandatory CLOs, CLO→PLO weights and core topics. Free: local books, lab manuals, sessional splits, elective choices.</span>
      <div style={{ height: 8, background: "#eee", borderRadius: 4, margin: "6px 0" }}><div style={{ width: `${Math.min(100, m.score)}%`, height: 8, background: colour, borderRadius: 4 }} /></div>
      {m.band === "RED" && <p style={{ margin: "2px 0", fontSize: 13, color: colour }}>Core HEC mandates are missing — submission for accreditation is blocked until they are restored.</p>}
      {m.missing.length > 0 && <p className="small-note" style={{ margin: "2px 0" }}>Missing: {m.missing.slice(0, 8).join(", ")}{m.missing.length > 8 ? ` and ${m.missing.length - 8} more` : ""}</p>}
      {m.changed.length > 0 && <p className="small-note" style={{ margin: "2px 0" }}>Changed: {m.changed.slice(0, 6).join(", ")}</p>}
      {m.lostClos.length > 0 && <p className="small-note" style={{ margin: "2px 0" }}>Mandatory CLOs not kept: {m.lostClos.slice(0, 6).join(", ")}</p>}
      {m.extras.length > 0 && <p className="small-note" style={{ margin: "2px 0" }}>Local additions: {m.extras.slice(0, 8).join(", ")}</p>}
      {m.band === "YELLOW" && (m.justification ? <p className="small-note" style={{ margin: "2px 0" }}>Justification: {m.justification}</p> : <p style={{ margin: "2px 0", fontSize: 13, color: colour }}>Give a justification for the local changes — accreditation submission waits for it.</p>)}
      {m.band === "YELLOW" && canJustify && <ActionForm url="/api/synthesis" fixed={{ action: "justify", curriculumId }} submit="Save justification" collapsed openLabel={m.justification ? "Edit the justification" : "Justify the local changes"} initial={{ text: m.justification || "" }} fields={[{ name: "text", label: "Why the local changes (shown at accreditation)", type: "textarea" }]} />}
    </div>
  );
}
