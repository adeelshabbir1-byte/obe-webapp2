import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { WATCHERS, teamOf, standingOf, dayKey, type Standing } from "../../lib/inactivity";
import { InactivityPolicyForm, CheckNow } from "../../components/InactivityControls";

export const dynamic = "force-dynamic";

const STATE: Record<Standing["state"], { label: string; cls: string }> = {
  OVER: { label: "Over the limit", cls: "badge-no" },
  OK: { label: "Active", cls: "badge-ok" },
  ON_LEAVE: { label: "On approved leave today", cls: "badge-neutral" },
  LONG_LEAVE: { label: "On semester leave", cls: "badge-neutral" },
  EXEMPT: { label: "Left out of the watch", cls: "badge-neutral" },
};
const ORDER: Standing["state"][] = ["OVER", "OK", "ON_LEAVE", "LONG_LEAVE", "EXEMPT"];

export default async function InactivityPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!WATCHERS.includes(user.role)) redirect("/dashboard");
  const chairmanId = await chairmanIdFor(user);
  const isHead = user.role === "CHAIRMAN";
  const members = chairmanId ? await teamOf(user, chairmanId, true) : [];
  const direct = new Set(isHead ? members.filter((m) => m.managedById === user.id).map((m) => m.id) : members.map((m) => m.id));
  const { policy, rows } = chairmanId ? await standingOf(members, chairmanId, user.id) : { policy: null, rows: [] as Standing[] };
  rows.sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || b.days - a.days || a.name.localeCompare(b.name));
  const over = rows.filter((r) => r.state === "OVER");
  const today = dayKey(new Date());

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Sign-in Watch</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        Deadline reminders only help if people open the app. When someone on your team hasn&apos;t signed in for your limit of working days,
        you get a notification (and an email when email is set up), and so do they — once per absence. Weekly days off, holidays and breaks in the
        academic calendar, approved short leave and semester leave are not counted. The check runs every morning.
      </p>
      {!chairmanId && <div className="err">No institute on record for your account.</div>}
      {policy?.missing && <div className="err">The sign-in watch tables are not in the database yet — run prisma/migration_inactivity.sql in Supabase.</div>}

      {policy && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{isHead ? "Your limit and the institute default" : "Your limit"}</h3>
          {isHead && <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Your limit is also the default for every department Chairman and Program Lead who hasn&apos;t set their own. You are told about the people who report to you directly; the rest are reported to their own Chairman and Program Lead.</p>}
          <InactivityPolicyForm workingDays={policy.workingDays} ownSet={policy.ownSet} instituteDays={policy.instituteDays} offDays={policy.offDays} exemptIds={policy.exemptIds} people={members.map((m) => ({ id: m.id, name: m.name, role: roleLabel(m.role) }))} isHead={isHead} />
        </div>
      )}

      <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
        {[
          { l: "Over the limit", v: over.length, c: over.length ? "#B42318" : "#1F5E36" },
          { l: "Signed in today", v: rows.filter((r) => !r.never && dayKey(r.lastSeen) === today).length, c: "var(--text)" },
          { l: "Never signed in", v: rows.filter((r) => r.never).length, c: "var(--text)" },
          { l: "On leave", v: rows.filter((r) => r.state === "ON_LEAVE" || r.state === "LONG_LEAVE").length, c: "var(--text)" },
        ].map((s) => <div key={s.l} className="card" style={{ margin: 0, padding: "10px 14px" }}><div style={{ fontSize: 12, color: "var(--slate)" }}>{s.l}</div><div style={{ fontSize: 24, fontWeight: 700, color: s.c }}>{s.v}</div></div>)}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{isHead ? "Everyone in the institute" : "Your team"} ({rows.length})</h3>
          {policy && !policy.missing && policy.workingDays > 0 && <span style={{ marginLeft: "auto" }}><CheckNow /></span>}
        </div>
        {policy && policy.workingDays === 0 && <p style={{ fontSize: 12.5, color: "#7A5208", background: "#FFF8EC", padding: "6px 10px" }}>Your alerts are off. The list still shows who has been away.</p>}
        {rows.length === 0 ? <p style={{ color: "var(--slate)", margin: 0 }}>Nobody on your team yet.</p> : (
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Name</th><th>Role</th><th>Last signed in</th><th>Working days away</th><th>Open tasks</th><th>Status</th><th>Told you</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={r.state === "OVER" ? { background: "#FDF1F0" } : undefined}>
                  <td><b>{r.name}</b></td>
                  <td>{roleLabel(r.role)}</td>
                  <td>{r.never ? <span style={{ color: "#B42318" }}>never</span> : new Date(r.lastSeen).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" })}</td>
                  <td style={{ fontWeight: r.state === "OVER" ? 700 : 400 }}>{r.days}</td>
                  <td>{r.openTasks ? <>{r.openTasks}{r.overdue ? <span style={{ color: "#B42318" }}> ({r.overdue} overdue)</span> : null}</> : "—"}</td>
                  <td><span className={`badge ${STATE[r.state].cls}`}>{STATE[r.state].label}</span></td>
                  <td>{r.alertedAt ? new Date(r.alertedAt).toLocaleDateString("en-GB") : direct.has(r.id) ? "—" : <span style={{ color: "var(--slate)" }}>their own boss</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 0 }}>Days are counted from the day after the last visit up to yesterday. Someone on leave who isn&apos;t shown as such: ask them to apply for short leave, or record semester leave under Faculty Leave.</p>
      </div>
    </Shell>
  );
}
