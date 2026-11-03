import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { rolloverPreview, ROLL_ROLES } from "../../lib/rollover";
import RolloverButton from "../../components/RolloverButton";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Term rollover" };

export default async function TermRolloverPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!ROLL_ROLES.includes(user.role)) redirect("/home");
  const p = await rolloverPreview(user as never);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Term rollover</h1>
      <p className="small-note">Every course that has no plan yet gets the plan of the latest offering of the same course (same program first): CLOs and GA mapping, lecture plan, assessments and question plan. The question bank, learning resources and notes for the next teacher are kept per course and carry over by themselves. Courses with marks or attendance are never touched. The Subject Expert can still change anything afterwards.</p>
      {p.pairs.length === 0 ? <div className="card"><p>Nothing to roll over: every course has a plan already{p.noSource ? `, or ${p.noSource} course(s) have no earlier offering to copy from` : ""}.</p></div> : <>
        <RolloverButton n={p.pairs.length} />
        <div className="card" style={{ overflowX: "auto" }}><table style={{ fontSize: 13 }}><thead><tr><th>Course to fill</th><th>Copied from</th></tr></thead>
          <tbody>{p.pairs.map((x) => <tr key={x.targetId}><td>{x.target}</td><td>{x.source}</td></tr>)}</tbody></table></div>
      </>}
      {p.skipped.length > 0 && <div className="card"><b>Left alone</b><ul style={{ fontSize: 13 }}>{p.skipped.map((s) => <li key={s}>{s}</li>)}</ul></div>}
      {p.noSource > 0 && <p className="small-note">{p.noSource} course(s) without a plan have no earlier offering — their Subject Experts plan them from the master curriculum.</p>}
    </Shell>
  );
}
