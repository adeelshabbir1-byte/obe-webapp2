import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import * as M from "../../lib/workMonitor";
void prisma;
export const dynamic = "force-dynamic";
export const metadata = { title: "Co-curricular activities report" };

// Queue item 20: the year's co-curricular activities by kind, with the online ones that ODL students can join too
// (ODL Part-I 2.k, Part-II 17.3).
export default async function ActivitiesReport({ searchParams }: { searchParams: { year?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "OMC", "PROGRAM_COORDINATOR", "LAB_MANAGER"].includes(user.role)) redirect("/home");
  const cid = await chairmanIdFor(user as never);
  const shell = (title: string, c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22, marginBottom: 4 }}>{title}</h1>{c}</Shell>;
  const year = Number(searchParams.year) || new Date().getUTCFullYear();
  const r = await M.activitiesReport(cid, year);
  return shell("Co-curricular activities report", <>
    <form className="small-note">Year <input name="year" type="number" defaultValue={year} style={{ width: 80 }} /> <button className="btn btn-sm btn-secondary">Show</button></form>
    <div className="card" style={{ display: "flex", gap: 18, fontSize: 14 }}><span><b>{r.events}</b> activities</span><span><b>{r.online}</b> online (open to ODL students)</span><span><b>{r.people}</b> participants</span></div>
    <div className="card"><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Kind</th><th>Activities</th><th>Online</th><th>Participants</th></tr></thead><tbody>{r.byCat.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v.n}</td><td>{v.online}</td><td>{v.people}</td></tr>)}</tbody></table>
      <p className="small-note">An activity counts as online when its venue says online, virtual, Zoom, Meet, Teams or webinar. ODL students should have the same opportunities as students on campus (ODL Part-II 17.3).</p></div>
  </>);
}
