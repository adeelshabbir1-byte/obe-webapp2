import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import * as M from "../../lib/workMonitor";
import { labsIn } from "../../lib/assets";
import { LabNeedForm } from "../../components/MonitoringForms";
export const dynamic = "force-dynamic";
export const metadata = { title: "Lab equipment for courses" };

// Queue item 20: each lab's working equipment against the courses that need it (one unit per N students); a shortfall
// is shown here and is evidence for the accreditation "lab adequacy" requirement.
export default async function LabNeedsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "OMC", "PROGRAM_COORDINATOR", "LAB_MANAGER"].includes(user.role)) redirect("/home");
  const cid = await chairmanIdFor(user as never);
  const shell = (title: string, c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22, marginBottom: 4 }}>{title}</h1>{c}</Shell>;
  const needs = await M.labNeeds(cid);
  if (!needs) return shell("Lab equipment for courses", <div className="card">{M.MON_HINT}</div>);
  const courses = await prisma.course.findMany({ where: { isOffered: true, coordinator: { managedById: cid } }, select: { id: true, code: true, title: true }, orderBy: { code: "asc" }, take: 400 });
  const labs = ((await labsIn(cid, null).catch(() => [])) as { id: string; name: string }[]);
  return shell("Lab equipment for courses", <>
    <div className="card"><LabNeedForm courses={courses.map((c) => ({ id: c.id, label: `${c.code} ${c.title}` }))} labs={labs.map((l) => ({ id: l.id, name: l.name }))} /></div>
    <div className="card" style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Equipment</th><th>Lab</th><th>Students</th><th>Needed</th><th>Working</th><th>Short</th></tr></thead>
      <tbody>{needs.map((n) => <tr key={n.id}><td>{n.course}</td><td>{n.category} (1 per {n.perStudents})</td><td>{labs.find((l) => l.id === n.labId)?.name || "any"}</td><td>{n.students}</td><td>{n.need}</td><td>{n.have}</td><td style={{ color: n.short ? "#B3261E" : "#1E6B3A", fontWeight: 700 }}>{n.short || "✓"}</td></tr>)}</tbody></table>
      {!needs.length && <p className="small-note">Add what each lab course needs above.</p>}</div>
  </>);
}
