import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs, staffOf, programsOf, day } from "../../lib/registers";
import { plagOf, plagSummary, overLimit, KINDS, DECISIONS, HEC_LIMIT, SINGLE_SOURCE_LIMIT, PLAG_HINT, canSeeAllPlag } from "../../lib/plagiarism";
import UploadForm from "../../components/UploadForm";
import { ActionForm } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const STAFF = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC", "DEPARTMENT_COORDINATOR", "INSTRUCTOR", "SUBJECT_EXPERT"];

// Plagiarism records: each FYP, thesis and research paper's similarity check with HEC's limits, decision and action.
export default async function PlagiarismPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w || !STAFF.includes(user.role)) redirect("/dashboard");
  const rows = await plagOf(w);
  const staff = await staffOf(w.chairmanId), programs = await programsOf(w.chairmanId);
  const sum = plagSummary(rows || []);
  const over = (rows || []).filter(overLimit).length;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Plagiarism Records</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>The similarity report of every final year project, thesis and research paper, with the decision and the action taken. {canSeeAllPlag(w) ? "" : "You see the records you made or supervise."}</p>
      <HowCalculated shows={`HEC's Plagiarism Policy: a similarity index below ${HEC_LIMIT}% overall, and no single source above ${SINGLE_SOURCE_LIMIT}%, excluding references and quotations.`}>
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
          <li>A record over either limit is shown in red and suggested as “Returned for revision”; the QEC In-charge and the supervisor are told.</li>
          <li>The limit is kept on each record, so a stricter departmental limit can be used.</li>
          <li>The summary (per year and kind) is what the councils&apos; forms ask for.</li>
        </ul>
      </HowCalculated>
      {rows === null && <div className="err">{PLAG_HINT}</div>}
      <div className="card"><h3 style={{ marginTop: 0 }}>Add a record</h3>
        <UploadForm url="/api/plagiarism" submit="Save record" collapsed openLabel="Add a similarity report" file={{ name: "report", label: "Report (PDF, up to 3 MB)", accept: ".pdf,.doc,.docx,.html" }} fields={[
          { name: "kind", label: "Kind", type: "select", options: Object.entries(KINDS) }, { name: "title", label: "Title", width: 260, required: true }, { name: "authors", label: "Author(s) / roll numbers", width: 220, required: true },
          { name: "program", label: "Program", type: "select", options: programs.map((p) => [p, p] as [string, string]) }, { name: "supervisorId", label: "Supervisor", type: "select", options: staff.map((s) => [s.id, s.name] as [string, string]) },
          { name: "tool", label: "Tool", placeholder: "Turnitin", width: 100 }, { name: "similarityPct", label: "Similarity %", type: "number", width: 90, required: true }, { name: "singleSourcePct", label: "Largest single source %", type: "number", width: 90 },
          { name: "thresholdPct", label: "Limit %", type: "number", width: 70, placeholder: String(HEC_LIMIT) }, { name: "checkedAt", label: "Checked on", type: "date" }, { name: "decision", label: "Decision (blank = suggested)", type: "select", options: Object.entries(DECISIONS) }, { name: "actionTaken", label: "Action taken", width: 240 },
        ]} />
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><h3 style={{ margin: 0 }}>Summary</h3><span className="small-note">{(rows || []).length} records · {over} over the limit</span><a className="btn btn-secondary btn-sm no-print" style={{ marginLeft: "auto" }} href="/api/plagiarism?summary=xlsx">⬇ Summary and records (Excel)</a></div>
        <table className="table" style={{ fontSize: 13, marginTop: 8 }}><thead><tr><th>Year</th><th>Kind</th><th>Checked</th><th>Average similarity</th><th>Over the limit</th><th>Revised</th><th>Rejected</th><th>Misconduct</th></tr></thead>
          <tbody>{sum.map((s) => <tr key={`${s.year}${s.kind}`}><td>{s.year}</td><td>{KINDS[s.kind]}</td><td>{s.checked}</td><td>{s.average}%</td><td style={{ color: s.over ? "#B3261E" : "#1E6B3A", fontWeight: 700 }}>{s.over}</td><td>{s.revised}</td><td>{s.rejected}</td><td>{s.misconduct}</td></tr>)}
            {!sum.length && <tr><td colSpan={8}>No records yet.</td></tr>}</tbody></table>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Checked</th><th>Work</th><th>Similarity</th><th>Decision</th><th>Action taken</th><th>Report</th><th></th></tr></thead>
          <tbody>{(rows || []).map((r) => { const bad = overLimit(r); return (
            <tr key={r.id}><td style={{ whiteSpace: "nowrap" }}>{day(r.checkedAt)}</td><td><b>{r.title}</b><div className="small-note" style={{ margin: 0 }}>{KINDS[r.kind]} · {r.authors}{r.program ? ` · ${r.program}` : ""}{r.supervisorId ? ` · supervisor ${staff.find((s) => s.id === r.supervisorId)?.name || ""}` : ""}</div></td>
              <td style={{ color: bad ? "#B3261E" : "#1E6B3A", fontWeight: 700 }}>{r.similarityPct}%{r.singleSourcePct !== null ? <div className="small-note" style={{ margin: 0 }}>one source {r.singleSourcePct}%</div> : null}<div className="small-note" style={{ margin: 0 }}>limit {r.thresholdPct}% · {r.tool}</div></td>
              <td style={{ fontWeight: 700, color: r.decision === "ACCEPTED" ? "#1E6B3A" : "#9A3412" }}>{DECISIONS[r.decision]}</td><td style={{ fontSize: 12.5 }}>{r.actionTaken || "—"}</td>
              <td>{r.reportFileName ? <a className="act" href={`/api/plagiarism?file=${r.id}`}>Download</a> : "—"}</td>
              <td>{(canSeeAllPlag(w) || r.createdById === w.id) && <ActionForm url="/api/plagiarism" fixed={{ action: "decide", id: r.id }} submit="Save" collapsed openLabel="Change" initial={{ decision: r.decision, actionTaken: r.actionTaken || "" }} fields={[{ name: "decision", label: "Decision", type: "select", options: Object.entries(DECISIONS) }, { name: "actionTaken", label: "Action taken", width: 220 }]} />}</td></tr>); })}</tbody>
        </table>
      </div>
    </Shell>
  );
}
