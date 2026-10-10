import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import EvidenceFileForm from "../../components/EvidenceFileForm";
import RemoveButton from "../../components/RemoveButton";
import { FILE_ROLES, MEETING_KINDS, MEETING_ROLES, fileScope } from "../../lib/evidenceFiles";
import { ROLE_TEXT } from "../../lib/institutePeople";

type M = { id: string; leadId: string | null; kind: string; title: string; meetingDate: Date; attendees: string | null; decisions: string | null; fileName: string | null; createdById: string };
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function MeetingsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!FILE_ROLES.includes(user.role)) redirect("/dashboard");
  const scope = await fileScope(user);
  const canAdd = MEETING_ROLES.includes(user.role);
  const rows = (await prisma.meetingMinutes.findMany({ where: scope.visible("createdById") as never, select: { id: true, leadId: true, kind: true, title: true, meetingDate: true, attendees: true, decisions: true, fileName: true, createdById: true }, orderBy: { meetingDate: "desc" }, take: 300 })) as unknown as M[];
  const users = (await prisma.user.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.createdById))).concat(["none"]) } }, select: { id: true, name: true } })) as unknown as { id: string; name: string }[];
  const name = new Map(users.map((u) => [u.id, u.name]));
  const lead = new Map(scope.leads.map((l) => [l.id, l.leadProgram || l.name]));
  return (
    <Shell roleLabel={ROLE_TEXT[user.role] || "Meetings"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Meetings and minutes</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        OMC, BOS, BPF, faculty meetings and the industrial advisory board. Recording a meeting here also ticks off the matching task in the Semester plan for the person who recorded it.
      </p>
      {canAdd && <EvidenceFileForm mode="meeting" kinds={MEETING_KINDS} leads={scope.leads.map((l) => ({ id: l.id, label: l.leadProgram || l.name }))} />}
      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p style={{ color: "var(--slate)", margin: 0 }}>No meetings recorded yet.</p> : rows.map((m) => (
          <div key={m.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <b>{m.title}</b><span style={{ fontSize: 12.5 }}>{MEETING_KINDS[m.kind] || m.kind} · {day(m.meetingDate)}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--slate)" }}>{m.leadId ? lead.get(m.leadId) || "" : "Whole institute"} · recorded by {name.get(m.createdById) || "—"}</div>
            {m.attendees && <div style={{ fontSize: 12.5, marginTop: 4 }}><b>Attended:</b> {m.attendees}</div>}
            {m.decisions && <div style={{ fontSize: 12.5, marginTop: 2, whiteSpace: "pre-wrap" }}><b>Decisions:</b> {m.decisions}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center" }}>
              {m.fileName && <a className="btn" style={{ fontSize: 12 }} href={`/api/meetings/${m.id}`}>Download minutes ({m.fileName})</a>}
              {(m.createdById === user.id || user.role === "CHAIRMAN") && <RemoveButton url={`/api/meetings?id=${m.id}`} confirmText="Remove these minutes?" />}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
