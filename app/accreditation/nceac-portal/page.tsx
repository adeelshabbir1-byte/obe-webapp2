import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { aasContext } from "../../../lib/aasAccess";
import { SECTIONS, sectionRows, sectionGaps } from "../../../lib/aas";
import { PORTAL_LISTS, listsWith } from "../../../lib/nceacLists";
import { INVENTORY, GROUP_LABEL, type Group } from "../../../lib/nceacInventory";
import { STUDENT_TEMPLATE, FACULTY_TEMPLATE, portalLists, studentExport, facultyExport, summary, courseCatalog, exportLog, PORTAL_HINT, type ExportRow } from "../../../lib/nceacPortal";
import HowCalculated from "../../../components/HowCalculated";
import { PortalImport, RemindTeachers, ListEditor } from "../../../components/NceacPortalTools";

export const dynamic = "force-dynamic";

const TABS = [["files", "Upload files & checks"], ["checklist", "Missing data checklist"], ["inventory", "Field inventory"], ["lists", "Portal dropdown lists"], ["log", "Export log"]] as const;
const GROUP_COLOUR: Record<Group, string> = { AUTO: "#1E6B3A", DERIVED: "#1F4E8C", INPUT: "#9A3412" };
const SOURCE_LABEL: Record<string, [string, string]> = { screenshot: ["From the portal's screen", "#1E6B3A"], template: ["From the portal's template", "#1E6B3A"], report: ["From the portal's printout", "#1F4E8C"], check: ["To confirm on the portal", "#9A3412"] };
const pill = (t: string, bg: string) => <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 999, background: bg, color: "#fff", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{t}</span>;

// Accreditation → NCEAC Portal Data: what the NCEAC portal (AAS) asks for, where each value comes from in OBEHUB, and the
// students and faculty files in the portal's exact upload format, checked row by row before download.
export default async function NceacPortalPage({ searchParams }: { searchParams: { program?: string; batch?: string; tab?: string; scope?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const ctx = await aasContext(user, { program: searchParams.program, batch: searchParams.batch === "all" ? null : searchParams.batch });
  if (!ctx) redirect("/dashboard");
  const tab = TABS.some((t) => t[0] === searchParams.tab) ? searchParams.tab! : "files";
  const batchSel = searchParams.batch === "all" ? "all" : ctx.batchId || "all";
  const scope = searchParams.scope === "all" ? "all" : "program";
  const qs = (o: Record<string, string> = {}) => new URLSearchParams({ program: ctx.program, batch: batchSel, scope, tab, ...o }).toString();
  const lists = await portalLists(ctx.chairmanId);
  const canLists = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role);

  const head = (
    <>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>NCEAC Portal Data</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>Everything the NCEAC portal (AAS) asks for, and where OBEHUB gets it. Download the students and faculty files in the portal&apos;s own upload format, already filled and checked. See also the <a href={`/accreditation/aas?program=${encodeURIComponent(ctx.program)}`}>NCEAC AAS workbook</a> for the other forms.</p>
      <HowCalculated shows="Each portal field is either Auto (OBEHUB already holds it), Derived (OBEHUB works it out with the formula shown) or Input needed (someone types it; the place is shown). Before you download, every row is checked against the portal's rules.">
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
          <li><b>Will be rejected</b>: a compulsory column is empty, a date or number is not in the right form, a CNIC is not 13 digits, or a value is not one of the portal&apos;s dropdown choices.</li>
          <li><b>Please check</b>: the portal accepts it, but it may be wrong (e.g. a degree date worked out from the year only, or an unusual age).</li>
          <li>Files: same sheet name, headers, column order and widths as the portal&apos;s templates; dates are real dates shown as 5-Jan-2026; dropdown values spelt exactly as on the portal; nothing extra.</li>
          <li>Current students: everyone in the batch except those who left, dropped, graduated, transferred out or were rusticated. Teachers of a program: everyone who teaches one of its courses (or a section), its Program Leads and the HOD.</li>
        </ul>
      </HowCalculated>
      <form className="card no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <input type="hidden" name="tab" value={tab} />
        <label style={{ fontSize: 12 }}>Program<br /><select name="program" defaultValue={ctx.program}>{ctx.programs.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Batch (students file)<br /><select name="batch" defaultValue={batchSel}><option value="all">All current batches</option>{ctx.batches.map((b) => <option key={b.id} value={b.id}>{b.batchName}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Teachers (faculty file)<br /><select name="scope" defaultValue={scope}><option value="program">Teachers of this program</option><option value="all">All faculty of the institute</option></select></label>
        <button className="btn btn-secondary btn-sm">Show</button>
      </form>
      <div role="tablist" className="tabs no-print">{TABS.map(([k, l]) => <a key={k} role="tab" className="tab" aria-selected={tab === k} href={`?${qs({ tab: k })}`}>{l}</a>)}</div>
    </>
  );
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{head}{x}</Shell>;
  if (!ctx.programs.length) return <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22 }}>NCEAC Portal Data</h1><div className="card">No program is bound to NCEAC yet. Bind your computing programs to NCEAC under Accreditation governance first.</div></Shell>;

  const fixHref = (kind: "student" | "staff", id: string) => `/accreditation/nceac-portal/fix?kind=${kind}&id=${encodeURIComponent(id)}&program=${encodeURIComponent(ctx.program)}&back=${encodeURIComponent(`?${qs()}`)}`;

  if (tab === "inventory") {
    const forms = Array.from(new Set(INVENTORY.map((f) => f.form)));
    const n = (g: Group) => INVENTORY.filter((f) => f.group === g).length;
    return shell(<>
      <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        {(["AUTO", "DERIVED", "INPUT"] as Group[]).map((g) => <div key={g} style={{ borderLeft: `5px solid ${GROUP_COLOUR[g]}`, paddingLeft: 10 }}><div style={{ fontSize: 24, fontWeight: 800, color: GROUP_COLOUR[g] }}>{n(g)}</div><div className="small-note" style={{ margin: 0 }}>{GROUP_LABEL[g]}</div></div>)}
        <a className="btn btn-brass btn-sm no-print" style={{ marginLeft: "auto" }} href={`/api/accreditation/nceac-portal?file=inventory&${qs()}`}>⬇ Field inventory (Excel)</a>
      </div>
      {forms.map((fm) => (
        <div key={fm} className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>{fm}</h3>
          <table className="table"><thead><tr><th>Field</th><th>Type</th><th>Allowed values</th><th>Required</th><th>Group</th><th>Source / formula / where it is typed</th></tr></thead>
            <tbody>{INVENTORY.filter((f) => f.form === fm).map((f, i) => <tr key={i}><td><b>{f.field}</b></td><td>{f.type}</td><td style={{ fontSize: 12 }}>{f.allowed || "—"}</td><td>{f.required ? "Yes" : "No"}</td><td>{pill(f.group === "AUTO" ? "Auto" : f.group === "DERIVED" ? "Derived" : "Input", GROUP_COLOUR[f.group])}</td><td style={{ fontSize: 12.5 }}>{f.source}</td></tr>)}</tbody>
          </table>
        </div>
      ))}
    </>);
  }

  if (tab === "lists") {
    const defaults = listsWith();
    return shell(<div className="card" style={{ overflowX: "auto" }}>
      <p className="small-note" style={{ marginTop: 0 }}>OBEHUB&apos;s forms offer these values as dropdowns, and the files use them, so what you send matches the portal exactly. Older wording is turned into the portal&apos;s (e.g. <i>Assistant Professor</i> → <b>AssistantProfessor</b>, <i>Permanent</i> → <b>FullTime</b>, <i>KPK</i> → <b>Khyber Pakhtunkhwa</b>). Lists marked &quot;To confirm on the portal&quot; were not visible in the screenshots: check them once and correct them here if needed.</p>
      <table className="table"><thead><tr><th>List</th><th>Values</th><th>Where it comes from</th></tr></thead>
        <tbody>{PORTAL_LISTS.map((l) => { const cur = lists[l.key] || l.values; const changed = cur.join("|") !== (defaults[l.key] || []).join("|"); const [t, col] = SOURCE_LABEL[l.source]; return (
          <tr key={l.key}><td><b>{l.label}</b>{changed && <div className="small-note" style={{ margin: 0, color: "#9A3412" }}>corrected by the institute</div>}</td>
            <td><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{cur.map((v) => <code key={v} style={{ background: "#F3ECEE", padding: "1px 6px", borderRadius: 6, fontSize: 12 }}>{v}{l.labels?.[v] ? ` = ${l.labels[v]}` : ""}</code>)}</div><ListEditor k={l.key} label={l.label} values={cur} changed={changed} canEdit={canLists} /></td>
            <td>{pill(t, col)}{l.note && <div className="small-note" style={{ margin: "4px 0 0" }}>{l.note}</div>}</td></tr>); })}</tbody>
      </table>
    </div>);
  }

  if (tab === "log") {
    const log = await exportLog(ctx.chairmanId);
    return shell(<div className="card" style={{ overflowX: "auto" }}>
      {!log.ok && <div className="err">{PORTAL_HINT}</div>}
      <table className="table"><thead><tr><th>When</th><th>Who</th><th>File</th><th>Program</th><th>Batch</th><th>Rows</th><th>Rows with problems</th></tr></thead>
        <tbody>{log.rows.length ? log.rows.map((r) => <tr key={r.id}><td>{new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td><td>{r.by}</td><td>{r.kind === "students" ? "Students file" : r.kind === "faculty" ? "Faculty file" : "Courses Catalog"}</td><td>{r.program}</td><td>{r.batchName || "—"}</td><td>{r.rowCount}</td><td style={{ color: r.rejectedCount ? "#B3261E" : "#1E6B3A", fontWeight: 700 }}>{r.rejectedCount}</td></tr>) : <tr><td colSpan={7}>No file downloaded yet.</td></tr>}</tbody>
      </table>
    </div>);
  }

  const [students, faculty] = await Promise.all([studentExport(ctx, batchSel, lists), facultyExport(ctx, scope, lists)]);
  const ss = summary(students), fs = summary(faculty);

  if (tab === "checklist") {
    const byBatch = ctx.batches.map((b) => ({ b, rows: (students as (ExportRow & { batch: string })[]).filter((r) => r.batch === b.batchName) })).filter((x) => batchSel === "all" || x.b.id === batchSel);
    const gapSections = ["focal", "institute", "contacts", "departments", "programs", "form1", "form1y", "form2", "form3", "form4"];
    const gaps = await Promise.all(SECTIONS.filter((s) => gapSections.includes(s.key)).map(async (s) => ({ s, g: sectionGaps(s.key, await sectionRows(s.key, ctx)) })));
    const bad = faculty.filter((r) => r.issues.some((i) => i.severity === "reject"));
    return shell(<>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Students — filled by the students themselves (My Details) or by the Program Lead</h3>
        <table className="table"><thead><tr><th>Batch</th><th>Current students</th><th>Ready</th><th>Still missing something</th><th>Most often missing</th></tr></thead>
          <tbody>{byBatch.map(({ b, rows }) => { const s = summary(rows); return <tr key={b.id}><td><b>{b.batchName}</b></td><td>{s.rows}</td><td style={{ color: "#1E6B3A", fontWeight: 700 }}>{s.ready}</td><td style={{ color: s.rejected ? "#B3261E" : "#1E6B3A", fontWeight: 700 }}>{s.rejected}</td><td style={{ fontSize: 12.5 }}>{s.topColumns.map(([c, n]) => `${c} (${n})`).join(", ") || "—"}</td></tr>; })}</tbody>
        </table>
        <p className="small-note">Students see these fields on <b>My Details</b> in the student portal. The Program Lead can fix one student (Fix link on the first tab) or upload the students file filled from the admission records.</p>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><h3 style={{ margin: 0 }}>Teachers — filled by each teacher (My Profile → NCEAC details)</h3><RemindTeachers program={ctx.program} count={bad.length} /></div>
        <table className="table" style={{ marginTop: 8 }}><thead><tr><th>Teacher</th><th>Still needed</th><th>Who fills it</th><th></th></tr></thead>
          <tbody>{bad.length ? bad.map((r) => <tr key={r.id}><td><b>{r.name}</b></td><td style={{ fontSize: 12.5 }}>{Array.from(new Set(r.issues.filter((i) => i.severity === "reject").map((i) => i.col))).join(", ")}</td><td>The teacher (My Profile), or the HOD</td><td><a className="act" href={fixHref("staff", r.id)}>Fix</a></td></tr>) : <tr><td colSpan={4} style={{ color: "#1E6B3A", fontWeight: 700 }}>Every teacher&apos;s row is complete ✓</td></tr>}</tbody>
        </table>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Institute and program data — filled by the NCEAC focal person or HOD on the AAS page</h3>
        <table className="table"><thead><tr><th>AAS section</th><th>Compulsory empty</th><th>Wrong format</th><th></th></tr></thead>
          <tbody>{gaps.map(({ s, g }) => <tr key={s.key}><td>{s.title}</td><td style={{ color: g.missing ? "#B3261E" : "#1E6B3A", fontWeight: 700 }}>{g.missing}</td><td style={{ color: g.invalid ? "#B3261E" : "#1E6B3A", fontWeight: 700 }}>{g.invalid}</td><td><a className="act" href={`/accreditation/aas?program=${encodeURIComponent(ctx.program)}`}>Open AAS</a></td></tr>)}</tbody>
        </table>
        <p className="small-note">The narrative answers of the portal&apos;s forms (POs, GAs, Curriculum, Students, Faculty, Quality, Industrial Linkages) are written by the program team in the <a href="/accreditation/sar">SAR</a>.</p>
      </div>
    </>);
  }

  // Files tab
  const catalog = await courseCatalog(ctx.chairmanId, ctx.program);
  const problems = [...students.map((r) => ({ r, kind: "student" as const, file: "Students" })), ...faculty.map((r) => ({ r, kind: "staff" as const, file: "Faculty" }))].filter((x) => x.r.issues.length);
  const card = (t: typeof STUDENT_TEMPLATE, s: ReturnType<typeof summary>, href: string, kind: "students" | "faculty") => (
    <div className="card" style={{ borderLeft: `5px solid ${s.rejected ? "#B3261E" : "#1E6B3A"}` }}>
      <h3 style={{ marginTop: 0 }}>{t.title}</h3>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "4px 0 8px" }}>
        <div><div style={{ fontSize: 22, fontWeight: 800 }}>{s.rows}</div><div className="small-note" style={{ margin: 0 }}>rows</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: "#1E6B3A" }}>{s.ready}</div><div className="small-note" style={{ margin: 0 }}>ready</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: s.rejected ? "#B3261E" : "#1E6B3A" }}>{s.rejected}</div><div className="small-note" style={{ margin: 0 }}>would be rejected</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: s.checks ? "#9A3412" : "#1E6B3A" }}>{s.checks}</div><div className="small-note" style={{ margin: 0 }}>to check</div></div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} className="no-print">
        <a className="btn btn-brass btn-sm" href={href}>⬇ Download {kind} file (NCEAC format)</a>
        {s.rejected > 0 && s.ready > 0 && <a className="btn btn-secondary btn-sm" href={`${href}&only=ready`}>⬇ Only the {s.ready} ready row(s)</a>}
        {ctx.canEdit && <PortalImport kind={kind} program={ctx.program} batch={batchSel === "all" ? "" : batchSel} />}
      </div>
      <p className="small-note" style={{ marginBottom: 0 }}>{t.note} Columns: {t.cols.map((x) => x.header).join(" · ")}.</p>
    </div>
  );
  return shell(<>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
      {card(STUDENT_TEMPLATE, ss, `/api/accreditation/nceac-portal?file=students&${qs()}`, "students")}
      {card(FACULTY_TEMPLATE, fs, `/api/accreditation/nceac-portal?file=faculty&${qs()}`, "faculty")}
    </div>
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ marginTop: 0 }}>What the portal would reject, and what to check</h3>
      {problems.length === 0 ? <p style={{ color: "#1E6B3A", fontWeight: 700 }}>Both files are complete and pass every check ✓</p> : (
        <table className="table"><thead><tr><th>File</th><th>Row</th><th>Column</th><th>Problem</th><th></th><th></th></tr></thead>
          <tbody>{problems.slice(0, 120).flatMap(({ r, kind, file }) => r.issues.map((i, n) => (
            <tr key={`${r.id}-${n}`}><td>{file}</td><td><b>{r.name}</b>{kind === "student" ? <div className="small-note" style={{ margin: 0 }}>{r.ref}</div> : null}</td><td>{i.col}</td><td style={{ fontSize: 12.5 }}>{i.problem}</td>
              <td>{i.severity === "reject" ? pill("Will be rejected", "#B3261E") : pill("Please check", "#9A3412")}</td>
              <td>{ctx.canEdit && <a className="act" href={fixHref(kind, r.id)}>Fix</a>}</td></tr>)))}</tbody>
        </table>
      )}
      {problems.length > 120 && <p className="small-note">Showing the first 120 rows with problems. The checklist tab has the totals.</p>}
    </div>
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Courses Catalog (typed into the portal one course at a time)</h3>
      <p className="small-note" style={{ marginTop: 0 }}>The portal has no upload for courses, so this sheet lists them the way its form asks: course name, type (theory and lab separately), credit hours and the GA-1 … GA-10 ticks from your CLO→PLO mapping. {catalog.length} course(s); {catalog.filter((c) => c.note).length} with a note.</p>
      <a className="btn btn-secondary btn-sm no-print" href={`/api/accreditation/nceac-portal?file=courses&${qs()}`}>⬇ Courses Catalog sheet</a>
    </div>
  </>);
}
