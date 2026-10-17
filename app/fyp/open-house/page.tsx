import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { fypAccess } from "../../../lib/fyp";
import { ActionForm } from "../../../components/fyp/FypClient";
import PrintButton from "../../../components/PrintButton";

export const dynamic = "force-dynamic";

// FYP open house: stalls for every group (printable floor list), who is visiting what, and the industry contacts list.
export default async function OpenHousePage({ searchParams }: { searchParams: { cycle?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const acc = await fypAccess(user);
  const cycles = (await prisma.fypCycle.findMany({ where: { chairmanId: acc.chairmanId }, orderBy: { createdAt: "desc" } })).filter((c) => acc.manages(c.departmentId) || acc.chairs(c.departmentId));
  if (!cycles.length) redirect("/fyp");
  const cycle = cycles.find((c) => c.id === searchParams.cycle) || cycles[0];
  const manages = acc.manages(cycle.departmentId);
  const fdb = prisma as unknown as Record<string, any>;
  const groups = await prisma.fypGroup.findMany({ where: { cycleId: cycle.id, status: { in: ["ACTIVE", "COMPLETED"] } }, orderBy: { name: "asc" } });
  const props = await prisma.fypProposal.findMany({ where: { id: { in: groups.map((g) => g.proposalId).filter((x): x is string => !!x).concat(["none"]) } }, select: { id: true, title: true, domain: true } });
  const externals = await prisma.fypExternal.findMany({ where: { chairmanId: acc.chairmanId }, orderBy: { createdAt: "desc" } });
  const picks = (await fdb.fypShowcasePick.findMany({ where: { groupId: { in: groups.map((g) => g.id) } } }).catch(() => [])) as { externalId: string; groupId: string }[];
  const scored = await prisma.fypEvaluation.findMany({ where: { evaluatorKey: { startsWith: "ext:" } }, select: { evaluatorKey: true, groupId: true } });
  const stall = (g: unknown) => (g as { stall?: string | null }).stall || "";
  const sorted = [...groups].sort((a, b) => stall(a).localeCompare(stall(b), undefined, { numeric: true }) || a.name.localeCompare(b.name));
  const cyclesOf = new Map<string, Set<string>>();
  for (const x of externals) { const k = `${x.email || x.name}`.toLowerCase(); cyclesOf.set(k, new Set([...(cyclesOf.get(k) || []), x.cycleId])); }
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div className="no-print"><Link href="/fyp/manage" style={{ fontSize: 13 }}>← FYP</Link></div>
      <h1 style={{ fontSize: 22, margin: "4px 0" }}>Open House — {cycle.title}</h1>
      <form className="no-print" style={{ marginBottom: 10 }}><select name="cycle" defaultValue={cycle.id}>{cycles.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select> <button className="btn btn-secondary btn-sm">Show</button> <Link href={`/fyp/yearbook?cycle=${cycle.id}`} className="btn btn-secondary btn-sm">FYP yearbook</Link></form>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Stalls (floor list)</h3>
        <p className="small-note no-print" style={{ marginTop: 0 }}>Give each group a stall or room, e.g. &quot;A-01&quot;. External evaluators see their chosen projects in stall order, so they can walk the shortest way.</p>
        <table><thead><tr><th>Stall</th><th>Project</th><th>Category</th><th>Visitors</th></tr></thead>
          <tbody>{sorted.map((g) => { const p = props.find((x) => x.id === g.proposalId); return (
            <tr key={g.id}><td>{manages ? <ActionForm url="/api/fyp/faculty" fixed={{ action: "setStall", groupId: g.id }} submit="✓" initial={{ stall: stall(g) }} fields={[{ name: "stall", label: "", width: 80 }]} /> : stall(g) || "—"}</td>
              <td><b>{p?.title || g.name}</b><div className="small-note">{g.name}</div></td><td>{p?.domain || "—"}</td>
              <td className="small-note">{picks.filter((x) => x.groupId === g.id).map((x) => externals.find((e) => e.id === x.externalId)?.name).filter(Boolean).join(", ") || "—"}</td></tr>); })}</tbody></table>
        <div className="no-print"><PrintButton label="Print floor list" /></div>
      </div>
      <div className="card no-print">
        <h3 style={{ marginTop: 0 }}>Industry contacts</h3>
        <p className="small-note" style={{ marginTop: 0 }}>Every external evaluator so far — reuse them for internships, the advisory board, and alumni / employer surveys.</p>
        <table><thead><tr><th>Name</th><th>Organisation</th><th>Expertise</th><th>Email</th><th>FYP cycles</th><th>Projects evaluated</th></tr></thead>
          <tbody>{Array.from(new Map(externals.map((x) => [`${x.email || x.name}`.toLowerCase(), x])).values()).map((x) => {
            const ids = externals.filter((e) => `${e.email || e.name}`.toLowerCase() === `${x.email || x.name}`.toLowerCase()).map((e) => `ext:${e.id}`);
            return <tr key={x.id}><td>{x.name}<div className="small-note">{x.designation || ""}</div></td><td>{x.organization || "—"}</td><td className="small-note">{x.expertise || "—"}</td><td className="small-note">{x.email || "—"}</td><td>{cyclesOf.get(`${x.email || x.name}`.toLowerCase())?.size || 1}</td><td>{new Set(scored.filter((s) => ids.includes(s.evaluatorKey)).map((s) => s.groupId)).size}</td></tr>;
          })}</tbody></table>
      </div>
    </Shell>
  );
}
