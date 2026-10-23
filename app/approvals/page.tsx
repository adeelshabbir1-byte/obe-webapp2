import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs, staffOf } from "../../lib/registers";
import { inboxFor, settingsOf, settingFor } from "../../lib/approvals/inbox";
import { allProviders } from "../../lib/approvals/registry";
import { delegationsOf } from "../../lib/approvals/delegation";
import ApprovalsInbox, { type InboxRow } from "../../components/ApprovalsInbox";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const day = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// My approvals: everything waiting for the signed-in person, from every module, in one list.
export default async function ApprovalsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role === "STUDENT" || user.role === "SUPER_USER") redirect("/dashboard");
  const w = await whoIs(user as never);
  const box = await inboxFor(user as never);
  const [staff, dels, st] = w ? await Promise.all([staffOf(w.chairmanId), delegationsOf(w.chairmanId, w.head ? undefined : user.id), settingsOf(w.chairmanId)]) : [[], null, new Map()];
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const rows: InboxRow[] = box.items.map((i) => ({ ...i, since: new Date(i.since).toISOString(), due: i.due ? new Date(i.due).toISOString() : null }));
  const late = rows.filter((r) => r.overdue).length;
  const providers = allProviders();

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Approvals</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>
        Everything waiting for your decision, from every part of the system. <b style={{ color: rows.length ? "#7A1F2B" : "#1E6B3A" }}>{rows.length} waiting</b>{late ? <> · <b style={{ color: "#B3261E" }}>{late} overdue</b></> : null}.
      </p>
      {box.acting.length > 0 && (
        <div className="card" style={{ background: "#FFF1D6", borderColor: "#E0B54A", marginBottom: 10 }}>
          <b>You are acting for {box.acting.map((a) => `${a.name} (until ${day(a.until)})`).join(", ")}.</b> Their items are marked “on behalf of”; every decision you take is recorded with both names.
        </div>
      )}
      {box.failed.length > 0 && <p className="small-note" style={{ color: "#9A3412" }}>Could not read: {box.failed.join(", ")} (a migration may not be run yet).</p>}
      <HowCalculated shows="What is listed here and how overdue is worked out.">
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
          <li>Each module decides who should act, using the institute&apos;s positions (covering, acting and delegated holders included) — the same rule as on the module&apos;s own page.</li>
          <li>Approve / Return here does exactly what the module&apos;s own buttons do: its checks, audit log and notices all run. Some items (vetting checklists, choosing courses for a registration hold) need the module page — use Open.</li>
          <li>Overdue = past its due date, or waiting longer than the escalation days set for its kind (default {7}). A reminder goes after the reminder days (default 3); after the escalation days the position above is told. A digest of what is waiting comes once a day.</li>
        </ul>
      </HowCalculated>
      <ApprovalsInbox rows={rows} />

      <h2 style={{ fontSize: 17, margin: "22px 0 6px" }}>Hand over my approvals while I am away</h2>
      <div className="card">
        <p className="small-note" style={{ marginTop: 0 }}>Choose a colleague and the dates. During those dates they see your items and can decide them for you; every decision shows it was taken on your behalf.</p>
        {dels === null ? <p className="small-note" style={{ color: "#B3261E" }}>Run prisma/migration_approvals_inbox.sql in Supabase to use delegation.</p> : (
          <>
            {dels.length > 0 && (
              <table className="table" style={{ fontSize: 13, marginBottom: 8 }}>
                <thead><tr><th>From</th><th>To</th><th>Dates</th><th>Note</th><th></th></tr></thead>
                <tbody>{dels.map((d) => (
                  <tr key={d.id}><td>{nameOf.get(d.fromUserId) || "—"}</td><td>{nameOf.get(d.toUserId) || "—"}</td><td>{day(d.startDate)} – {day(d.endDate)}</td><td>{d.note || ""}</td>
                    <td><ActionButton url="/api/approvals" body={{ action: "revoke", id: d.id }} label="End now" className="btn btn-secondary btn-sm" confirmText="End this delegation now?" /></td></tr>
                ))}</tbody>
              </table>
            )}
            <ActionForm url="/api/approvals" fixed={{ action: "delegate" }} collapsed openLabel="Hand over my approvals…" submit="Save hand-over" done="Saved — your colleague has been told."
              fields={[
                ...(w?.head ? [{ name: "fromUserId", label: "Whose approvals (leave empty for your own)", type: "select" as const, options: [["", "My own"] as [string, string], ...staff.filter((s) => s.id !== user.id).map((s) => [s.id, s.name] as [string, string])] }] : []),
                { name: "toUserId", label: "Hand over to", type: "select" as const, options: staff.filter((s) => s.id !== user.id).map((s) => [s.id, s.name] as [string, string]) },
                { name: "startDate", label: "First day", type: "date" as const },
                { name: "endDate", label: "Last day", type: "date" as const },
                { name: "note", label: "Note (optional)", type: "text" as const },
              ]} />
          </>
        )}
      </div>

      {w?.head && (
        <>
          <h2 style={{ fontSize: 17, margin: "22px 0 6px" }}>Reminder and escalation days</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            <p className="small-note" style={{ marginTop: 0 }}>For each kind of approval: after how many days the person is reminded, and after how many days the position above them is told.</p>
            <table className="table" style={{ fontSize: 13 }}>
              <thead><tr><th>Kind</th><th>Remind after</th><th>Escalate after</th><th></th></tr></thead>
              <tbody>{providers.map((p) => { const s = settingFor(st, p.kind); return (
                <tr key={p.kind}><td>{p.label}</td><td>{s.remindAfterDays} days</td><td>{s.escalateAfterDays} days</td>
                  <td><ActionForm url="/api/approvals" fixed={{ action: "setting", kind: p.kind }} collapsed openLabel="Change" submit="Save" initial={{ remindAfterDays: s.remindAfterDays, escalateAfterDays: s.escalateAfterDays }} fields={[{ name: "remindAfterDays", label: "Remind after (days)", type: "number" }, { name: "escalateAfterDays", label: "Escalate after (days)", type: "number" }]} /></td></tr>
              ); })}</tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
