import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import * as M from "../../lib/workMonitor";
void prisma;
export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

// Queue item 20: every official report one click each, built from current data; each opening is kept with its date
// and who opened it.
export default async function ReportsCenter() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "OMC", "PROGRAM_COORDINATOR", "LAB_MANAGER"].includes(user.role)) redirect("/home");
  const cid = await chairmanIdFor(user as never);
  const shell = (title: string, c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22, marginBottom: 4 }}>{title}</h1>{c}</Shell>;
  const log = await M.reportLog(cid);
  const names = new Map((await prisma.user.findMany({ where: { id: { in: log.map((l) => l.byId || "").concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return shell("Reports", <>
    <p className="small-note" style={{ marginTop: 0 }}>Each report is built from today&apos;s data when you open it.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>{M.REPORTS.map((r) => <a key={r.kind} className="card" href={`/api/work-monitor?report=${r.kind}`} style={{ margin: 0, textDecoration: "none", color: "inherit" }}><b>{r.title}</b><div className="small-note">{r.who} · last {log.find((l) => l.kind === r.kind)?.at.toISOString().slice(0, 10) || "never"}</div></a>)}</div>
    <div className="card" style={{ marginTop: 12 }}><h3 style={{ marginTop: 0 }}>Versions</h3>{!log.length ? <p className="small-note">None yet.</p> : <table className="table" style={{ fontSize: 12.5 }}><tbody>{log.map((l, i) => <tr key={i}><td>{l.at.toISOString().slice(0, 16).replace("T", " ")}</td><td>{l.title}</td><td>{names.get(l.byId || "") || ""}</td></tr>)}</tbody></table>}</div>
  </>);
}
