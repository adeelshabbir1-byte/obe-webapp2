import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import HelpRequests from "../../../components/help/HelpRequests";
import { KB_EDITORS } from "../../../lib/help/access";
import { whoIs, staffOf } from "../../../lib/registers";
import { deskSetting, PRIORITIES } from "../../../lib/help/deskExtra";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help requests" };

export default async function HelpRequestsPage({ searchParams }: { searchParams: { id?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  // The Institute Head sets up the institute's own support people and the answer times (SLA) per priority.
  const w = user.role === "CHAIRMAN" ? await whoIs(user as never) : null;
  const setting = w ? await deskSetting(w.chairmanId) : null;
  const staff = w ? await staffOf(w.chairmanId) : [];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Help requests</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 820 }}>
            Questions the help center didn&apos;t answer go straight to the people who can act on them. What you asked is on the left; requests routed to you to answer are under “For me to answer”.
            {user.role === "CHAIRMAN" ? " As Institute Head you see every request of the institute." : ""}
          </p>
        </div>
        <Link href="/help" className="btn btn-secondary btn-sm">Help center</Link>
      </div>
      <HelpRequests audience="staff" canPublish={KB_EDITORS.includes(user.role)} initialId={searchParams.id} superUser={user.role === "SUPER_USER"} />
      {setting && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Help desk set-up</h3>
          <p className="small-note" style={{ marginTop: 0 }}>Your institute&apos;s own support people also receive every local request (accounts, courses, registration, exams …). Requests about the system itself go to the platform&apos;s Super Users. Answer times start when a request is raised; the people answering are reminded once a request passes its time without an answer.</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <b style={{ fontSize: 13 }}>Support people:</b>
            {setting.supportUserIds.length === 0 && <span className="small-note" style={{ margin: 0 }}>none yet</span>}
            {setting.supportUserIds.map((id) => <span key={id} style={{ display: "inline-flex", gap: 4, alignItems: "center", background: "#F1E8E6", borderRadius: 6, padding: "2px 6px", fontSize: 13 }}>{staff.find((s) => s.id === id)?.name || "—"} <ActionButton url="/api/help/desk-settings" body={{ action: "removeSupport", userId: id }} label="×" className="btn btn-secondary btn-sm" /></span>)}
          </div>
          <ActionForm url="/api/help/desk-settings" fixed={{ action: "addSupport" }} collapsed openLabel="Add a support person…" submit="Add" fields={[{ name: "userId", label: "Member of staff", type: "select", options: staff.filter((s) => !setting.supportUserIds.includes(s.id)).map((s) => [s.id, s.name] as [string, string]) }]} />
          <div style={{ marginTop: 10, fontSize: 13 }}><b>Answer times:</b> {PRIORITIES.map(([k, l]) => `${l.split(" —")[0]} ${setting.sla[k]} h`).join(" · ")}</div>
          <div style={{ marginTop: 6 }}><ActionForm url="/api/help/desk-settings" fixed={{ action: "sla" }} collapsed openLabel="Change answer times…" submit="Save" initial={setting.sla} fields={PRIORITIES.map(([k, l]) => ({ name: k, label: `${l.split(" —")[0]} (hours)`, type: "number" as const }))} /></div>
        </div>
      )}
    </Shell>
  );
}
