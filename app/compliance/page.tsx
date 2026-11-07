import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import * as M from "../../lib/workMonitor";
import { ComplianceRow, SeedCompliance, AddCompliance } from "../../components/MonitoringForms";
export const dynamic = "force-dynamic";
export const metadata = { title: "Compliance monitor" };

// Queue item 20: every requirement of HEC, the councils and the QEC in one list — owner, due date, status, evidence and
// improvement. Items past their date and not met go red and are sent to the owner and the Head each day.
export default async function CompliancePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "OMC", "PROGRAM_COORDINATOR", "LAB_MANAGER"].includes(user.role)) redirect("/home");
  const cid = await chairmanIdFor(user as never);
  const shell = (title: string, c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22, marginBottom: 4 }}>{title}</h1>{c}</Shell>;
  const items = await M.compliance(cid);
  if (!items) return shell("Compliance monitor", <div className="card">{M.MON_HINT}</div>);
  const people = await prisma.user.findMany({ where: { isActive: true, OR: [{ id: cid }, { managedById: cid }, { managedBy: { managedById: cid } }] }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 400 });
  const slipping = items.filter((i) => i.slipping).length;
  return shell("Compliance monitor", <>
    <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}><b>{items.filter((i) => i.status === "MET").length} met · {items.filter((i) => i.status !== "MET").length} open · <span style={{ color: slipping ? "#B3261E" : undefined }}>{slipping} slipping</span></b>
      <SeedCompliance bodies={["NCEAC", "NBEAC", "PEC", "HEC"]} /></div>
    <div className="card"><b>Add a requirement</b> (e.g. a QEC or HEC item not in the council lists)<AddCompliance /></div>
    <div className="card" style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12 }}><thead><tr><th>Body</th><th>Code</th><th>Requirement</th><th>Owner</th><th>Due</th><th>Status</th><th>Evidence</th><th>Improvement</th></tr></thead>
      <tbody>{items.map((i) => <tr key={i.id} style={{ background: i.slipping ? "rgba(179,38,30,.06)" : undefined }}><td>{i.body}</td><td>{i.code}</td><td>{i.title}{i.slipping && <b style={{ color: "#B3261E" }}> · slipping</b>}</td>
        <ComplianceRow item={{ id: i.id, ownerId: i.ownerId, dueDate: i.dueDate ? i.dueDate.toISOString().slice(0, 10) : null, status: i.status, evidenceUrl: i.evidenceUrl, improvement: i.improvement }} people={people} /></tr>)}</tbody></table>
      {!items.length && <p className="small-note">Start with a council&apos;s standards above, then add HEC and QEC items.</p>}</div>
  </>);
}
