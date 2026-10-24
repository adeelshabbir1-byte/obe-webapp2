import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { ADMIN_NAV } from "../../../components/adminNav";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import { TEAM_HINT, ROLES, teams, people } from "../../../lib/platformTeam";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform Team" };

// The Super Admin's work split into a team: national curriculum teams per discipline area, and the other platform roles.
export default async function PlatformTeamPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "SUPER_USER") redirect("/dashboard");
  const shell = (x: React.ReactNode) => <Shell roleLabel="Super User" userName={user.name} navLinks={ADMIN_NAV}>{x}</Shell>;
  let ts: Awaited<ReturnType<typeof teams>>, ps: Awaited<ReturnType<typeof people>>;
  try { [ts, ps] = await Promise.all([teams(), people()]); } catch { return shell(<div className="err">{TEAM_HINT}</div>); }
  const opts = ps.filter((p) => p.isActive).map((p) => [p.id, `${p.name}${p.organization ? ` — ${p.organization}` : ""}`] as [string, string]);
  return shell(<>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Platform Team</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Split your work. Each <b>national curriculum team</b> covers one discipline area: a <b>Convener</b> and <b>National Subject Experts</b>. The team builds that area&apos;s national curricula, within its councils and programs, and is its National Releases committee; the Convener publishes. Each <b>platform role</b> opens only its own admin pages. Rules-book versions, deleting institutes and restoring backups stay with you. People here are platform accounts (no institute) — create them under <Link href="/admin/master-experts">National Subject Experts</Link>. Every platform role needs two-factor sign-in.</p>

    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>National curriculum teams</h3>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}><ActionButton showMessage url="/api/admin/team" body={{ action: "starterTeams" }} label="Add the starter teams" className="btn btn-sm" />
        <ActionForm showMessage url="/api/admin/team" fixed={{ action: "team" }} submit="Create team" collapsed openLabel="+ New team"
          fields={[{ name: "name", label: "Area", placeholder: "e.g. Computing" }, { name: "councils", label: "Councils (comma separated, blank = all)", placeholder: "NCEAC, HEC", width: 220 }, { name: "programs", label: "Programs (blank = all)", placeholder: "BS CS, BS SE, BS AI, BS DS, BS Cyber Security", full: true }]} /></span>
      </div>
      {ts.length === 0 && <p className="small-note">No teams yet — e.g. Computing (NCEAC, HEC), Management Sciences (NBEAC, HEC), Engineering (PEC).</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12, marginTop: 10 }}>
        {ts.map((t) => (
          <div key={t.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ fontSize: 15 }}>{t.name}</b>
              <ActionButton showMessage url="/api/admin/team" body={{ action: "teamDelete", id: t.id }} label="Remove" className="btn btn-secondary btn-sm" confirmText={`Remove the ${t.name} team? Its people keep their accounts.`} /></div>
            <div className="small-note" style={{ margin: "2px 0 8px" }}>{t.councils.join(", ") || "all councils"} · {t.programs.join(", ") || "all programs"}</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
              {t.members.map((m) => <li key={m.userId} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "1px 7px", background: m.role === "CONVENER" ? "#0D2A4A" : "#EEF1F4", color: m.role === "CONVENER" ? "#fff" : "#334" }}>{m.role === "CONVENER" ? "Convener" : "National SE"}</span>
                <span style={{ fontSize: 13 }}>{m.user?.name || m.userId}</span>
                {m.role !== "CONVENER" && <ActionButton showMessage url="/api/admin/team" body={{ action: "member", teamId: t.id, userId: m.userId, role: "CONVENER" }} label="Make Convener" className="btn btn-secondary btn-sm" />}
                <ActionButton showMessage url="/api/admin/team" body={{ action: "member", teamId: t.id, userId: m.userId, role: null }} label="✕" className="btn btn-secondary btn-sm" confirmText={`Take ${m.user?.name} off the ${t.name} team?`} />
              </li>)}
              {!t.members.length && <li className="small-note">No one yet.</li>}
            </ul>
            {opts.length > 0 && <ActionForm showMessage url="/api/admin/team" fixed={{ action: "member", teamId: t.id }} submit="Add" collapsed openLabel="+ Add a person" initial={{ role: t.members.some((m) => m.role === "CONVENER") ? "MEMBER" : "CONVENER" }}
              fields={[{ name: "userId", label: "Person", type: "select", options: [["", "Choose…"], ...opts], width: 220 }, { name: "role", label: "As", type: "select", options: [["MEMBER", "National Subject Expert"], ["CONVENER", "Convener"]] }]} />}
            <ActionForm showMessage url="/api/admin/team" fixed={{ action: "team", id: t.id }} submit="Save" collapsed openLabel="Edit area / scope" initial={{ name: t.name, councils: t.councils.join(", "), programs: t.programs.join(", ") }}
              fields={[{ name: "name", label: "Area" }, { name: "councils", label: "Councils" }, { name: "programs", label: "Programs", full: true }]} />
          </div>
        ))}
      </div>
    </div>

    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ marginTop: 0 }}>Platform roles</h3>
      <p className="small-note" style={{ marginTop: 0 }}>{Object.values(ROLES).map((r) => <span key={r.label} style={{ display: "block" }}><b>{r.label}</b> — {r.does}</span>)}</p>
      {ps.length === 0 ? <p className="small-note">No platform accounts yet.</p> : <table style={{ fontSize: 12.5 }}>
        <thead><tr><th>Person</th><th>2FA</th>{Object.values(ROLES).map((r) => <th key={r.label} style={{ fontSize: 11 }}>{r.label}</th>)}</tr></thead>
        <tbody>{ps.map((p) => <tr key={p.id}><td>{p.name}<div className="small-note" style={{ margin: 0 }}>{p.email}</div></td><td style={{ color: p.mfaEnabled ? "#1F5E36" : "#B3261E" }}>{p.mfaEnabled ? "on" : "off"}</td>
          {(Object.keys(ROLES) as (keyof typeof ROLES)[]).map((k) => { const on = p.roles.includes(k); return <td key={k} style={{ textAlign: "center" }}>
            <ActionButton showMessage url="/api/admin/team" body={{ action: "role", userId: p.id, role: k, on: !on }} label={on ? "✓" : "—"} className={on ? "btn btn-sm" : "btn btn-secondary btn-sm"} /></td>; })}
        </tr>)}</tbody></table>}
    </div>
  </>);
}
