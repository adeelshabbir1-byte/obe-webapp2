import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { hemisData, hemisSummary, hemisLog, DATASETS, HEMIS_HINT, HEMIS_ROLES } from "../../lib/hemis";
import HowCalculated from "../../components/HowCalculated";
import { ActionForm } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";

const pill = (t: string, bg: string) => <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 999, background: bg, color: "#fff", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{t}</span>;

// HEC HEMIS: the six data sets HEC collects, checked row by row before download, with the codes they need and a log.
export default async function HemisPage({ searchParams }: { searchParams: { show?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!HEMIS_ROLES.includes(user.role)) redirect("/dashboard");
  const cid = await chairmanIdFor(user);
  if (!cid) redirect("/dashboard");
  const { out, codes, programNames } = await hemisData(cid);
  const log = await hemisLog(cid);
  const canCodes = ["CHAIRMAN", "DEAN"].includes(user.role);
  const show = DATASETS.find((d) => d.key === searchParams.show)?.key || null;
  const fix = (kind: string, id: string) => (kind === "student" ? `/accreditation/nceac-portal/fix?kind=student&id=${id}&back=/hemis` : kind === "staff" ? `/accreditation/nceac-portal/fix?kind=staff&id=${id}&back=/hemis` : "#codes");
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>HEMIS Data Export</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>The data HEC collects through HEMIS — students, faculty, programs, enrolment, results and graduates — filled from OBEHUB, checked before download, and logged.</p>
      <HowCalculated shows="Six data sets, one sheet each (or one CSV each). Every row is checked first.">
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
          <li><b>Will be rejected</b>: a compulsory column is empty (e.g. CNIC, date of birth, a program&apos;s HEMIS code), a CNIC is not 13 digits, a date is not a date, or a value is not one of the allowed choices.</li>
          <li>CNIC, date of birth, domicile and similar come from the students&apos; and teachers&apos; own details (the same ones NCEAC uses), so filling them once fills both.</li>
          <li>Results: GPA of each term = Σ(grade points × credit hours) ÷ Σ credit hours of that term; CGPA counts each course&apos;s best attempt up to that term. Below 2.00 is shown as Probation.</li>
          <li>Columns follow HEMIS&apos;s data sets. If your HEMIS template names a column differently, send the template file and the columns can be matched to it exactly.</li>
        </ul>
      </HowCalculated>
      {!codes.ready && <div className="err">{HEMIS_HINT}</div>}

      <div id="codes" className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>HEMIS codes</h3>
        <table className="table" style={{ fontSize: 13 }}>
          <thead><tr><th></th><th>HEMIS code</th><th>Level</th><th>Discipline</th><th>Years</th>{canCodes && <th />}</tr></thead>
          <tbody>
            <tr><td><b>The institute</b></td><td style={{ color: codes.inst ? undefined : "#B3261E", fontWeight: 700 }}>{codes.inst || "not set"}</td><td colSpan={3} /><td>{canCodes && <ActionForm url="/api/hemis" fixed={{ action: "code", program: "" }} submit="Save" collapsed openLabel={codes.inst ? "Change" : "Set"} initial={{ code: codes.inst }} fields={[{ name: "code", label: "Institute's HEMIS code", width: 140 }]} />}</td></tr>
            {programNames.map((p) => { const pc = codes.programs.get(p); return (
              <tr key={p}><td>{p}</td><td style={{ color: pc?.code ? undefined : "#B3261E", fontWeight: 700 }}>{pc?.code || "not set"}</td><td>{pc?.level || "—"}</td><td>{pc?.discipline || "—"}</td><td>{pc?.years || "—"}</td>
                <td>{canCodes && <ActionForm url="/api/hemis" fixed={{ action: "code", program: p }} submit="Save" collapsed openLabel={pc?.code ? "Change" : "Set"} initial={{ code: pc?.code || "", level: pc?.level || "BS (4 years)", discipline: pc?.discipline || "", years: pc?.years || 4 }} fields={[{ name: "code", label: "HEMIS program code", width: 120 }, { name: "level", label: "Level", width: 140 }, { name: "discipline", label: "Discipline", width: 160 }, { name: "years", label: "Duration (years)", type: "number", width: 70 }]} />}</td></tr>); })}
          </tbody>
        </table>
      </div>

      <div className="card no-print" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b>Download</b>
        <a className="btn btn-brass btn-sm" href="/api/hemis?dataset=all">⬇ All six data sets (Excel)</a>
        <a className="btn btn-secondary btn-sm" href="/api/hemis?dataset=all&only=ready">⬇ Only rows that pass</a>
        <a className="btn btn-secondary btn-sm" href="/api/hemis?dataset=all&only=ready&withCnic=1" title="CNICs are masked in every download. The HEMIS upload needs them in full: Institute Head, Dean, HOD, Program Lead or Department Coordinator only; logged.">⬇ For the HEMIS upload (full CNIC, logged)</a>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
        {DATASETS.map((d) => { const s = hemisSummary(out[d.key]); return (
          <div key={d.key} className="card" style={{ margin: 0, borderLeft: `5px solid ${s.rejected ? "#B3261E" : "#1E6B3A"}` }}>
            <h3 style={{ marginTop: 0 }}>{d.title}</h3>
            <div style={{ display: "flex", gap: 16 }}>
              <div><div style={{ fontSize: 22, fontWeight: 800 }}>{s.rows}</div><div className="small-note" style={{ margin: 0 }}>rows</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 800, color: s.rejected ? "#B3261E" : "#1E6B3A" }}>{s.rejected}</div><div className="small-note" style={{ margin: 0 }}>with problems</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 800, color: s.checks ? "#9A3412" : "#1E6B3A" }}>{s.checks}</div><div className="small-note" style={{ margin: 0 }}>to check</div></div>
            </div>
            <p className="small-note">{d.note}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} className="no-print">
              <a className="btn btn-secondary btn-sm" href={`/api/hemis?dataset=${d.key}`}>Excel</a>
              <a className="btn btn-secondary btn-sm" href={`/api/hemis?dataset=${d.key}&format=csv`}>CSV</a>
              {(s.rejected > 0 || s.checks > 0) && <a className="btn btn-secondary btn-sm" href={`?show=${d.key}#problems`}>See problems</a>}
            </div>
          </div>); })}
      </div>

      {show && (() => { const d = DATASETS.find((x) => x.key === show)!; const bad = out[show].filter((r) => r.issues.length); return (
        <div id="problems" className="card" style={{ overflowX: "auto", marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>{d.title}: rows with problems ({bad.length})</h3>
          <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Row</th><th>Program</th><th>Column</th><th>Problem</th><th></th><th></th></tr></thead>
            <tbody>{bad.slice(0, 150).flatMap((r) => r.issues.map((i, n) => <tr key={`${r.ref}-${n}`}><td><b>{r.name}</b>{r.kind === "student" && <div className="small-note" style={{ margin: 0 }}>{r.ref}</div>}</td><td>{r.program || "—"}</td><td>{i.col}</td><td>{i.problem}</td><td>{i.severity === "reject" ? pill("Will be rejected", "#B3261E") : pill("Please check", "#9A3412")}</td><td>{r.kind !== "none" && <a className="act" href={fix(r.kind, r.id)}>Fix</a>}</td></tr>))}</tbody>
          </table>
          {bad.length > 150 && <p className="small-note">Showing the first 150 rows.</p>}
        </div>); })()}

      <div className="card" style={{ overflowX: "auto", marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Export log</h3>
        {!log.ok ? <div className="err">{HEMIS_HINT}</div> : (
          <table className="table" style={{ fontSize: 13 }}><thead><tr><th>When</th><th>Who</th><th>Data set</th><th>Rows</th><th>Rows with problems</th></tr></thead>
            <tbody>{log.rows.length ? log.rows.map((r) => <tr key={r.id}><td>{new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td><td>{r.by}</td><td>{r.dataset === "all" ? "All six" : DATASETS.find((d) => d.key === r.dataset)?.title || r.dataset}</td><td>{r.rows}</td><td style={{ color: r.rejected ? "#B3261E" : "#1E6B3A", fontWeight: 700 }}>{r.rejected}</td></tr>) : <tr><td colSpan={5}>Nothing downloaded yet.</td></tr>}</tbody>
          </table>
        )}
      </div>
    </Shell>
  );
}
