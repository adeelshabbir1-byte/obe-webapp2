import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { adminNavFor } from "../../../lib/platformTeam";
import { reviewCandidates } from "../../../lib/workflowGaps";
import { ReviewAct } from "../../../components/WorkflowForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "National review" };

// Queue item 19 (CQI loop 6): course packages adopted by several universities go to HEC's curriculum review
// committee; its decision is recorded and the author is told. Accepted packages are then taken into the national
// curriculum through the National Curriculum Builder.
export default async function NationalReviewPage({ searchParams }: { searchParams: { min?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "SUPER_USER") redirect("/home");
  const min = Math.max(1, Number(searchParams.min) || 3);
  const { pcs, reviews } = await reviewCandidates(min);
  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={await adminNavFor(user)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>National review of adopted courses</h1>
      <form className="small-note">Shared courses adopted by at least <input name="min" type="number" min={1} defaultValue={min} style={{ width: 50 }} /> universities <button className="btn btn-sm btn-secondary">Show</button></form>
      {reviews === null ? <div className="card">Run prisma/migration_adeel_p13.sql first.</div> :
        <div className="card" style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>From</th><th>Adopted by</th><th>Review</th><th /></tr></thead>
          <tbody>{pcs.map((p) => { const r = reviews.find((x) => x.refId === p.id); return <tr key={p.id}><td>{p.code} {p.title} (v{p.version})</td><td>{p.instituteName || "—"}</td><td>{p.importCount}</td><td>{r ? `${r.status.toLowerCase()}${r.decision ? `: ${r.decision}` : ""}` : "—"}</td><td>{(!r || r.status === "OPEN") && <ReviewAct id={p.id} open={!!r} />}</td></tr>; })}</tbody></table>
          {!pcs.length && <p className="small-note">No shared course has that many adoptions yet.</p>}</div>}
    </Shell>
  );
}
