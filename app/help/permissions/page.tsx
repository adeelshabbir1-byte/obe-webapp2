import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { CAPABILITIES, PSEUDO_ROLES } from "../../../lib/help/permissions";
import { CATEGORIES } from "../../../lib/help/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Who can do what" };

const label = (r: string) => PSEUDO_ROLES[r] || roleLabel(r);
// A teacher, an OMC member and so on can only use the pages of the roles they hold; FYP Head is a duty within a department.
const holds = (cap: (typeof CAPABILITIES)[number], role: string) => cap.roles.includes(role) || cap.roles.includes("SELF") || (role === "SUBJECT_EXPERT" && cap.roles.includes("COURSE_SE"));

export default async function PermissionsPage({ searchParams }: { searchParams: { role?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const allRoles = Array.from(new Set(CAPABILITIES.flatMap((c) => c.roles))).filter((r) => !(r in PSEUDO_ROLES)).sort((a, b) => label(a).localeCompare(label(b)));
  const role = searchParams.role && allRoles.includes(searchParams.role) ? searchParams.role : "";
  const shown = CAPABILITIES.filter((c) => !role || holds(c, role));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Who can do what</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 860 }}>
            The permissions the system enforces, with the page where each is done. Someone holding several roles can do what each role allows, after switching to it.
            This list is checked against the code, so it stays true as the system changes.
          </p>
        </div>
        <Link href="/help" className="btn btn-secondary btn-sm">Help center</Link>
      </div>
      <form className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor="perm-role" style={{ fontSize: 13 }}>Show what this role can do:</label>
        <select id="perm-role" name="role" defaultValue={role} style={{ padding: "6px 8px" }}>
          <option value="">Every role</option>
          {allRoles.map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </select>
        <button className="btn btn-brass btn-sm">Show</button>
        {role && <Link href="/help/permissions" className="small-note">Clear</Link>}
        {!role && allRoles.includes(user.role) && <Link href={`/help/permissions?role=${user.role}`} className="small-note">Only mine ({roleLabel(user.role)})</Link>}
      </form>
      {CATEGORIES.map((cat) => {
        const rows = shown.filter((c) => c.category === cat.key);
        if (!rows.length) return null;
        return (
          <div key={cat.key} className="card">
            <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>{cat.label}</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ fontSize: 13 }}>
                <thead><tr><th style={{ width: "36%" }}>Task</th><th>Who can do it</th><th>Where</th></tr></thead>
                <tbody>{rows.map((c) => (
                  <tr key={c.key}>
                    <td>{c.article ? <Link href={`/help?a=${c.article}`}>{c.task}</Link> : c.task}</td>
                    <td><b>{c.roles.map(label).join(", ")}</b>{c.scope && <div className="small-note">{c.scope}</div>}</td>
                    <td>{c.where ? <Link href={c.where.href}>{c.where.label}</Link> : "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        );
      })}
      {!shown.length && <div className="card"><p className="small-note" style={{ margin: 0 }}>Nothing listed for that role.</p></div>}
    </Shell>
  );
}
