import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { aasContext } from "../../../lib/aasAccess";
import { SECTIONS, sectionRows, sectionGaps, adb, AAS_HINT } from "../../../lib/aas";
import AasUpload from "../../../components/AasUpload";

export const dynamic = "force-dynamic";

// Where each AAS section's data comes from in OBEHUB, so people know where to fix it at source.
const SOURCE: Record<string, string> = {
  focal: "The focal person's faculty profile", institute: "Typed here (workbook)", contacts: "Institute Head, Dean and Librarian accounts and profiles", departments: "Departments, Chairmen's profiles, program councils",
  programs: "Department programs, batches, scheme of studies", faculty: "Faculty profiles and their education records", courses: "Courses of the program", students: "Students of the batch, admission inquiries",
  form1: "Typed here (workbook)", form1y: "Batches and their students", form2: "Rooms, lab inventory, library record", form3: "Meetings, placements; the rest typed here", form4: "Finance (spending by year)", form5: "Offered courses, sections, teachers, enrolments",
};

// NCEAC's Accreditation Automation System: every AAS section with what OBEHUB fills and what is still missing.
export default async function AasPage({ searchParams }: { searchParams: { program?: string; batch?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const ctx = await aasContext(user, { program: searchParams.program, batch: searchParams.batch });
  if (!ctx) redirect("/dashboard");
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>NCEAC AAS</h1>
    <p className="small-note" style={{ marginBottom: 12 }}>Everything NCEAC&apos;s Accreditation Automation System asks for, section by section and named as AAS names it: My Profile, Institute&apos;s Profile, Departments &amp; Programs, Faculty Directory, Course Catalog, Student Directory and the five forms of the Accreditation Application. OBEHUB fills what it already knows. Download the workbook, fill the yellow cells, upload it back here, then copy each sheet into AAS. The Student Directory comes as a separate file for AAS&apos;s own Excel upload.</p>{x}</Shell>;
  let ready = true; try { await adb.aasRecord.count({ where: { chairmanId: ctx.chairmanId } }); } catch { ready = false; }
  if (!ctx.programs.length) return shell(<div className="card">No program is bound to NCEAC yet. Bind your computing programs to NCEAC under Accreditation governance first.</div>);
  const results = await Promise.all(SECTIONS.map(async (s) => ({ s, g: sectionGaps(s.key, await sectionRows(s.key, ctx)) })));
  const g = (k: string) => results.find((r) => r.s.key === k)!.g;
  const formsMissing = ["form1", "form1y", "form2", "form3", "form4", "form5"].reduce((t, k) => t + g(k).missing, 0);
  const form5 = await sectionRows("form5", ctx);
  const unlinked = form5.filter((r) => !r.values.teacher).length;
  const rules: [string, boolean, string][] = [
    ["Every question of the accreditation forms answered", formsMissing === 0, formsMissing ? `${formsMissing} answer(s) still empty in Forms I–V` : "all answered"],
    ["Faculty Directory is not empty", g("faculty").rows > 0, `${g("faculty").rows} faculty`],
    ["Student Directory has students of the batch under accreditation", g("students").rows > 0, `${g("students").rows} students`],
    ["No student record left incomplete (AAS keeps these pending)", g("students").missing === 0, g("students").missing ? `${g("students").missing} compulsory student field(s) empty` : "complete"],
    ["Course Catalog is not empty", g("courses").rows > 0, `${g("courses").rows} courses`],
    ["Every offered course is linked to a teacher", form5.length > 0 && unlinked === 0, unlinked ? `${unlinked} course(s) without a teacher` : `${form5.length} courses linked`],
  ];
  const staff = await prisma.user.findMany({ where: { OR: [{ id: ctx.chairmanId }, { managedById: ctx.chairmanId }] }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const qs = `program=${encodeURIComponent(ctx.program)}&batch=${ctx.batchId || ""}`;
  return shell(<>
    {!ready && <div className="err">{AAS_HINT} Until then the workbook downloads, but values typed in it cannot be saved.</div>}
    <form className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label style={{ fontSize: 12 }}>Program under accreditation<br /><select name="program" defaultValue={ctx.program}>{ctx.programs.map((p) => <option key={p}>{p}</option>)}</select></label>
      <label style={{ fontSize: 12 }}>Batch (Student Directory)<br /><select name="batch" defaultValue={ctx.batchId || ""}>{ctx.batches.map((b) => <option key={b.id} value={b.id}>{b.batchName}</option>)}</select></label>
      <button className="btn btn-secondary btn-sm">Show</button>
      <a className="btn btn-brass btn-sm" href={`/api/accreditation/aas?file=workbook&${qs}`}>⬇ AAS workbook (all sections)</a>
      <a className="btn btn-brass btn-sm" href={`/api/accreditation/aas?file=students&${qs}`}>⬇ Student Directory (AAS upload)</a>
    </form>
    <div className="card" style={{ borderLeft: `4px solid ${rules.every((r) => r[1]) ? "#2E7D4F" : "#B3261E"}` }}>
      <h3 style={{ marginTop: 0 }}>Can the application be submitted?</h3>
      <p className="small-note" style={{ marginTop: 0 }}>AAS refuses to submit while any of these fails.</p>
      <table style={{ fontSize: 13 }}><tbody>{rules.map(([l, ok, n]) => <tr key={l}><td style={{ color: ok ? "#2E7D4F" : "#B3261E", fontWeight: 700 }}>{ok ? "✓" : "✗"}</td><td>{l}</td><td className="small-note">{n}</td></tr>)}</tbody></table>
    </div>
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ marginTop: 0 }}>AAS sections</h3>
      <table style={{ fontSize: 13 }}>
        <thead><tr><th>AAS section</th><th>Rows</th><th>Compulsory empty</th><th>Wrong format</th><th>Filled from</th></tr></thead>
        <tbody>{results.map(({ s, g }) => (
          <tr key={s.key}><td><b>{s.title}</b>{g.notes.length > 0 && <div className="small-note" style={{ color: "#A35A00" }}>{g.notes.join(" · ")}</div>}</td><td>{g.rows}</td>
            <td style={{ color: g.missing ? "#B3261E" : "#2E7D4F", fontWeight: 700 }}>{g.missing || "—"}</td><td style={{ color: g.invalid ? "#A35A00" : undefined }}>{g.invalid || "—"}</td><td className="small-note">{SOURCE[s.key]}</td></tr>
        ))}</tbody>
      </table>
    </div>
    {ctx.canEdit && <div className="card"><h3 style={{ marginTop: 0 }}>Save what you filled in</h3><AasUpload program={ctx.program} batch={ctx.batchId || ""} staff={staff} focalId={ctx.focalId} canFocal={["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role)} />
      <p className="small-note">Values you type in the workbook are kept and win over what OBEHUB works out. Fixing data at its source (a faculty profile, the lab inventory) also updates the workbook.</p></div>}
  </>);
}
