import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { staffOf } from "../../lib/registers";
import { ActionForm } from "../../components/fyp/FypClient";
import { CMT_HINT, TYPES, committeesFor } from "../../lib/committeeEngine";
import { omcOf } from "../../lib/omcMembers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Boards & committees" };

// Decision bodies on one engine: the Board of Studies (per institute or department, Convener-only or full committee),
// the OMC (its own rules, as before), and later the Faculty Board and the Academic Council.
export default async function Boards() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user as never).catch(() => "");
  let missing = false;
  const list = await committeesFor(chairmanId, user).catch(() => { missing = true; return []; });
  const [staff, departments, faculties] = await Promise.all([staffOf(chairmanId), prisma.department.findMany({ where: { chairmanId }, select: { id: true, name: true }, orderBy: { name: "asc" } }), (prisma as unknown as Record<string, any>).faculty?.findMany({ where: { chairmanId }, select: { id: true, name: true } }).catch(() => []) ?? []]);
  const omcs = await Promise.all(departments.map(async (d) => ({ d, omc: await omcOf(chairmanId, d.id) })));
  const myIds = new Set(((await (prisma as unknown as Record<string, any>).cmtMember?.findMany({ where: { userId: user.id }, select: { committeeId: true } }).catch(() => [])) || []).map((m: { committeeId: string }) => m.committeeId));
  const mineList = list.filter((c) => myIds.has(c.id) || c.convenerId === user.id);
  const canCreate = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role);
  const scopeName = (c: { scope: string; scopeId: string | null }) => c.scope === "DEPARTMENT" ? departments.find((d) => d.id === c.scopeId)?.name || "department" : c.scope === "FACULTY" ? (faculties as { id: string; name: string }[]).find((f) => f.id === c.scopeId)?.name || "faculty" : "institute";

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Boards &amp; committees</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>One engine for decision bodies: members (with external experts on a guest link that shows only their committee&apos;s items), meetings and attendance, agenda items with votes (approve / approve with changes / reject), quorum and majority, the Convener&apos;s decision, minutes as a PDF and the signed copy. A Board of Studies can instead run Convener-only: the Convener records each decision with the meeting date and the signed minutes.</p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{CMT_HINT}</p></div>}
      {mineList.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginBottom: 12 }}>{mineList.map((c) => <Link key={c.id} href={`/boards/${c.id}`} className="card" style={{ margin: 0, textDecoration: "none", color: "inherit", borderTop: "3px solid #1B5FAA" }}><div className="small-note">My committee · {TYPES[c.type]}</div><b>{c.name}</b><div className="small-note">{c.convenerId === user.id ? "You are the Convener" : "Member"}</div></Link>)}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", fontSize: 13 }}>
          <thead><tr><th>Committee</th><th>Scope</th><th>Mode</th><th>Rules</th></tr></thead>
          <tbody>
            {list.map((c) => <tr key={c.id}><td><Link href={`/boards/${c.id}`}><b>{c.name}</b></Link><div className="small-note">{TYPES[c.type]}</div></td><td>{scopeName(c)}</td><td>{c.mode === "FULL" ? "Full committee" : "Convener only"}</td><td className="small-note">{c.mode === "FULL" ? `Quorum ${c.quorumPct}% · majority over ${c.majorityPct}% · Convener finalises` : "Convener records decisions with signed minutes"}{c.councilStep ? " · then Academic Council" : ""}</td></tr>)}
            {omcs.filter((o) => o.omc.members.length).map((o) => <tr key={`omc-${o.d.id}`}><td><Link href="/omc/queue"><b>OMC — {o.d.name}</b></Link><div className="small-note">OMC (on the engine, rules unchanged)</div></td><td>{o.d.name}</td><td>Full committee</td><td className="small-note">Requests: 2 approvals (or a panel&apos;s 2 of 3) · batches and plans: more than half of {o.omc.members.length} members · Convener {o.omc.convenerName || "—"}</td></tr>)}
            {!list.length && !omcs.some((o) => o.omc.members.length) && <tr><td colSpan={4} className="small-note">No committee yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {canCreate && <p style={{ marginTop: 10 }}><Link className="btn btn-sm" href="/boards/new">+ New committee (step by step)</Link></p>}
    </Shell>
  );
}
