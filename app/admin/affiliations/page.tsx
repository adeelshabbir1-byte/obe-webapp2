import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import { ldb, LIB_HINT } from "../../../lib/curriculumLibrary";
import { adminCan, adminNavFor } from "../../../lib/platformTeam";

export const dynamic = "force-dynamic";
export const metadata = { title: "Affiliated colleges" };

// Super User: which institutes are colleges affiliated to which university (each college keeps its own account).
export default async function Affiliations() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!(await adminCan(user, "ONBOARDING"))) redirect("/dashboard");
  const adminNav = await adminNavFor(user);
  const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN" }, select: { id: true, name: true, instituteName: true }, orderBy: { instituteName: "asc" } });
  const nm = new Map(heads.map((h) => [h.id, h.instituteName || h.name]));
  const rows = (await ldb.instituteAffiliation.findMany({ orderBy: { createdAt: "desc" } }).catch(() => null)) as { collegeId: string; universityId: string; status: string; since: Date | null; note: string | null }[] | null;
  const opts = heads.map((h) => [h.id, h.instituteName || h.name] as [string, string]);
  const byUni = new Map<string, typeof rows>();
  for (const r of rows || []) byUni.set(r.universityId, (byUni.get(r.universityId) || []).concat(r));
  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={adminNav}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Affiliated colleges</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Each college is registered as its own institute (its own Institute Head, people, students and results) and linked here to its affiliating university. The college then sees the university&apos;s own curricula and must follow them: the scheme of studies, GAs and CLOs are locked for it, and a new version the university makes effective (e.g. from Fall 2027) applies to the college&apos;s batches from that term.</p>
      {!rows ? <div className="err">{LIB_HINT}</div> : <>
        <div className="card"><ActionForm url="/api/curricula-library" fixed={{ action: "affiliate" }} submit="Link" fields={[{ name: "collegeId", label: "College", type: "select", options: [["", "—"], ...opts] }, { name: "universityId", label: "Affiliated to university", type: "select", options: [["", "—"], ...opts] }, { name: "note", label: "Note (affiliation no., programs)" }]} /></div>
        {Array.from(byUni.entries()).map(([u, xs]) => (
          <div key={u} className="card"><h3 style={{ marginTop: 0 }}>{nm.get(u) || "University"} <span className="small-note">{xs!.length} college(s)</span></h3>
            <table style={{ fontSize: 13 }}><tbody>{xs!.map((r) => <tr key={r.collegeId}><td>{nm.get(r.collegeId) || r.collegeId}</td><td className="small-note">{r.status.toLowerCase()}{r.since ? ` since ${r.since.toISOString().slice(0, 10)}` : ""}{r.note ? ` · ${r.note}` : ""}</td><td><ActionButton url="/api/curricula-library" body={{ action: "affiliate", collegeId: r.collegeId, universityId: null }} label="End" className="btn btn-secondary btn-sm" confirmText="End this affiliation?" /></td></tr>)}</tbody></table></div>
        ))}
        {!rows.length && <div className="card small-note">No affiliations yet.</div>}
      </>}
    </Shell>
  );
}
