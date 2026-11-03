import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { adminNavFor, memberProfile } from "../../../lib/platformTeam";
import PlatformProfileForm from "../../../components/PlatformProfileForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "My profile" };

// A platform team member's own profile (queue item 11): details and photo, their roles and teams, recent activity, and
// their own password and two-step sign-in.
export default async function PlatformProfilePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "SUPER_USER" && !(await prisma.user.findUnique({ where: { id: user.id }, select: { isPlatformExpert: true } }))?.isPlatformExpert) redirect("/dashboard");
  const [p, nav] = await Promise.all([memberProfile(user.id), adminNavFor(user as never)]);
  if (!p) redirect("/dashboard");
  return (
    <Shell roleLabel={user.role === "SUPER_USER" ? "Super Admin" : "Platform team"} userName={user.name} navLinks={nav}>
      <h1>My profile</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        <PlatformProfileForm initial={{ name: p.user.name, email: p.user.email, organization: p.user.organization || "", designation: p.profile.designation || "", phone: p.profile.phone || "", photo: p.profile.photo || null }} />
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Roles and teams</h3>
          {user.role === "SUPER_USER" ? <p>Super Admin — every platform page.</p> : <>
            <p style={{ fontSize: 13 }}>{p.roles.length ? p.roles.join(" · ") : "No role yet."}</p>
            {p.teams.length > 0 && <ul style={{ fontSize: 13 }}>{p.teams.map((t) => <li key={t.name}>{t.name} — {t.role}</li>)}</ul>}
          </>}
          <h3>Sign-in</h3>
          <p style={{ fontSize: 13 }}>Two-step sign-in: <b style={{ color: p.user.mfaEnabled ? "#1E6B3A" : "#B3261E" }}>{p.user.mfaEnabled ? "on" : "off"}</b></p>
          <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="btn btn-secondary btn-sm" href="/change-password">Change my password</Link><Link className="btn btn-secondary btn-sm" href="/settings/mfa">{p.user.mfaEnabled ? "Two-step sign-in settings" : "Turn on two-step sign-in"}</Link></p>
          <p className="small-note">Forgot your password? Use “Forgot password” on the sign-in page, or ask the Super Admin to reset it.</p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent activity</h3>
          {p.activity.length === 0 ? <p className="small-note">Nothing yet.</p> : <ul style={{ fontSize: 12.5, paddingLeft: 18 }}>{p.activity.map((a, i) => <li key={i}>{a.action.toLowerCase().replace(/_/g, " ")}{a.entityType ? ` · ${a.entityType}` : ""} <span className="small-note">{new Date(a.createdAt).toLocaleString("en-GB")}</span></li>)}</ul>}
        </div>
      </div>
    </Shell>
  );
}
