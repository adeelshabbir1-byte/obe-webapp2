import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import StudentShell from "../../../components/StudentShell";
import { ActionButton, ActionForm } from "../../../components/fyp/FypClient";
import { ARTIFACT_KINDS, eligibility, REQUISITION_KINDS, studentCycle } from "../../../lib/fyp";
import { meetingLog, remarksOf } from "../../../lib/fypPlus";

export const dynamic = "force-dynamic";
export const metadata = { title: "Final Year Project" };
const day = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const APP: Record<string, [string, string]> = { PENDING: ["Waiting for the teacher", "badge-warn"], ACCEPTED: ["Accepted", "badge-ok"], DECLINED: ["Declined", "badge-no"], WITHDRAWN: ["Withdrawn", "badge-neutral"] };
const API = "/api/student/fyp";

// The student's Final Year Project: form a group with classmates, apply to approved projects, then follow milestones,
// add the thesis / repository links and requests, and see the signed-off result.
export default async function StudentFypPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");

  let missing = false;
  const openCycle = await studentCycle(student.id).catch(() => { missing = true; return null; });
  // The student's latest group (the open cycle's, or a finished one whose result they can still see).
  const me = missing ? null : await prisma.fypGroupMember.findFirst({ where: { studentId: student.id, ...(openCycle ? { cycleId: openCycle.id } : {}) }, orderBy: { createdAt: "desc" } });
  const cycle = me ? await prisma.fypCycle.findUnique({ where: { id: me.cycleId } }) : openCycle;
  const group = me ? await prisma.fypGroup.findUnique({ where: { id: me.groupId } }) : null;
  const el = cycle && !missing ? await eligibility(student.id, cycle) : null;
  const isLeader = !!group && group.leaderId === student.id;

  const members = group ? await prisma.fypGroupMember.findMany({ where: { groupId: group.id }, orderBy: { createdAt: "asc" } }) : [];
  const studentsById = new Map((await prisma.student.findMany({ where: { id: { in: members.map((m) => m.studentId).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true } })).map((s) => [s.id, s]));
  const forming = !!group && group.status === "FORMING" && me?.status === "JOINED";
  const approved = cycle && cycle.status === "OPEN" && (!group || forming) ? await prisma.fypProposal.findMany({ where: { cycleId: cycle.id, status: "APPROVED" }, orderBy: { title: "asc" } }) : [];
  const taken = approved.length ? await prisma.fypApplication.groupBy({ by: ["proposalId"], where: { proposalId: { in: approved.map((p) => p.id) }, status: "ACCEPTED" }, _count: true }) : [];
  const apps = group ? await prisma.fypApplication.findMany({ where: { groupId: group.id }, orderBy: { createdAt: "desc" } }) : [];
  const proposal = group?.proposalId ? await prisma.fypProposal.findUnique({ where: { id: group.proposalId } }) : null;
  const appProposals = new Map((apps.length ? await prisma.fypProposal.findMany({ where: { id: { in: apps.map((a) => a.proposalId) } }, select: { id: true, title: true } }) : []).map((p) => [p.id, p.title]));
  const teacherIds = [...approved.map((p) => p.proposerId), group?.supervisorId].filter((x): x is string => !!x);
  const teachers = new Map((await prisma.user.findMany({ where: { id: { in: teacherIds.concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const active = !!group && group.status !== "FORMING" && me?.status === "JOINED";
  const panel = active && group!.panelId ? await prisma.fypPanel.findUnique({ where: { id: group!.panelId } }) : null;
  const milestones = cycle && active ? await prisma.fypMilestone.findMany({ where: { cycleId: cycle.id }, orderBy: [{ orderIndex: "asc" }, { dueDate: "asc" }] }) : [];
  const artifacts = active ? await prisma.fypArtifact.findMany({ where: { groupId: group!.id }, orderBy: { createdAt: "desc" } }) : [];
  const requisitions = active ? await prisma.fypRequisition.findMany({ where: { groupId: group!.id }, orderBy: { createdAt: "desc" } }) : [];
  const result = cycle && active ? await prisma.fypResult.findUnique({ where: { cycleId_studentId: { cycleId: cycle.id, studentId: student.id } } }) : null;
  const canEdit = active && group!.status === "ACTIVE" && cycle?.status === "OPEN";

  return (
    <StudentShell studentName={student.name}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Final Year Project</h1>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 16 }}>Form a group, apply for a project your teachers have proposed, and keep your project&apos;s work and deadlines in one place.</p>
        {missing && <div className="card"><p style={{ margin: 0, color: "var(--slate)" }}>Final Year Projects are not available yet.</p></div>}
        {!missing && !cycle && <div className="card"><p style={{ margin: 0, color: "var(--slate)" }}>No Final Year Project cycle is open for your department yet.</p></div>}

        {cycle && el && !active && (
          <div className="card" style={{ borderLeft: `4px solid ${el.ok ? "var(--sage)" : "var(--rust)"}` }}>
            <h3 style={{ marginTop: 0 }}>{cycle.title}</h3>
            <p style={{ fontSize: 13, margin: "0 0 4px" }}>Your CGPA <b>{el.cgpa ?? "—"}</b> · credit hours earned <b>{el.earnedCredits}</b>. Needed: CGPA {cycle.minCgpa}+ and {cycle.minCreditHours}+ credit hours. Groups of {cycle.minGroupSize} to {cycle.maxGroupSize} students.</p>
            {el.ok ? <p style={{ fontSize: 13, margin: 0, color: "var(--sage)" }}>You are eligible.</p> : <p style={{ fontSize: 13, margin: 0, color: "var(--rust)" }}>Not eligible yet: {el.reasons.join("; ")}.</p>}
          </div>
        )}

        {cycle && cycle.status === "OPEN" && !me && el?.ok && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Start a group</h3>
            <p className="small-note" style={{ marginTop: 0 }}>You become the group leader and invite your classmates by roll number. If a classmate is forming a group, ask them to invite you instead.</p>
            <ActionForm url={API} fixed={{ action: "createGroup" }} submit="Create group" fields={[{ name: "name", label: "Group name", width: 260, placeholder: "e.g. Team Falcon" }]} />
          </div>
        )}

        {me?.status === "INVITED" && group && (
          <div className="card" style={{ borderLeft: "4px solid var(--brass)" }}>
            <h3 style={{ marginTop: 0 }}>Invitation to join &ldquo;{group.name}&rdquo;</h3>
            <p style={{ fontSize: 13 }}>From {studentsById.get(group.leaderId)?.name}. Members so far: {members.filter((m) => m.status === "JOINED").map((m) => studentsById.get(m.studentId)?.name).join(", ")}.</p>
            <span style={{ display: "flex", gap: 8 }}>
              <ActionButton url={API} body={{ action: "respondInvite", accept: true }} label="Join the group" />
              <ActionButton url={API} body={{ action: "respondInvite", accept: false }} label="Decline" className="btn btn-secondary btn-sm" confirmText="Decline this invitation?" />
            </span>
          </div>
        )}

        {group && me?.status === "JOINED" && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Your group: {group.name}</h3>
              {forming && <ActionButton url={API} body={{ action: "leave" }} label={isLeader ? "Break up the group" : "Leave the group"} className="act act-danger" confirmText={isLeader ? "Break up the group? Every member and application is removed." : "Leave this group?"} />}
            </div>
            <table style={{ marginTop: 8 }}>
              <thead><tr><th>Student</th><th>Status</th><th /></tr></thead>
              <tbody>{members.map((m) => {
                const s = studentsById.get(m.studentId);
                return (
                  <tr key={m.id}>
                    <td>{s?.name}<div className="small-note">{s?.rollNumber}{m.studentId === group.leaderId ? " · leader" : ""}</div></td>
                    <td>{m.status === "JOINED" ? <span className="badge badge-ok">Joined</span> : <span className="badge badge-warn">Invited</span>}</td>
                    <td>{forming && isLeader && m.studentId !== student.id && <ActionButton url={API} body={{ action: "removeMember", studentId: m.studentId }} label={m.status === "INVITED" ? "Cancel invite" : "Remove"} className="act act-danger" />}</td>
                  </tr>
                );
              })}</tbody>
            </table>
            {forming && isLeader && members.length < (cycle?.maxGroupSize || 0) && (
              <ActionForm url={API} fixed={{ action: "invite" }} submit="Invite" collapsed openLabel="Invite a classmate" done="Invitation sent." fields={[{ name: "rollNumber", label: "Classmate's roll number", width: 200 }]} />
            )}
          </div>
        )}

        {forming && apps.length > 0 && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Your applications</h3>
            <table>
              <thead><tr><th>Project</th><th>Status</th><th /></tr></thead>
              <tbody>{apps.map((a) => <tr key={a.id}><td>{appProposals.get(a.proposalId)}{a.note && <div className="small-note">{a.note}</div>}</td><td><span className={`badge ${APP[a.status]?.[1] || "badge-neutral"}`}>{APP[a.status]?.[0] || a.status}</span></td><td>{isLeader && a.status === "PENDING" && <ActionButton url={API} body={{ action: "withdrawApplication", applicationId: a.id }} label="Withdraw" className="act act-danger" />}</td></tr>)}</tbody>
            </table>
          </div>
        )}

        {approved.length > 0 && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Projects open for groups</h3>
            <p className="small-note" style={{ marginTop: 0 }}>
              {forming && isLeader ? `As the leader you apply for your group (up to ${cycle!.maxApplications} applications at a time). The teacher reviews your members' profiles and accepts or declines.` : forming ? "Your group leader applies for the group." : "Form or join a group to apply."}
            </p>
            {approved.map((p) => {
              const seats = p.maxGroups - (taken.find((t) => t.proposalId === p.id)?._count || 0);
              const applied = apps.find((a) => a.proposalId === p.id && (a.status === "PENDING" || a.status === "ACCEPTED"));
              return (
                <div key={p.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div><b>{p.title}</b><div className="small-note">{teachers.get(p.proposerId)}{p.domain ? ` · ${p.domain}` : ""} · {seats > 0 ? `${seats} place(s) left` : "full"}{p.ploNumbers.length ? ` · PLO ${p.ploNumbers.join(", ")}` : ""}</div></div>
                    {applied && <span className={`badge ${APP[applied.status][1]}`}>{APP[applied.status][0]}</span>}
                  </div>
                  <p style={{ fontSize: 13, margin: "4px 0" }}>{p.abstract}</p>
                  <div className="small-note">{[p.skills && `Skills: ${p.skills}`, p.hardware && `Hardware: ${p.hardware}`, p.software && `Software: ${p.software}`].filter(Boolean).join(" · ")}</div>
                  {forming && isLeader && !applied && seats > 0 && (
                    <ActionForm url={API} fixed={{ action: "apply", proposalId: p.id }} submit="Send application" collapsed openLabel="Apply" done="Application sent."
                      fields={[{ name: "message", label: "Why your group fits this project (skills, interest, prior work)", type: "textarea" }]} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {active && group && (
          <>
            <div className="card" style={{ borderLeft: group.extendedUntil ? "4px solid var(--rust)" : "4px solid var(--sage)" }}>
              <h3 style={{ marginTop: 0 }}>{proposal?.title || "Your project"}</h3>
              <p style={{ fontSize: 13, margin: "0 0 4px" }}>Supervisor: <b>{group.supervisorId ? teachers.get(group.supervisorId) : "—"}</b>{panel ? <> · Panel: <b>{panel.name}</b>{panel.sessionAt ? `, ${panel.sessionAt.toISOString().slice(0, 16).replace("T", " ")}` : ""}{panel.venue ? `, ${panel.venue}` : ""}</> : null}</p>
              {group.extendedUntil && <p style={{ fontSize: 13, margin: 0, color: "var(--rust)" }}>Your group has an extension until {day(group.extendedUntil)}. Your FYP grade is on hold until the follow-up evaluation.</p>}
              {proposal?.scope && <p className="small-note" style={{ whiteSpace: "pre-wrap" }}>{proposal.scope}</p>}
            </div>
            {await (async () => {
              const [log, remarks] = await Promise.all([meetingLog(group.id), remarksOf(group.id)]);
              const tasks = (log || []).flatMap((m) => m.tasks).filter((t) => !t.studentId || t.studentId === student.id);
              const next = (log || [])[0]?.nextAt;
              return (
                <>
                  {(log?.length || 0) > 0 && (
                    <div className="card">
                      <h3 style={{ marginTop: 0 }}>Supervisor meetings</h3>
                      {next && <p style={{ margin: "0 0 6px" }}>Next meeting: <b>{day(next)}</b></p>}
                      {tasks.filter((t) => t.status === "OPEN").length > 0 ? <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{tasks.filter((t) => t.status === "OPEN").map((t) => <li key={t.id}>{t.text}{t.studentId ? " (you)" : ""}</li>)}</ul> : <p className="small-note">No open tasks.</p>}
                      {(log || [])[0]?.feedback && <p className="small-note">Latest feedback: {(log || [])[0].feedback}</p>}
                    </div>
                  )}
                  {remarks.length > 0 && (
                    <div className="card">
                      <h3 style={{ marginTop: 0 }}>Panel remarks</h3>
                      <p className="small-note" style={{ marginTop: 0 }}>Reply to each remark with what you changed — the next panel sees your reply.</p>
                      {remarks.map((r) => (
                        <div key={r.id} style={{ borderTop: "1px solid var(--line)", padding: "6px 0", fontSize: 13 }}>
                          <span className="small-note">{milestones.find((m) => m.id === r.milestoneId)?.title} · {r.by}:</span> {r.text}
                          {r.replies.map((rp, i) => <div key={i} className="small-note" style={{ marginLeft: 14 }}>↳ {rp.text}{rp.addressed ? " (addressed)" : ""}</div>)}
                          <ActionForm url="/api/student/fyp" fixed={{ action: "replyRemark", evaluationId: r.id }} submit="Reply" collapsed openLabel="Reply" fields={[{ name: "text", label: "What you did", type: "textarea" }, { name: "addressed", label: "Addressed", type: "checkbox" }]} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Milestones</h3>
              <table>
                <thead><tr><th>Milestone</th><th>Due</th><th>Weight</th></tr></thead>
                <tbody>{milestones.map((m) => <tr key={m.id}><td>{m.title}</td><td>{day(group.extendedUntil && ["FINAL", "THESIS"].includes(m.kind) && group.extendedUntil > m.dueDate ? group.extendedUntil : m.dueDate)}</td><td>{m.weightPct ? `${m.weightPct}%` : "submission"}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Thesis, repository and demo</h3>
              <p className="small-note" style={{ marginTop: 0 }}>Add the links the panel needs: thesis drafts, the plagiarism (similarity) report, your code repository and a demo video.</p>
              {artifacts.length > 0 && (
                <table>
                  <thead><tr><th>Added</th><th>Kind</th><th>Link</th><th>Similarity</th></tr></thead>
                  <tbody>{artifacts.map((a) => <tr key={a.id}><td className="small-note">{day(a.createdAt)}</td><td>{ARTIFACT_KINDS[a.kind] || a.kind}{a.note && <div className="small-note">{a.note}</div>}</td><td style={{ wordBreak: "break-all" }}><a href={a.url} target="_blank" rel="noopener noreferrer">{a.url.length > 50 ? a.url.slice(0, 47) + "…" : a.url}</a></td><td>{a.similarityPct !== null ? `${a.similarityPct}%` : "—"}</td></tr>)}</tbody>
                </table>
              )}
              {canEdit && (
                <ActionForm url={API} fixed={{ action: "addArtifact" }} submit="Add" collapsed openLabel="Add a link" initial={{ kind: "THESIS_DRAFT" }}
                  fields={[{ name: "kind", label: "Kind", type: "select", options: Object.entries(ARTIFACT_KINDS), width: 240 }, { name: "url", label: "Link", width: 300, placeholder: "https://" }, { name: "similarityPct", label: "Similarity % (for a report)", type: "number", width: 150 }, { name: "note", label: "Note", width: 220 }]} />
              )}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Funding and equipment requests</h3>
              {requisitions.length === 0 ? <p className="small-note">None yet.</p> : (
                <table>
                  <thead><tr><th>Request</th><th>Amount</th><th>Status</th></tr></thead>
                  <tbody>{requisitions.map((r) => <tr key={r.id}><td>{r.item}<div className="small-note">{REQUISITION_KINDS[r.kind] || r.kind}{r.sponsor ? ` · sponsor: ${r.sponsor}` : ""}</div></td><td>{r.amount !== null ? `PKR ${r.amount.toLocaleString("en-US")}` : "—"}</td><td><span className="badge badge-neutral">{r.status.toLowerCase()}</span>{r.note && <div className="small-note">{r.note}</div>}</td></tr>)}</tbody>
                </table>
              )}
              {canEdit && (
                <ActionForm url={API} fixed={{ action: "requestRequisition" }} submit="Send request" collapsed openLabel="Request funds or equipment" done="Sent to your supervisor and the FYP Head." initial={{ kind: "HARDWARE" }}
                  fields={[{ name: "kind", label: "Kind", type: "select", options: Object.entries(REQUISITION_KINDS), width: 200 }, { name: "item", label: "Item", width: 240 }, { name: "amount", label: "Amount (PKR)", type: "number", width: 120 }, { name: "sponsor", label: "Industry sponsor (if any)", width: 180 }, { name: "details", label: "Details", type: "textarea" }]} />
              )}
            </div>
            {result && result.status === "APPROVED" && (
              <div className="card" style={{ borderLeft: "4px solid var(--sage)" }}>
                <h3 style={{ marginTop: 0 }}>Result</h3>
                <p style={{ fontSize: 14, margin: 0 }}>Grade <b>{result.grade}</b> · {Math.round(result.totalPct * 10) / 10}% · {cycle!.courseCode} {cycle!.courseTitle} ({cycle!.creditHours} credit hours). It is on your transcript.</p>
              </div>
            )}
          </>
        )}
      </div>
    </StudentShell>
  );
}
