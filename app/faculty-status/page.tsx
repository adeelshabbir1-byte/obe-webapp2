import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import * as F from "../../lib/facultyStatus";
import { NCEAC_FIELDS } from "../../lib/facultyRulesCore";
import { FullLoadForm, StatusTable } from "../../components/FacultyStatusForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Faculty status and load" };

// Queue item 23: every faculty member's highest degree, designation, employment and class (editable, with defaults),
// their FTE in each program, and NCEAC Criterion 5 (Faculty) per program with its clauses.
const TABS = [["people", "Faculty status"], ["fte", "FTE by program"], ["nceac", "NCEAC Criterion 5"]] as const;
const KLASS: Record<string, string> = { DEDICATED: "Dedicated", SHARED: "Shared", VISITING: "Visiting", DEMONSTRATOR: "Demonstrator" };
export default async function FacultyStatusPage({ searchParams }: { searchParams: { tab?: string; dept?: string; program?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const can = F.canEditFaculty(user as never);
  if (!can && !["OMC", "PROGRAM_COORDINATOR"].includes(user.role)) redirect("/home");
  const cid = await chairmanIdFor(user as never);
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "people";
  const depts = await prisma.department.findMany({ where: { chairmanId: cid }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const dept = searchParams.dept || "";
  const q = (o: Record<string, string>) => `/faculty-status?${new URLSearchParams(Object.fromEntries(Object.entries({ tab, dept, program: searchParams.program || "", ...o }).filter(([, v]) => v))).toString()}`;
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty status and load</h1>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 10px" }}>{TABS.map(([k, t]) => <Link key={k} href={q({ tab: k })} className={`btn btn-sm ${tab === k ? "" : "btn-secondary"}`}>{t}</Link>)}
      {tab !== "nceac" && depts.length > 1 && <span style={{ marginLeft: 8, fontSize: 12.5 }}>Department: {[{ id: "", name: "All" }, ...depts].map((d) => <Link key={d.id} href={q({ dept: d.id })} style={{ marginRight: 8, fontWeight: dept === d.id ? 700 : 400 }}>{d.name}</Link>)}</span>}</div>
    {c}</Shell>;
  const full = await F.fullLoad(cid);

  if (tab === "people") {
    const { people, ready } = await F.facultyOf(cid, dept || null);
    return shell(<>
      {!ready && <div className="card err">{F.FST_HINT}</div>}
      <p className="small-note" style={{ marginTop: 0 }}>Defaults until someone changes them: a name starting with &quot;Dr&quot; is a PhD, a lab engineer has a BS (16 years) and counts as a demonstrator, everyone else has an MS / MPhil (18 years). The faculty upload sheet also takes Highest degree, Designation and Employment. The NCEAC class is worked out from the load each person carries in a program unless you set it. AQ / PQ is NBEAC&apos;s classification and is used only for NBEAC (business) programs.</p>
      <div className="card"><FullLoadForm value={full} can={can} /> <span className="small-note">— NCEAC: at most 9 a semester (§3.2.5.3); used for visiting teachers&apos; FTE.</span></div>
      <StatusTable people={people.map((p) => ({ id: p.id, name: p.name, degree: p.degree, designation: p.designation, employment: p.employment, cls: p.cls, aqpq: p.aqpq }))} can={can && ready} nbeac />
    </>);
  }
  if (tab === "fte") {
    const m = await F.fteMatrix(cid, dept || null);
    return shell(<div className="card" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><b>Basis:</b> <span className="small-note">{m.basis}</span><a className="btn btn-sm btn-secondary" href={`/api/faculty-status?fte=csv${dept ? `&dept=${dept}` : ""}`}>⬇ Excel (CSV)</a></div>
      <p className="small-note">A full-time teacher&apos;s FTE in a program is the share of their own teaching done there (their row adds up to 1). A visiting teacher&apos;s is their credit hours there ÷ the full load ({m.full} a semester). Hours count every course in every program and department, including evening and weekend classes (NCEAC §3.2.5.2(e)); a lab engineer counts one credit hour per lab.</p>
      {!m.rows.length ? <p className="small-note">No faculty with courses in this term or year.</p> :
        <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Name</th><th>Designation</th><th>Degree</th><th>Employment</th>{m.programs.map((p) => <th key={p}>{p}</th>)}<th>Total FTE</th><th>Credit hours</th></tr></thead>
          <tbody>{m.rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.designation || "—"}</td><td>{r.degree}</td><td>{r.employment.toLowerCase().replace("_", " ")}</td>{r.cells.map((c) => <td key={c.program} title={`${c.hours} credit hours`}>{c.fte ? c.fte.toFixed(2) : ""}</td>)}<td><b>{r.total.toFixed(2)}</b></td><td>{r.hours}</td></tr>)}
            <tr><td colSpan={4}><b>Program total</b></td>{m.programs.map((p, i) => <td key={p}><b>{m.rows.reduce((a, r) => a + r.cells[i].fte, 0).toFixed(2)}</b></td>)}<td colSpan={2}></td></tr></tbody></table>}
    </div>);
  }
  const programs = (await F.loads(cid)).programs;
  const program = searchParams.program && programs.includes(searchParams.program) ? searchParams.program : programs[0];
  if (!program) return shell(<p className="small-note">No offered courses yet.</p>);
  const n = await F.nceacFor(cid, program);
  return shell(<>
    <div style={{ fontSize: 12.5, marginBottom: 8 }}>Program: {programs.map((p) => <Link key={p} href={q({ program: p })} style={{ marginRight: 10, fontWeight: p === program ? 700 : 400 }}>{p}</Link>)}</div>
    <div className="card"><b>{program}</b> · {n.term} · requirements: <b>{n.version.label}</b> (from {n.version.fromTerm} {n.version.fromYear}) · {n.yearsRunning >= 4 ? "four batches running" : `${n.yearsRunning} year(s) running`}
      <table className="table" style={{ fontSize: 12.5, marginTop: 6 }}><thead><tr><th>Check</th><th>Here</th><th>Needed</th><th></th><th>Clause</th></tr></thead>
        <tbody>{n.checks.map((c, i) => <tr key={i}><td>{c.label}</td><td>{c.have}</td><td>{c.need}</td><td style={{ color: c.ok ? "#1B7F3B" : "#B3261E" }}>{c.ok ? "✓" : "✗"}</td><td><span className="badge">{c.clause}</span></td></tr>)}</tbody></table>
      <p className="small-note">A faculty member is relevant to a computing program with a 16-year degree in computing, a terminal degree in computing, or a terminal degree in related sciences / engineering with computing experience (NCEAC 2023 §3.2.5). Classes: dedicated = hired for the program and carrying at least the minimum load in it; shared = full-time elsewhere or without that load; visiting = not employed full-time (§3.2.5.1).</p></div>
    <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Teachers of {program}</h3>
      <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Name</th><th>Degree</th><th>Class</th><th>Why</th><th>Here (term / year)</th><th>All teaching (term / year)</th><th>FTE here</th><th></th></tr></thead>
        <tbody>{n.rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.degree}</td><td>{KLASS[r.klass]}</td><td className="small-note">{r.why}</td><td>{r.inProgTerm} / {n.yearKnown ? r.inProgYear : "—"}</td><td>{r.allTerm} / {n.yearKnown ? r.allYear : "—"}</td><td>{r.fte.toFixed(2)}</td><td>{r.overLoad ? <span style={{ color: "#B3261E" }}>over {n.version.rules.maxLoadTerm} this semester</span> : r.underLoad ? <span style={{ color: "#B26A00" }}>below the yearly minimum</span> : ""}</td></tr>)}</tbody></table>
      <p className="small-note">Change a degree or class on <Link href="/faculty-status">Faculty status</Link>. The Super Admin team keeps the requirement figures; a newer version applies from the term it names. Figures: {NCEAC_FIELDS.length} items from the NCEAC Accreditation Manual 2023 §3.2.5.</p></div>
  </>);
}
