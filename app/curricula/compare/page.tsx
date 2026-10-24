import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { compareCurricula, LIB_ROLES, libraryScope } from "../../../lib/curriculumLibraryData";
import { canUseCurriculum } from "../../../lib/curriculumLibrary";
import { prisma } from "../../../lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compare curricula" };

const COL: Record<string, string> = { Added: "#2E7D32", Removed: "#C62828", Same: "#8C9399" };

export default async function Compare({ searchParams }: { searchParams: { a?: string; b?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!LIB_ROLES.includes(user.role) && !(user.extraRoles || []).includes("CURRICULUM_BUILDER")) redirect("/home");
  const sc = await libraryScope(user);
  for (const id of [searchParams.a, searchParams.b]) { const c = id ? await prisma.masterCurriculum.findUnique({ where: { id }, select: { id: true, chairmanId: true } }) : null; if (!c || (!sc.superUser && !(await canUseCurriculum(c, sc.chairmanId)))) redirect("/curricula"); }
  const r = await compareCurricula(searchParams.a!, searchParams.b!);
  if (!r) redirect("/curricula");
  const n = (k: string) => r.rows.filter((x) => x.change === k).length;
  // Two versions of one curriculum: added / removed. Two different curricula (PU vs HEC 2025): a mapping.
  const la = `${r.A.authority} ${r.A.version}`, lb = `${r.B.authority} ${r.B.version}`;
  const word = (c: string) => (r.sameLine ? c : c === "Added" ? `Only in ${lb}` : c === "Removed" ? `Only in ${la}` : c === "Same" ? "Same course" : c.replace("equivalent", "equivalent course"));
  return (
    <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p className="small-note" style={{ margin: 0 }}><Link href="/curricula">← Curriculum Library</Link></p>
      <h1 style={{ fontSize: 22, margin: "4px 0" }}>{r.A.title} {r.A.version} → {r.B.title} {r.B.version}</h1>
      <div className="card" style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14 }}>
        <span><b style={{ color: COL.Added }}>{n("Added")}</b> {r.sameLine ? "added" : `only in ${lb}`}</span><span><b style={{ color: COL.Removed }}>{n("Removed")}</b> {r.sameLine ? "removed" : `only in ${la}`}</span>
        <span><b>{r.rows.filter((x) => !["Added", "Removed", "Same"].includes(x.change)).length}</b> changed</span><span>{n("Same")} the same</span>{!r.sameLine && <span>{r.rows.filter((x) => x.a && x.b).length} mapped</span>}
        <span>Credit hours {r.totals.a} → <b>{r.totals.b}</b></span>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 12.5 }}><thead><tr>{r.sameLine ? <th>Course</th> : <><th>{la}</th><th>{lb}</th></>}<th>{r.sameLine ? r.A.version : `${la} CH · sem`}</th><th>{r.sameLine ? r.B.version : `${lb} CH · sem`}</th><th>{r.sameLine ? "Change" : "Mapping"}</th></tr></thead>
          <tbody>{r.rows.map((x, i) => <tr key={i}>{r.sameLine ? <td><b>{x.code}</b> {x.title}</td> : <><td>{x.a ? <><b>{x.a.code}</b> {x.a.title}</> : "—"}</td><td>{x.b ? <><b>{x.b.code}</b> {x.b.title}</> : "—"}</td></>}<td>{x.a ? `${x.a.ch} CH · sem ${x.a.sem ?? "—"}` : "—"}</td><td>{x.b ? `${x.b.ch} CH · sem ${x.b.sem ?? "—"}` : "—"}</td><td style={{ color: COL[x.change] || "#B26A00", fontWeight: x.change === "Same" ? 400 : 700 }}>{word(x.change)}</td></tr>)}</tbody></table>
      </div>
    </Shell>
  );
}
