import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";

export const dynamic = "force-dynamic";

// Download a role handbook (Adeel prompt §16) — built fresh from the page help each time, so new pages are included.
const ROLES = ["SUBJECT_EXPERT", "INSTRUCTOR", "LAB_ENGINEER", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "OMC", "HEAD_OF_DEPARTMENT", "DEAN", "CHAIRMAN", "COURSE_ASSIGNER", "STUDENT_AFFAIRS"];
export default async function HandbookPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const leader = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role);
  const list = leader ? ROLES : [user.role, (user as { secondaryRole?: string }).secondaryRole].filter((x): x is string => !!x);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Role handbook</h1>
      <p className="small-note">A PDF of every page in the role&apos;s menu — what it is for, who uses it and the steps — made fresh when you download it, with the institute&apos;s name and logo.</p>
      <div className="card">{list.map((r) => <p key={r}><a className="btn btn-sm" href={`/api/handbook?role=${r}`}>Download {roleLabel(r)} handbook (PDF)</a></p>)}</div>
    </Shell>
  );
}
