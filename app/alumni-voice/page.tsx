import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { ActionForm } from "../../components/fyp/FypClient";
import AlumniRequestForm from "../../components/AlumniRequestForm";
import AlumniLinkButton from "../../components/AlumniLinkButton";
import { commentsOf, connectorCounts, industryExperts, TIERS, voicesOf } from "../../lib/alumniVoice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alumni voice" };

const DECIDE_SUGGESTION = ["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "SUBJECT_EXPERT", "DEAN"];
const DECIDE_WORKSHOP = ["STUDENT_AFFAIRS", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "PROGRAM_COORDINATOR"];
const LINKS = ["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "STUDENT_AFFAIRS"];

// Alumni suggestions and workshop offers (open to every faculty member), requests to alumni with the Alumni Connector
// badge, alumni's own corner links, and making an alumnus an Industry Subject Expert.
export default async function AlumniVoicePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  const [voices, alumni, counts] = await Promise.all([
    voicesOf({ chairmanId }),
    prisma.alumni.findMany({ where: { chairmanId, status: "APPROVED" }, select: { id: true, name: true, rollNumber: true, degreeProgram: true, graduationYear: true, email: true }, orderBy: [{ graduationYear: "desc" }, { name: "asc" }], take: 2000 }),
    connectorCounts([user.id]),
  ]);
  const names = new Map(alumni.map((a) => [a.id, a]));
  const comments = await commentsOf((voices || []).map((v) => v.id));
  const ise = await industryExperts(alumni.map((a) => a.id));
  const mine = counts.get(user.id) || { sent: 0, answered: 0 };
  const next = TIERS.find((t) => t > mine.answered);
  const leads = user.role === "PROGRAM_COORDINATOR" ? [] : await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true, name: true, leadProgram: true } });
  const opts = alumni.map((a) => ({ id: a.id, label: `${a.name} · ${a.rollNumber} · ${a.degreeProgram} ${a.graduationYear}` }));
  const status = (s: string) => ({ OPEN: "open", TAKEN_UP: "taken up", NOT_NOW: "not now", ACCEPTED: "accepted", DECLINED: "declined", DONE: "done" }[s] || s);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Alumni Voice</h1>
      <p className="small-note" style={{ maxWidth: 920 }}>What alumni suggest for the curriculum and courses, and the workshops they offer — open to every faculty member. Send alumni a request for their news and views; each answer counts towards your <b>Alumni Connector</b> badge.</p>
      {voices === null && <div className="err">Run prisma/migration_alumni_voice.sql in Supabase first.</div>}

      <div className="card">
        <b>Ask an alumnus</b> <span className="small-note">· you: {mine.answered} answered of {mine.sent} sent{next ? ` · ${next - mine.answered} more for the next badge` : ""}</span>
        <div style={{ marginTop: 8 }}><AlumniRequestForm alumni={opts} /></div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <b>Suggestions and workshop offers ({(voices || []).length})</b>
        {(voices || []).length === 0 ? <p className="small-note">None yet. Alumni send them from their alumni corner link.</p> : (voices || []).map((v) => {
          const a = names.get(v.alumniId);
          const canDecide = (v.kind === "WORKSHOP" ? DECIDE_WORKSHOP : DECIDE_SUGGESTION).includes(user.role);
          return (
            <div key={v.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div><b>{v.kind === "WORKSHOP" ? "Workshop offer: " : ""}{v.title}</b> {v.courseCode ? <span className="badge badge-neutral">{v.courseCode}</span> : <span className="badge badge-neutral">curriculum</span>}
                  <div className="small-note">{a ? `${a.name} (${a.degreeProgram} ${a.graduationYear})` : "alumnus"} · {v.createdAt.toISOString().slice(0, 10)}{v.audience ? ` · for ${v.audience}` : ""}{v.preferredDates ? ` · suits ${v.preferredDates}` : ""}</div></div>
                <span className="small-note"><b>{status(v.status)}</b>{v.scheduledFor ? ` — ${v.scheduledFor.toISOString().slice(0, 10)}` : ""}</span>
              </div>
              <p style={{ fontSize: 13, whiteSpace: "pre-wrap", margin: "6px 0" }}>{v.text}</p>
              {v.reply && <p className="small-note" style={{ margin: "2px 0" }}>Reply to the alumnus: {v.reply}</p>}
              {comments.filter((c) => c.voiceId === v.id).map((c) => <div key={c.id} className="small-note" style={{ marginLeft: 12 }}><b>{c.authorName}:</b> {c.text}</div>)}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                <ActionForm url="/api/alumni-voice" fixed={{ action: "comment", voiceId: v.id }} submit="Post" collapsed openLabel="Comment" fields={[{ name: "text", label: "Comment (faculty only)", type: "textarea" }]} />
                {canDecide && <ActionForm url="/api/alumni-voice" fixed={{ action: "decide", voiceId: v.id }} submit="Save" collapsed openLabel="Decide" initial={{ status: v.status, reply: v.reply || "" }}
                  fields={[{ name: "status", label: "Status", type: "select", options: (v.kind === "WORKSHOP" ? [["OPEN", "Open"], ["ACCEPTED", "Accepted"], ["DECLINED", "Declined"], ["DONE", "Held"]] : [["OPEN", "Open"], ["TAKEN_UP", "Taken up"], ["NOT_NOW", "Not now"]]) as [string, string][] },
                    ...(v.kind === "WORKSHOP" ? [{ name: "scheduledFor", label: "Date", type: "date" as const }] : []), { name: "reply", label: "Reply to the alumnus", width: 360 }]} />}
              </div>
            </div>
          );
        })}
      </div>

      {LINKS.includes(user.role) && (
        <div className="card" style={{ overflowX: "auto" }}>
          <b>Alumni corner links and Industry Subject Experts</b>
          <p className="small-note">Each alumnus has a personal link to suggest and offer workshops (no password). An alumnus can also be made an <b>Industry Subject Expert</b>: a separate SE login, outside the teaching pool, to review the CLOs, topics and assessments of courses.</p>
          <table style={{ fontSize: 12.5 }}><tbody>{alumni.slice(0, 300).map((a) => (
            <tr key={a.id}><td>{a.name} <span className="small-note">{a.rollNumber} · {a.degreeProgram} {a.graduationYear}</span>{ise.has(a.id) && <span className="badge badge-ok" style={{ marginLeft: 6 }}>Industry SE</span>}</td>
              <td><AlumniLinkButton body={{ action: "link", alumniId: a.id }} label="Corner link" /></td>
              <td>{!ise.has(a.id) && ["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role) && (() => {
                const lead = user.role === "PROGRAM_COORDINATOR" ? null : leads.find((l) => l.leadProgram === a.degreeProgram) || leads[0];
                return user.role !== "PROGRAM_COORDINATOR" && !lead ? null : <AlumniLinkButton body={{ action: "industrySe", alumniId: a.id, email: a.email || "", leadId: lead?.id }} label={`Make Industry SE${lead ? ` (under ${lead.name})` : ""}`} />;
              })()}</td></tr>
          ))}</tbody></table>
        </div>
      )}
    </Shell>
  );
}
