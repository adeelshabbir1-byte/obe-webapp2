import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../lib/reportScope";
import { dataQuality } from "../../lib/dataQuality";

export const dynamic = "force-dynamic";

// Data quality (Adeel prompt §9): each problem with a count, examples and a Fix link. Program Leads see their program.
const ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"];
export default async function DataQualityPage({ searchParams }: { searchParams: { fresh?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!ROLES.includes(user.role)) redirect("/dashboard");
  const cid = await chairmanIdFor(user as never);
  const list = await dataQuality({ chairmanId: cid, plId: user.role === "PROGRAM_COORDINATOR" ? user.id : null }, searchParams.fresh === "1");
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Data quality</h1>
      <p className="small-note">Problems in {user.role === "PROGRAM_COORDINATOR" ? "your program's" : "the institute's"} data, each with a Fix link. Checked every night and when you open this page (results kept 10 minutes). <Link href="/data-quality?fresh=1">Check again now</Link></p>
      {list.length === 0 ? <div className="card"><p>No problems found ✓</p></div> : list.map((p) => (
        <div className="card" key={p.key} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{p.label}</b><span style={{ background: "#FBE9E7", color: "#B3261E", borderRadius: 8, padding: "0 8px", fontWeight: 700 }}>{p.count}</span></div>
          <div className="small-note">{p.fix}</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>{p.samples.map((s, i) => <li key={i}>{s.text} — <Link href={s.href}>Fix →</Link></li>)}</ul>
        </div>
      ))}
    </Shell>
  );
}
