import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { convenerView } from "../../../lib/omcConvener";
import { ActionForm } from "../../../components/fyp/FypClient";
import KeyButton from "../../../components/KeyButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "OMC Convener" };

// The department's OMC Convener: members, who is reviewing what, and sharing out the waiting course designs.
export default async function OmcConvenerPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { extraRoles: true, departmentId: true } });
  if (!(me?.extraRoles || []).includes("OMC_CONVENER")) redirect("/dashboard");
  const v = await convenerView({ ...user, departmentId: me?.departmentId }, await chairmanIdFor(user));
  const name = new Map((v?.members || []).map((m) => [m.id, m.name]));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>OMC Convener{v ? ` — ${v.department}` : ""}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Your department&apos;s OMC reviews only this department&apos;s courses (by subject home). Share the waiting course designs among the members; they review them in the <Link href="/omc/queue">OMC queue</Link>. Members are set on the organisation chart under your box.</p>
      {!v ? <div className="err">Your account has no department — ask the Institute Head to set it.</div> : (
        <>
          <div className="card">
            <b>Members ({v.members.length}):</b> {v.members.map((m) => `${m.name} (${v.courses.filter((c) => c.assignedOmcReviewerId === m.id).length} open)`).join(" · ") || "none yet"}
            <div style={{ marginTop: 8 }}><KeyButton url="/api/omc/convener" body={{ action: "share" }} label={`Share out ${v.courses.filter((c) => !c.assignedOmcReviewerId || !name.has(c.assignedOmcReviewerId)).length} unassigned review(s)`} /></div>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Course designs waiting ({v.courses.length})</h3>
            {v.courses.length === 0 ? <p className="small-note">Nothing waiting.</p> : (
              <table style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Program</th><th>Status</th><th>Reviewer</th></tr></thead>
                <tbody>{v.courses.map((c) => (
                  <tr key={c.id}><td><b>{c.code}</b> {c.title}</td><td className="small-note">{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : ""}</td><td>{c.templateStatus}</td>
                    <td><ActionForm url="/api/omc/convener" fixed={{ action: "assign", courseId: c.id }} submit="Set" initial={{ reviewerId: c.assignedOmcReviewerId || "" }} fields={[{ name: "reviewerId", label: "", type: "select", options: [["", name.get(c.assignedOmcReviewerId || "") ? "—" : "— unassigned —"], ...v.members.map((m) => [m.id, m.name] as [string, string])] }]} /></td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
