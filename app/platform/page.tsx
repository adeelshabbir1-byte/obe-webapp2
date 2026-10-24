import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { ROLES, rolesOf, teamScope, adminNavFor } from "../../lib/platformTeam";
import { ADMIN_NAV } from "../../components/adminNav";

const pageName = (h: string) => ADMIN_NAV.find((l) => l.href === h)?.label || ({ "/admin/analytics": "Platform Analytics", "/admin/migrations": "Migrations" } as Record<string, string>)[h] || h;

export const dynamic = "force-dynamic";
export const metadata = { title: "My Platform Roles" };

const CURRICULUM_LINKS: [string, string][] = [["/master-design", "My national courses (design CLOs, lecture plans …)"], ["/curricula/builder", "National Curriculum Builder"], ["/curricula", "National Curricula"], ["/national-bank", "National Releases (review Shared Courses, build releases)"], ["/regulations", "National Regulations"]];

// A platform team member's home: their teams and roles, and where each takes them.
export default async function PlatformHome() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role === "SUPER_USER") redirect("/admin/team");
  const [roles, scope] = await Promise.all([rolesOf(user.id), teamScope(user.id)]);
  if (!roles.length && !user.isPlatformExpert) redirect("/dashboard");
  return (
    <Shell roleLabel="Platform Team" userName={user.name} navLinks={await adminNavFor(user)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My platform roles</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>You work for the OBEHUB platform, not for one university. Each role opens only its own pages; anything sensitive still needs the Super Admin.</p>
      {scope && <div className="card">
        <h3 style={{ marginTop: 0 }}>{scope.convener ? "Convener" : "National Subject Expert"} — {scope.teams.join(", ")}</h3>
        <p className="small-note" style={{ marginTop: 0 }}>Scope: {scope.councils.join(", ") || "all councils"} · {scope.programs.join(", ") || "all programs"}. You build this area&apos;s national curricula and design its national courses; as its National Releases committee you review Shared Courses and choose the best into a national release{scope.convener ? " — and, as Convener, publish it" : " (the Convener publishes)"}.</p>
        <ul style={{ margin: 0 }}>{CURRICULUM_LINKS.map(([h, l]) => <li key={h}><Link href={h}>{l}</Link></li>)}</ul>
      </div>}
      {roles.filter((r) => r !== "CURRICULUM").map((r) => { const x = ROLES[r as keyof typeof ROLES]; return (
        <div key={r} className="card"><h3 style={{ marginTop: 0 }}>{x.label}</h3><p className="small-note" style={{ marginTop: 0 }}>{x.does}</p>
          <ul style={{ margin: 0 }}>{x.pages.map((p) => <li key={p}><Link href={p}>{pageName(p)}</Link></li>)}</ul></div>); })}
      {!roles.length && <div className="card">No platform role yet. <Link href="/master-design">Your national courses →</Link></div>}
    </Shell>
  );
}
