import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { ActionButton } from "../../components/fyp/FypClient";
import LabFileForm from "../../components/LabFileForm";
import { pdb } from "../../lib/portfolio";
import { LAB_ROLES, LAB_KINDS } from "../../lib/labFile";

export const dynamic = "force-dynamic";
type E = { id: string; lab: string; kind: string; title: string; courseCode: string | null; entryDate: Date | null; note: string | null; fileName: string | null; fileUrl: string | null };

// The lab file panels ask for: per lab, manuals for every lab course, safety SOPs and training, maintenance and calibration.
export default async function LabFilePage({ searchParams }: { searchParams: { lab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const viewer = [...LAB_ROLES, "PROGRAM_COORDINATOR", "DEAN", "OMC"].includes(user.role);
  if (!viewer) redirect("/dashboard");
  const cid = await chairmanIdFor(user);
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22, marginBottom: 4 }}>Lab File</h1>{c}</Shell>;
  const entries = ((await pdb.labFileEntry.findMany({ where: { chairmanId: cid }, orderBy: [{ lab: "asc" }, { entryDate: "desc" }] }).catch(() => null)) as E[] | null);
  if (entries === null) return shell(<div className="err">Run prisma/migration_visit_extras.sql first.</div>);
  const rooms = (await prisma.room.findMany({ where: { chairmanId: cid, type: "LAB" }, select: { name: true }, orderBy: { name: "asc" } })).map((r) => r.name);
  const labs = Array.from(new Set([...rooms, ...entries.map((e) => e.lab)])).sort();
  const labCourses = Array.from(new Set((await prisma.course.findMany({ where: { courseType: "Lab", batch: { coordinator: { managedById: cid } } }, select: { code: true } })).map((c) => c.code))).sort();
  const manuals = new Set(entries.filter((e) => e.kind === "MANUAL" && e.courseCode).map((e) => e.courseCode!));
  const missing = labCourses.filter((c) => !manuals.has(c));
  const sel = searchParams.lab && labs.includes(searchParams.lab) ? searchParams.lab : null;
  const shown = sel ? entries.filter((e) => e.lab === sel) : entries;
  const kn = new Map(LAB_KINDS);
  const year = Date.now() - 365 * 86400000;
  return shell(<>
    <p className="small-note">Per lab: manuals for each lab course, safety rules and training, maintenance and calibration. Panels check every lab course has a manual and safety training happens each year.</p>
    <div className="card" style={{ overflowX: "auto" }}><table><thead><tr><th>Lab</th><th>Manuals</th><th>SOP / rules</th><th>Safety training (last 12 months)</th><th>Maintenance (12 months)</th><th>Records</th></tr></thead>
      <tbody>{labs.map((l) => { const es = entries.filter((e) => e.lab === l); const c = (k: string, recent = false) => es.filter((e) => e.kind === k && (!recent || (e.entryDate && e.entryDate.getTime() > year))).length; return (
        <tr key={l}><td><Link href={`/lab-file?lab=${encodeURIComponent(l)}`}>{l}</Link></td><td>{c("MANUAL")}</td><td style={{ color: c("SOP") ? undefined : "#B3261E" }}>{c("SOP") || "missing"}</td><td style={{ color: c("SAFETY_TRAINING", true) ? undefined : "#B3261E" }}>{c("SAFETY_TRAINING", true) || "none"}</td><td>{c("MAINTENANCE", true)}</td><td>{es.length}</td></tr>); })}</tbody></table>
      {missing.length > 0 && <p style={{ fontSize: 13, color: "#B3261E" }}>Lab courses without a manual: {missing.join(", ")}</p>}</div>
    {LAB_ROLES.includes(user.role) && <div className="card"><LabFileForm labs={labs} kinds={LAB_KINDS} courses={labCourses} /></div>}
    <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>{sel || "All labs"}</h3><table><thead><tr><th>Lab</th><th>Type</th><th>Title</th><th>Course</th><th>Date</th><th>Document</th><th /></tr></thead>
      <tbody>{shown.map((e) => <tr key={e.id}><td>{e.lab}</td><td>{kn.get(e.kind)}</td><td>{e.title}{e.note ? <div className="small-note">{e.note}</div> : null}</td><td>{e.courseCode || "—"}</td><td>{e.entryDate ? e.entryDate.toISOString().slice(0, 10) : "—"}</td><td>{e.fileUrl ? <a href={e.fileUrl} target="_blank" rel="noopener noreferrer">{e.fileName || "open"}</a> : "—"}</td>
        <td>{LAB_ROLES.includes(user.role) && <ActionButton url="/api/lab-file" body={{ id: e.id }} label="✕" className="btn btn-secondary btn-sm" confirmText="Remove this record?" />}</td></tr>)}</tbody></table></div>
  </>);
}
