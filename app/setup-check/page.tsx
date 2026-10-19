import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { ActionButton } from "../../components/fyp/FypClient";
import KeyButton from "../../components/KeyButton";
import { moduleSmoke, setupChecks } from "../../lib/setupCheck";
import { keysOf } from "../../lib/integrationKeys";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Setup check" };

// For the Institute Head: what is still to set up, a run of the main modules on the institute's own data (also the
// check to repeat after each release), and API keys for the campus management system.
export default async function SetupCheckPage({ searchParams }: { searchParams: { run?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role)) redirect("/dashboard");
  const chairmanId = await chairmanIdFor(user);
  const [checks, smoke, keys] = await Promise.all([setupChecks(chairmanId), searchParams.run ? moduleSmoke(chairmanId) : Promise.resolve(null), user.role === "CHAIRMAN" ? keysOf(chairmanId) : Promise.resolve([])]);
  const bad = checks.filter((c) => !c.ok).length;
  const areas = Array.from(new Set(checks.map((c) => c.area)));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Setup Check</h1>
      <p className="small-note">What this institute still has to set up, and a quick run of the main modules on your own data — run it after every update of OBEHUB too.</p>
      <div className="card" style={{ borderLeft: `4px solid ${bad ? "#c93c3c" : "#23894f"}` }}><b>{bad ? `${bad} thing${bad > 1 ? "s" : ""} to set up` : "Everything is set up"}</b></div>
      {areas.map((a) => (
        <div key={a} className="card"><b>{a}</b>
          <table style={{ fontSize: 13, marginTop: 6 }}><tbody>{checks.filter((c) => c.area === a).map((c) => (
            <tr key={c.label}><td style={{ width: 28, color: c.ok ? "#23894f" : "#c93c3c", fontWeight: 700 }}>{c.ok ? "✓" : "✗"}</td><td>{c.label}</td><td className="small-note">{c.detail}</td><td>{!c.ok && c.href ? <Link href={c.href} className="small-note">fix →</Link> : null}</td></tr>
          ))}</tbody></table>
        </div>
      ))}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><b>Module check</b><Link href="/setup-check?run=1" className="btn btn-secondary btn-sm">{smoke ? "Run again" : "Run the module check"}</Link></div>
        {smoke && <table style={{ fontSize: 13, marginTop: 6 }}><tbody>{smoke.map((m) => <tr key={m.module}><td style={{ width: 28, color: m.ok ? "#23894f" : "#c93c3c", fontWeight: 700 }}>{m.ok ? "✓" : "✗"}</td><td>{m.module}</td><td className="small-note">{m.detail}</td><td className="small-note">{m.ms} ms</td></tr>)}</tbody></table>}
      </div>
      {user.role === "CHAIRMAN" && (
        <div className="card">
          <b>Campus management system (API)</b>
          <p className="small-note">If your university has its own campus management system, it can send students, enrolments and marks to OBEHUB directly. Give its developers a key and this address: <code>/api/integration/v1/students</code>, <code>/enrolments</code>, <code>/marks</code> (POST) and <code>/courses</code> (GET), with the header <code>Authorization: Bearer &lt;key&gt;</code>.</p>
          {keys === null ? <p className="err">Run prisma/migration_platform_plus.sql first.</p> : <>
            {keys.map((k) => <div key={k.id} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>{k.label} · created {k.createdAt.toISOString().slice(0, 10)} · last used {k.lastUsedAt ? k.lastUsedAt.toISOString().slice(0, 10) : "never"} <ActionButton url="/api/setup-check" body={{ action: "revoke", id: k.id }} label="Revoke" className="btn btn-secondary btn-sm" confirmText="Revoke this key? The system using it stops working until given a new one." /></div>)}
            <div style={{ marginTop: 6 }}><KeyButton url="/api/setup-check" body={{ action: "key", label: "Campus management system" }} label="Create a key" /></div>
          </>}
        </div>
      )}
    </Shell>
  );
}
