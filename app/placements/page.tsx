import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";
import { cdb } from "../../lib/complexProblems";
import { KINDS, SALARY, type Placement } from "../../lib/placements";

export const dynamic = "force-dynamic";
const STAFF = ["CHAIRMAN", "PROGRAM_COORDINATOR", "STUDENT_AFFAIRS", "HEAD_OF_DEPARTMENT", "DEAN", "DEPARTMENT_COORDINATOR"];

// Internships and graduate placement by batch: who has interned, employment within six months, in-field share, top employers.
export default async function PlacementsPage({ searchParams }: { searchParams: { batch?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!STAFF.includes(user.role)) redirect("/dashboard");
  const cid = await chairmanIdFor(user);
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22 }}>Internships &amp; Placements</h1>{c}</Shell>;
  const batches = await prisma.batch.findMany({ where: user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : { coordinator: { managedById: cid } }, select: { id: true, degreeProgram: true, batchName: true, startYear: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const sel = batches.find((b) => b.id === searchParams.batch) || batches[0];
  if (!sel) return shell(<p className="small-note">No batches.</p>);
  const studs = await prisma.student.findMany({ where: { batchId: sel.id }, select: { id: true, name: true, rollNumber: true }, orderBy: { rollNumber: "asc" } });
  const list = ((await cdb.placement.findMany({ where: { studentId: { in: studs.map((s) => s.id) } }, orderBy: { startDate: "asc" } }).catch(() => null)) as Placement[] | null);
  if (list === null) return shell(<div className="err">Run prisma/migration_teaching_extras.sql first.</div>);
  const sOf = new Map(studs.map((s) => [s.id, s]));
  const has = (k: string) => new Set(list.filter((p) => p.kind === k).map((p) => p.studentId));
  const interned = has("INTERNSHIP"), employed = new Set([...has("JOB"), ...has("STARTUP")]), study = has("HIGHER_STUDY");
  const grad = new Date(sel.startYear + 4, 6, 1);
  const within6 = new Set(list.filter((p) => (p.kind === "JOB" || p.kind === "STARTUP" || p.kind === "HIGHER_STUDY") && p.startDate && p.startDate.getTime() <= grad.getTime() + 183 * 86400000).map((p) => p.studentId));
  const jobs = list.filter((p) => p.kind === "JOB");
  const pct = (n: number) => (studs.length ? Math.round((100 * n) / studs.length) : 0);
  const employers = Array.from(jobs.reduce((m, p) => m.set(p.organization, (m.get(p.organization) || 0) + 1), new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const kn = new Map(KINDS);
  return shell(<>
    <form className="card" style={{ display: "flex", gap: 8 }}><select name="batch" defaultValue={sel.id}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select><button className="btn btn-secondary btn-sm">Show</button><Link href="/coordinator/surveys" className="act">Internship &amp; employer surveys</Link></form>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
      {[["Did an internship", `${pct(interned.size)}%`], ["Employed / own business", `${pct(employed.size)}%`], ["Higher study", `${pct(study.size)}%`], ["Placed within 6 months of graduating", `${pct(within6.size)}%`], ["Jobs in field", jobs.length ? `${Math.round((100 * jobs.filter((j) => j.inField).length) / jobs.length)}%` : "—"]].map(([l, v]) => <div key={l} className="card" style={{ margin: 0 }}><div className="small-note">{l}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div></div>)}
    </div>
    {employers.length > 0 && <p className="small-note">Top employers: {employers.map(([o, n]) => `${o} (${n})`).join(" · ")}</p>}
    <div className="card"><ActionForm url="/api/placements" fixed={{}} submit="Add" collapsed openLabel="Add a record" initial={{ kind: "INTERNSHIP", inField: true, salaryBand: "" }}
      fields={[{ name: "rollNumber", label: "Roll number", width: 140 }, { name: "kind", label: "Type", type: "select", options: KINDS }, { name: "organization", label: "Organisation / university", width: 220 }, { name: "position", label: "Position", width: 160 }, { name: "city", label: "City", width: 110 }, { name: "startDate", label: "Start", type: "date" }, { name: "endDate", label: "End", type: "date" }, { name: "salaryBand", label: "Monthly pay", type: "select", options: SALARY }, { name: "inField", label: "In field", type: "checkbox" }]} /></div>
    <div className="card" style={{ overflowX: "auto" }}><table><thead><tr><th>Student</th><th>Type</th><th>Organisation</th><th>Start</th><th>In field</th><th /></tr></thead>
      <tbody>{list.map((p) => <tr key={p.id}><td>{sOf.get(p.studentId)?.rollNumber} {sOf.get(p.studentId)?.name}</td><td>{kn.get(p.kind)}</td><td>{p.organization}{p.position ? ` · ${p.position}` : ""}</td><td>{p.startDate?.toISOString().slice(0, 10) || "—"}</td><td>{p.inField ? "Yes" : "No"}</td>
        <td style={{ whiteSpace: "nowrap" }}>{p.verifiedById ? <ActionButton url="/api/placements" body={{ action: "verify", id: p.id, undo: true }} label="Verified ✓" className="btn btn-secondary btn-sm" /> : <ActionButton url="/api/placements" body={{ action: "verify", id: p.id }} label="Verify" />} <ActionButton url="/api/placements" body={{ action: "delete", id: p.id }} label="✕" className="btn btn-secondary btn-sm" confirmText="Delete this record?" /></td></tr>)}</tbody></table>
      {!list.length && <p className="small-note">No records for this batch yet. Students add their own under Internships &amp; Jobs.</p>}
      <p className="small-note">Still without an internship: {studs.filter((s) => !interned.has(s.id)).length} students.</p></div>
  </>);
}
