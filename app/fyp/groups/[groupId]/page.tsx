import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel } from "../../../../lib/reportScope";
import Shell from "../../../../components/Shell";
import { ActionButton, ActionForm, ScoreSheet } from "../../../../components/fyp/FypClient";
import { ARTIFACT_KINDS, computeResults, EXTENSIONS, evaluatorRoleFor, fypAccess, REQUISITION_KINDS, ROLE_TEXT, standingOf, EVALUATOR_MODES } from "../../../../lib/fyp";
import { meetingLog, remarksOf, supervisionPct } from "../../../../lib/fypPlus";
import FypMeetings from "../../../../components/fyp/FypMeetings";

export const dynamic = "force-dynamic";
export const metadata = { title: "FYP group" };
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");

export default async function FypGroupPage({ params }: { params: { groupId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const acc = await fypAccess(user);
  const group = await prisma.fypGroup.findUnique({ where: { id: params.groupId } }).catch(() => null);
  if (!group) notFound();
  const cycle = await prisma.fypCycle.findFirst({ where: { id: group.cycleId, chairmanId: acc.chairmanId } });
  if (!cycle) notFound();
  const evalRole = await evaluatorRoleFor(user.id, group);
  const manages = acc.manages(cycle.departmentId), chairs = acc.chairs(cycle.departmentId);
  if (!evalRole && !manages && !chairs) notFound();
  const oversight = manages || chairs || evalRole === "SUPERVISOR";

  const [proposal, panel, memberRows, milestones, criteria, myScores, evaluations, artifacts, requisitions, extensions] = await Promise.all([
    group.proposalId ? prisma.fypProposal.findUnique({ where: { id: group.proposalId } }) : null,
    group.panelId ? prisma.fypPanel.findUnique({ where: { id: group.panelId } }) : null,
    prisma.fypGroupMember.findMany({ where: { groupId: group.id, status: "JOINED" } }),
    prisma.fypMilestone.findMany({ where: { cycleId: cycle.id }, orderBy: [{ orderIndex: "asc" }, { dueDate: "asc" }] }),
    prisma.fypRubricCriterion.findMany({ where: { cycleId: cycle.id }, orderBy: { orderIndex: "asc" } }),
    prisma.fypScore.findMany({ where: { groupId: group.id, evaluatorKey: user.id } }),
    prisma.fypEvaluation.findMany({ where: { groupId: group.id }, orderBy: { updatedAt: "desc" } }),
    prisma.fypArtifact.findMany({ where: { groupId: group.id }, orderBy: { createdAt: "desc" } }),
    prisma.fypRequisition.findMany({ where: { groupId: group.id }, orderBy: { createdAt: "desc" } }),
    prisma.fypExtension.findMany({ where: { groupId: group.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const students = await prisma.student.findMany({ where: { id: { in: memberRows.map((m) => m.studentId) } }, select: { id: true, name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true } } } });
  const standings = new Map(await Promise.all(students.map(async (s) => [s.id, await standingOf(s.id)] as const)));
  const people = new Map((await prisma.user.findMany({ where: { id: { in: [group.supervisorId, ...requisitions.map((r) => r.decidedById), ...extensions.map((e) => e.grantedById)].filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const panelMembers = panel ? await prisma.fypPanelMember.findMany({ where: { panelId: panel.id } }) : [];
  const panelNames = new Map([
    ...(await prisma.user.findMany({ where: { id: { in: panelMembers.map((m) => m.userId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name] as const),
    ...(await prisma.fypExternal.findMany({ where: { id: { in: panelMembers.map((m) => m.externalId).filter((x): x is string => !!x) } }, select: { id: true, name: true, organization: true } })).map((x) => [x.id, `${x.name}${x.organization ? ` (${x.organization})` : ""}`] as const),
  ]);
  const results = oversight ? (await computeResults(cycle.id)).rows.filter((r) => r.groupId === group.id) : [];
  const fypResults = oversight ? await prisma.fypResult.findMany({ where: { groupId: group.id } }) : [];
  const evaluated = milestones.filter((m) => m.weightPct > 0);
  const latest = (kind: string) => artifacts.find((a) => a.kind === kind);
  const memberList = students.map((s) => ({ id: s.id, name: s.name, rollNumber: s.rollNumber }));
  // Per presentation: who may score it (its own panel, or the group's), earlier remarks, meeting log, panels to choose from.
  const roleFor = new Map(await Promise.all(evaluated.map(async (m) => [m.id, await evaluatorRoleFor(user.id, group, m.id)] as const)));
  const [remarks, meetings, supMark, panels, msPanels] = await Promise.all([
    remarksOf(group.id), meetingLog(group.id), supervisionPct([group.id]),
    manages ? prisma.fypPanel.findMany({ where: { cycleId: cycle.id }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    (prisma as unknown as Record<string, any>).fypMilestonePanel.findMany({ where: { groupId: group.id } }).catch(() => []) as Promise<{ milestoneId: string; panelId: string }[]>,
  ]);
  const orderOf = new Map(milestones.map((m, i) => [m.id, i]));
  const modeOf = (m: { id: string }) => (m as unknown as { evaluatorMode?: string }).evaluatorMode || "PANEL";

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 2 }}>{group.name}</h1>
          <p className="small-note" style={{ margin: 0 }}>{cycle.title}{proposal ? ` · ${proposal.title}` : ""} · supervisor {group.supervisorId ? people.get(group.supervisorId) : "not yet"} · panel {panel?.name || "not yet"}</p>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {group.atRisk && <span className="badge badge-no">At risk</span>}
            {group.extendedUntil && <span className="badge badge-warn">Extended to {day(group.extendedUntil)}</span>}
            {group.publicationFlag && <span className="badge badge-ok">Publication</span>}
            {group.patentFlag && <span className="badge badge-ok">Patent</span>}
            {group.incubatorFlag && <span className="badge badge-ok">Incubator</span>}
            {evalRole && <span className="badge badge-neutral">You: {ROLE_TEXT[evalRole]}</span>}
          </div>
        </div>
        <Link href={manages || chairs ? `/fyp/manage?cycle=${cycle.id}&tab=groups` : "/fyp"} className="btn btn-secondary btn-sm">← Back</Link>
      </div>
      {group.atRisk && group.riskNote && <div className="card" style={{ borderLeft: "4px solid var(--rust)", whiteSpace: "pre-wrap", fontSize: 13 }}><b>Early warning:</b> {group.riskNote}
        {manages && <div style={{ marginTop: 8 }}><ActionButton url="/api/fyp/admin" body={{ action: "clearRisk", groupId: group.id }} label="Clear the warning" className="btn btn-secondary btn-sm" askNote="What was done / why it is cleared:" noteRequired /></div>}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Students</h3>
        <table>
          <thead><tr><th>Student</th><th>Program</th><th>CGPA</th><th>Credits earned</th></tr></thead>
          <tbody>{students.map((s) => <tr key={s.id}><td>{s.name}<div className="small-note">{s.rollNumber}{s.id === group.leaderId ? " · leader" : ""}</div></td><td className="small-note">{s.batch.degreeProgram} — {s.batch.batchName}</td><td>{standings.get(s.id)?.cgpa ?? "—"}</td><td>{standings.get(s.id)?.earnedCredits ?? "—"}</td></tr>)}</tbody>
        </table>
        {panel && <p className="small-note" style={{ marginBottom: 0 }}>Panel: {panelMembers.map((m) => `${panelNames.get(m.userId || m.externalId || "") || "?"} (${m.role.toLowerCase()})`).join(", ")}{panel.sessionAt ? ` · session ${panel.sessionAt.toISOString().slice(0, 16).replace("T", " ")}` : ""}{panel.venue ? ` · ${panel.venue}` : ""}</p>}
      </div>

      {manages && <div className="card" style={{ padding: "8px 14px" }}><ActionForm url="/api/fyp/faculty" fixed={{ action: "setStall", groupId: group.id }} submit="Save" initial={{ stall: (group as unknown as { stall?: string | null }).stall || "" }} fields={[{ name: "stall", label: "Open house stall / room", width: 160, placeholder: "e.g. Lab 3 · Stall 12" }]} /></div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Milestones</h3>
        <table>
          <thead><tr><th>Milestone</th><th>Due</th><th>Weight</th><th>Evaluated by</th>{manages && <th>Panel for this group</th>}</tr></thead>
          <tbody>{milestones.map((m) => <tr key={m.id}><td>{m.title}</td><td>{day(m.dueDate)}{group.extendedUntil && ["FINAL", "THESIS"].includes(m.kind) ? <span className="badge badge-warn" style={{ marginLeft: 6 }}>extended to {day(group.extendedUntil)}</span> : null}</td><td>{m.weightPct ? `${m.weightPct}%` : "deadline"}</td>
            <td className="small-note">{m.kind === "SUPERVISION" ? "Meeting log" : EVALUATOR_MODES[modeOf(m)]}</td>
            {manages && <td>{m.weightPct > 0 && m.kind !== "SUPERVISION" && modeOf(m) !== "SUPERVISOR_ONLY" ? <ActionForm url="/api/fyp/faculty" fixed={{ action: "setMilestonePanel", groupId: group.id, milestoneId: m.id }} submit="Set" initial={{ panelId: msPanels.find((x) => x.milestoneId === m.id)?.panelId || "" }} fields={[{ name: "panelId", label: "", type: "select", options: [["", `Group panel${panel ? ` (${panel.name})` : ""}`], ...panels.map((p) => [p.id, `${p.name}${p.venue ? ` · ${p.venue}` : ""}`] as [string, string])] }]} /> : <span className="small-note">—</span>}</td>}
          </tr>)}</tbody>
        </table>
      </div>

      {evaluated.some((m) => m.kind === "SUPERVISION") && (
        <FypMeetings groupId={group.id} members={memberList.map((s) => ({ id: s.id, name: s.name }))} canEdit={group.supervisorId === user.id || manages}
          markPct={Object.fromEntries(memberList.map((s) => [s.id, supMark.get(`${group.id}|${s.id}`) ?? null]))}
          meetings={(meetings || []).map((m) => ({ id: m.id, heldAt: m.heldAt.toISOString(), nextAt: m.nextAt ? m.nextAt.toISOString() : null, feedback: m.feedback, attendance: m.attendance, tasks: m.tasks }))} />
      )}

      {students.length > 0 && evaluated.filter((m) => m.kind !== "SUPERVISION" && roleFor.get(m.id) && !(modeOf(m) === "SUPERVISOR_ONLY" && roleFor.get(m.id) !== "SUPERVISOR")).map((m) => {
        const evalRole = roleFor.get(m.id)!;
        const earlier = remarks.filter((x) => (orderOf.get(x.milestoneId) ?? 0) < (orderOf.get(m.id) ?? 0) || (x.milestoneId === m.id && !(x.by === user.name)));
        const mine = myScores.filter((s) => s.milestoneId === m.id);
        const ev = evaluations.find((e) => e.milestoneId === m.id && e.evaluatorKey === user.id);
        return (
          <details key={m.id} className="card" open={!ev && group.status !== "COMPLETED"}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>Score: {m.title} {ev ? <span className="badge badge-ok">scored</span> : <span className="badge badge-warn">to do</span>}</summary>
            {earlier.length > 0 && (
              <div style={{ background: "#F7F4F3", padding: "6px 10px", borderRadius: 8, margin: "6px 0", fontSize: 12.5 }}>
                <b>Earlier remarks</b>
                {earlier.map((x) => <div key={x.id} style={{ marginTop: 4 }}><span className="small-note">{milestones.find((y) => y.id === x.milestoneId)?.title} · {x.by}:</span> {x.text}
                  {x.replies.map((rp, i) => <div key={i} style={{ marginLeft: 14, color: rp.addressed ? "#1F5E36" : "#7A520C" }}>↳ {students.find((s) => s.id === rp.studentId)?.name || "Student"}{rp.addressed ? " (addressed)" : ""}: {rp.text}</div>)}</div>)}
              </div>
            )}
            <ScoreSheet url="/api/fyp/faculty" groupId={group.id} milestoneId={m.id} roleText={ROLE_TEXT[evalRole]}
              criteria={criteria.map((c) => ({ id: c.id, name: c.name, description: c.description, bloomLevel: c.bloomLevel, ploNumber: c.ploNumber, maxScore: c.maxScore, appliesTo: c.appliesTo }))}
              members={memberList} existing={Object.fromEntries(mine.map((s) => [`${s.criterionId}|${s.studentId}`, s.score]))} comments={ev?.comments} recommendation={ev?.recommendation} readOnly={group.status === "COMPLETED"} />
          </details>
        );
      })}

      {oversight && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Evaluations and result so far</h3>
          {evaluations.length === 0 ? <p className="small-note">No evaluations yet.</p> : (
            <table>
              <thead><tr><th>Milestone</th><th>Evaluator</th><th>Call</th><th>Feedback</th></tr></thead>
              <tbody>{evaluations.map((e) => <tr key={e.id}><td>{milestones.find((m) => m.id === e.milestoneId)?.title}</td><td>{e.evaluatorName}<div className="small-note">{ROLE_TEXT[e.evaluatorRole]}</div></td><td>{e.recommendation === "AT_RISK" ? <span className="badge badge-no">At risk</span> : <span className="badge badge-ok">On track</span>}</td><td style={{ fontSize: 12.5 }}>{e.comments || "—"}</td></tr>)}</tbody>
            </table>
          )}
          {results.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table>
                <thead><tr><th>Student</th>{evaluated.map((m) => <th key={m.id}>{m.title} ({m.weightPct}%)</th>)}<th>Total</th><th>Grade</th><th>PLO attainment</th></tr></thead>
                <tbody>{results.map((r) => (
                  <tr key={r.studentId}>
                    <td>{r.name}{r.missing.length ? <div className="small-note" style={{ color: "var(--rust)" }}>Missing: {r.missing.slice(0, 3).join("; ")}</div> : null}</td>
                    {r.byMilestone.map((x) => <td key={x.milestoneId}>{x.pct ?? "—"}{x.pct !== null && <div className="small-note">{Object.entries(x.byRole).filter(([, v]) => v !== null).map(([k, v]) => `${k[0]}:${v}`).join(" ")}</div>}</td>)}
                    <td><b>{r.totalPct ?? "—"}</b></td><td>{(() => { const f = fypResults.find((x) => x.studentId === r.studentId); return f ? <>{f.grade} <span className="small-note">({f.status === "HELD" ? "held — extension" : f.status.toLowerCase()})</span></> : r.grade || "—"; })()}</td>
                    <td className="small-note">{r.plo.map((p) => `${p.label} ${p.pct}%`).join(", ")}</td>
                  </tr>
                ))}</tbody>
              </table>
              <p className="small-note">S / I / E: supervisor, internal panel and external panel averages. The grade is the recorded one once results are consolidated.</p>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Artifacts</h3>
        <p className="small-note" style={{ marginTop: 0 }}>
          Before the panel: thesis draft {latest("THESIS_DRAFT") ? "✓" : "✗"} · similarity report {latest("SIMILARITY_REPORT") ? `✓ (${latest("SIMILARITY_REPORT")!.similarityPct ?? "?"}%)` : "✗"} · repository {latest("REPOSITORY") ? "✓" : "✗"} · demo video {latest("DEMO_VIDEO") ? "✓" : "✗"}
        </p>
        {artifacts.length > 0 && (
          <table>
            <thead><tr><th>Added</th><th>Kind</th><th>Link</th><th>Similarity</th></tr></thead>
            <tbody>{artifacts.map((a) => <tr key={a.id}><td className="small-note">{day(a.createdAt)}</td><td>{ARTIFACT_KINDS[a.kind] || a.kind}{a.note && <div className="small-note">{a.note}</div>}</td><td><a href={a.url} target="_blank" rel="noopener noreferrer">{a.url.length > 60 ? a.url.slice(0, 57) + "…" : a.url}</a></td><td>{a.similarityPct !== null ? `${a.similarityPct}%` : "—"}</td></tr>)}</tbody>
          </table>
        )}
        {(group.supervisorId === user.id || manages) && (
          <ActionForm url="/api/fyp/faculty" fixed={{ action: "addArtifact", groupId: group.id }} submit="Add" collapsed openLabel="Add an artifact"
            initial={{ kind: "THESIS_DRAFT" }} fields={[{ name: "kind", label: "Kind", type: "select", options: Object.entries(ARTIFACT_KINDS) }, { name: "url", label: "Link", width: 320, placeholder: "https://" }, { name: "similarityPct", label: "Similarity %", type: "number", width: 90 }, { name: "note", label: "Note", width: 220 }]} />
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Budget and hardware requests</h3>
        {requisitions.length === 0 ? <p className="small-note">None.</p> : (
          <table>
            <thead><tr><th>Request</th><th>Amount</th><th>Sponsor</th><th>Status</th><th /></tr></thead>
            <tbody>{requisitions.map((r) => (
              <tr key={r.id}>
                <td><b>{r.item}</b><div className="small-note">{REQUISITION_KINDS[r.kind] || r.kind}{r.details ? ` · ${r.details}` : ""}</div></td>
                <td>{r.amount !== null ? `PKR ${r.amount.toLocaleString("en-US")}` : "—"}</td><td>{r.sponsor || "Institute"}</td>
                <td><span className="badge badge-neutral">{r.status.toLowerCase()}</span>{r.decidedById && <div className="small-note">{people.get(r.decidedById)}{r.note ? `: ${r.note}` : ""}</div>}</td>
                <td style={{ whiteSpace: "nowrap" }}>{manages && r.status === "REQUESTED" && <>
                  <ActionButton url="/api/fyp/admin" body={{ action: "decideRequisition", groupId: group.id, requisitionId: r.id, status: "APPROVED" }} label="Approve" className="act act-primary" />{" "}
                  <ActionButton url="/api/fyp/admin" body={{ action: "decideRequisition", groupId: group.id, requisitionId: r.id, status: "REJECTED" }} label="Reject" className="act act-danger" askNote="Reason:" />
                </>}{manages && r.status === "APPROVED" && <ActionButton url="/api/fyp/admin" body={{ action: "decideRequisition", groupId: group.id, requisitionId: r.id, status: r.kind === "REIMBURSEMENT" ? "REIMBURSED" : "ISSUED" }} label={r.kind === "REIMBURSEMENT" ? "Mark reimbursed" : "Mark issued"} className="act act-neutral" />}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {(group.supervisorId === user.id || manages) && (
          <ActionForm url="/api/fyp/faculty" fixed={{ action: "requestRequisition", groupId: group.id }} submit="Send request" collapsed openLabel="Request funds or equipment"
            initial={{ kind: "HARDWARE" }} fields={[{ name: "kind", label: "Kind", type: "select", options: Object.entries(REQUISITION_KINDS) }, { name: "item", label: "Item", width: 240 }, { name: "amount", label: "Amount (PKR)", type: "number", width: 120 }, { name: "sponsor", label: "Sponsor (if industry)", width: 180 }, { name: "details", label: "Details", type: "textarea" }]} />
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Extensions</h3>
        {extensions.length === 0 ? <p className="small-note">None.</p> : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{extensions.map((e) => <li key={e.id}><b>{EXTENSIONS[e.kind]?.label}</b> to {day(e.newDueDate)} (was {day(e.previousDue)}), granted by {people.get(e.grantedById)} on {day(e.createdAt)}{e.followUpAt ? `; follow-up panel ${day(e.followUpAt)}` : ""}. {e.reason}</li>)}</ul>
        )}
        {manages && (
          <ActionForm url="/api/fyp/admin" fixed={{ action: "extend", groupId: group.id }} submit="Grant extension" collapsed openLabel="Grant an extension" done="Extension recorded; the Examination Department has been told about the grade hold."
            initial={{ kind: "TWO_WEEKS" }} fields={[{ name: "kind", label: "Length", type: "select", options: Object.entries(EXTENSIONS).map(([k, v]) => [k, v.label]) }, { name: "followUpAt", label: "Follow-up panel", type: "date" }, { name: "reason", label: "Reason", type: "textarea" }]} />
        )}
      </div>

      {(evalRole || manages) && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>High-impact project?</h3>
          <ActionForm url="/api/fyp/faculty" fixed={{ action: "setFlags", groupId: group.id }} submit="Save flags"
            initial={{ publicationFlag: group.publicationFlag, patentFlag: group.patentFlag, incubatorFlag: group.incubatorFlag, flagNote: group.flagNote || "" }}
            fields={[{ name: "publicationFlag", label: "Research paper", type: "checkbox" }, { name: "patentFlag", label: "Patent filing", type: "checkbox" }, { name: "incubatorFlag", label: "Incubator / commercial", type: "checkbox" }, { name: "flagNote", label: "Why", width: 360 }]} />
        </div>
      )}
    </Shell>
  );
}
