import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { ActionButton, ActionForm } from "../../components/fyp/FypClient";
import { departmentsOf, eligibility, fypAccess } from "../../lib/fyp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Final Year Projects" };
const STATUS: Record<string, [string, string]> = {
  SUBMITTED: ["Waiting for the FYP Head", "badge-warn"], APPROVED: ["Approved", "badge-ok"], REVISION: ["Returned for revision", "badge-no"], REJECTED: ["Rejected", "badge-no"], WITHDRAWN: ["Withdrawn", "badge-neutral"],
  PENDING: ["Waiting for you", "badge-warn"], ACCEPTED: ["Accepted", "badge-ok"], DECLINED: ["Declined", "badge-neutral"],
};
const badge = (s: string) => <span className={`badge ${STATUS[s]?.[1] || "badge-neutral"}`}>{STATUS[s]?.[0] || s}</span>;

// Final Year Projects for every faculty member: propose projects, accept student groups, supervise, and examine on panels.
export default async function FypHubPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const acc = await fypAccess(user);
  if (!acc.chairmanId) redirect("/dashboard");
  const tab = ["proposals", "requests", "supervision", "panels"].includes(searchParams.tab || "") ? searchParams.tab! : "proposals";
  let missing = false;
  const load = async () => {
    const myDepts = await departmentsOf(user.id);
    const cycles = await prisma.fypCycle.findMany({ where: { chairmanId: acc.chairmanId }, orderBy: { createdAt: "desc" } });
    const openCycles = cycles.filter((c) => c.status === "OPEN" && (!myDepts.length || myDepts.includes(c.departmentId)));
    const depts = new Map((await prisma.department.findMany({ where: { chairmanId: acc.chairmanId }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
    const proposals = await prisma.fypProposal.findMany({ where: { proposerId: user.id }, orderBy: { createdAt: "desc" } });
    const apps = await prisma.fypApplication.findMany({ where: { proposalId: { in: proposals.map((p) => p.id).concat(["none"]) } }, orderBy: [{ status: "desc" }, { createdAt: "asc" }] });
    // Groups this person supervises or co-supervises.
    const coIds = await (prisma as unknown as Record<string, any>).fypCoSupervisor.findMany({ where: { userId: user.id }, select: { groupId: true } }).then((r: { groupId: string }[]) => r.map((x) => x.groupId)).catch(() => [] as string[]);
    const supervised = await prisma.fypGroup.findMany({ where: { OR: [{ supervisorId: user.id }, { id: { in: coIds.concat(["none"]) } }] }, orderBy: { name: "asc" } });
    const myPanels = await prisma.fypPanelMember.findMany({ where: { userId: user.id }, select: { panelId: true, role: true } });
    const panels = await prisma.fypPanel.findMany({ where: { id: { in: myPanels.map((m) => m.panelId).concat(["none"]) } } });
    const panelGroups = await prisma.fypGroup.findMany({ where: { panelId: { in: panels.map((p) => p.id).concat(["none"]) } }, orderBy: { name: "asc" } });
    const groupIds = Array.from(new Set([...apps.map((a) => a.groupId), ...supervised.map((g) => g.id), ...panelGroups.map((g) => g.id)]));
    const groups = new Map((await prisma.fypGroup.findMany({ where: { id: { in: groupIds.concat(["none"]) } } })).map((g) => [g.id, g]));
    const members = await prisma.fypGroupMember.findMany({ where: { groupId: { in: groupIds.concat(["none"]) }, status: "JOINED" } });
    const students = new Map((await prisma.student.findMany({ where: { id: { in: members.map((m) => m.studentId).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true } } } })).map((s) => [s.id, s]));
    const props = new Map((await prisma.fypProposal.findMany({ where: { id: { in: [...supervised, ...panelGroups].map((g) => g.proposalId).filter((x): x is string => !!x).concat(["none"]) } }, select: { id: true, title: true } })).map((p) => [p.id, p.title]));
    return { cycles, openCycles, depts, proposals, apps, supervised, myPanels, panels, panelGroups, groups, members, students, props };
  };
  let d: Awaited<ReturnType<typeof load>> | null = null;
  try { d = await load(); } catch { missing = true; }
  const cycleById = new Map((d?.cycles || []).map((c) => [c.id, c]));
  const pendingApps = d ? d.apps.filter((a) => a.status === "PENDING").length : 0;
  const managesAny = acc.staff.length > 0 || !!acc.hodDept || acc.isInstituteHead;
  // Profiles of applying groups: the proposer checks standing and prerequisites before accepting.
  const standing = new Map<string, Awaited<ReturnType<typeof eligibility>>>();
  if (d && tab === "requests") for (const a of d.apps.filter((x) => x.status === "PENDING")) {
    const cyc = cycleById.get(d.proposals.find((p) => p.id === a.proposalId)?.cycleId || "");
    for (const m of d.members.filter((x) => x.groupId === a.groupId)) if (cyc && !standing.has(m.studentId)) standing.set(m.studentId, await eligibility(m.studentId, cyc));
  }

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Final Year Projects</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12, maxWidth: 920 }}>
        Propose projects for the FYP Head to approve, accept the student groups that apply, supervise them, and examine groups on the panels you sit on.
      </p>
      {missing && <div className="err">Final Year Projects are not set up in the database yet — run prisma/migration_fyp.sql in Supabase.</div>}
      {managesAny && (
        <div className="card" style={{ borderLeft: "4px solid var(--brass)" }}>
          {acc.staff.map((s) => <div key={s.id} style={{ fontSize: 13 }}>You are <b>{s.role === "HEAD" ? "FYP Head" : "on the FYP Committee"}</b> of {d?.depts.get(s.departmentId) || "your department"}.</div>)}
          {acc.hodDept && <div style={{ fontSize: 13 }}>As the department Chairman you name the FYP Head and sign off FYP results.</div>}
          <Link href="/fyp/manage" className="btn btn-brass btn-sm" style={{ marginTop: 8 }}>Manage FYPs →</Link>
        </div>
      )}
      <nav className="tabs no-print" aria-label="FYP" style={{ marginBottom: 14 }}>
        <Link href="/fyp" className="tab" aria-current={tab === "proposals" ? "page" : undefined}>My proposals</Link>
        <Link href="/fyp?tab=requests" className="tab" aria-current={tab === "requests" ? "page" : undefined}>Group requests{pendingApps ? ` (${pendingApps})` : ""}</Link>
        <Link href="/fyp?tab=supervision" className="tab" aria-current={tab === "supervision" ? "page" : undefined}>My groups{d?.supervised.length ? ` (${d.supervised.length})` : ""}</Link>
        <Link href="/fyp?tab=panels" className="tab" aria-current={tab === "panels" ? "page" : undefined}>My panels{d?.panelGroups.length ? ` (${d.panelGroups.length})` : ""}</Link>
      </nav>

      {d && tab === "proposals" && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Propose a project</h3>
            {d.openCycles.length === 0 ? <p className="small-note">No FYP cycle is open for proposals in your department yet. The FYP Head opens one.</p> : (
              <ActionForm url="/api/fyp/faculty" fixed={{ action: "submitProposal" }} submit="Submit proposal" collapsed openLabel="New proposal" done="Submitted to the FYP Head."
                initial={{ cycleId: d.openCycles[0].id, maxGroups: 1 }}
                fields={[
                  { name: "cycleId", label: "FYP cycle", type: "select", options: d.openCycles.map((c) => [c.id, `${c.title} — ${d!.depts.get(c.departmentId) || ""}`]), width: 260 },
                  { name: "title", label: "Title", width: 360 }, { name: "domain", label: "Domain (e.g. Machine Learning, IoT)", width: 220 }, { name: "maxGroups", label: "Groups it can take", type: "number", width: 90 },
                  { name: "abstract", label: "Abstract", type: "textarea" }, { name: "scope", label: "Scope and deliverables", type: "textarea" },
                  { name: "skills", label: "Domain skills needed", width: 300 }, { name: "hardware", label: "Hardware needed", width: 220 }, { name: "software", label: "Software needed", width: 220 },
                  { name: "outcomes", label: "Learning outcomes (CLOs) this project serves", type: "textarea" }, { name: "societalIssue", label: "Corporate or societal issue it addresses (if any)", type: "textarea" }, { name: "ploNumbers", label: "GAs it maps to", type: "plos", width: 140 },
                ]} />
            )}
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Your proposals</h3>
            {d.proposals.length === 0 ? <p className="small-note">None yet.</p> : d.proposals.map((p) => {
              const accepted = d!.apps.filter((a) => a.proposalId === p.id && a.status === "ACCEPTED").length;
              return (
                <div key={p.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div><b>{p.title}</b> {badge(p.status)} <span className="small-note">{cycleById.get(p.cycleId)?.title}{p.domain ? ` · ${p.domain}` : ""} · {accepted} of {p.maxGroups} group(s){p.ploNumbers.length ? ` · GA ${p.ploNumbers.join(", ")}` : ""}</span></div>
                    {p.status !== "WITHDRAWN" && p.status !== "REJECTED" && accepted === 0 && <ActionButton url="/api/fyp/faculty" body={{ action: "withdrawProposal", proposalId: p.id }} label="Withdraw" className="act act-danger" confirmText="Withdraw this proposal?" />}
                  </div>
                  <p style={{ fontSize: 12.5, margin: "4px 0" }}>{p.abstract}</p>
                  {p.reviewNote && <p style={{ fontSize: 12.5, margin: "4px 0", color: p.status === "APPROVED" ? "var(--sage)" : "var(--rust)" }}><b>FYP Head:</b> {p.reviewNote}</p>}
                  {(p.status === "REVISION" || p.status === "SUBMITTED") && (
                    <ActionForm url="/api/fyp/faculty" fixed={{ action: "submitProposal", proposalId: p.id }} submit={p.status === "REVISION" ? "Resubmit" : "Save changes"} collapsed openLabel={p.status === "REVISION" ? "Revise and resubmit" : "Edit"}
                      initial={{ title: p.title, domain: p.domain || "", abstract: p.abstract, scope: p.scope || "", skills: p.skills || "", hardware: p.hardware || "", software: p.software || "", outcomes: p.outcomes || "", societalIssue: p.societalIssue || "", ploNumbers: p.ploNumbers, maxGroups: p.maxGroups }}
                      fields={[{ name: "title", label: "Title", width: 360 }, { name: "domain", label: "Domain", width: 220 }, { name: "maxGroups", label: "Groups", type: "number", width: 80 }, { name: "abstract", label: "Abstract", type: "textarea" }, { name: "scope", label: "Scope", type: "textarea" }, { name: "skills", label: "Skills", width: 300 }, { name: "hardware", label: "Hardware", width: 220 }, { name: "software", label: "Software", width: 220 }, { name: "outcomes", label: "Learning outcomes", type: "textarea" }, { name: "societalIssue", label: "Corporate / societal issue", type: "textarea" }, { name: "ploNumbers", label: "GAs", type: "plos", width: 140 }]} />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {d && tab === "requests" && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Groups asking to work on your projects</h3>
          {d.apps.length === 0 ? <p className="small-note">No requests yet.</p> : d.apps.map((a) => {
            const g = d!.groups.get(a.groupId), p = d!.proposals.find((x) => x.id === a.proposalId);
            const ms = d!.members.filter((m) => m.groupId === a.groupId);
            return (
              <div key={a.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div><b>{g?.name}</b> for <b>{p?.title}</b> {badge(a.status)}</div>
                  {a.status === "PENDING" && (
                    <span style={{ display: "flex", gap: 6 }}>
                      <ActionButton url="/api/fyp/faculty" body={{ action: "decideApplication", applicationId: a.id, accept: true }} label="Accept and supervise" confirmText={`Accept "${g?.name}"? You become their supervisor.`} />
                      <ActionButton url="/api/fyp/faculty" body={{ action: "decideApplication", applicationId: a.id, accept: false }} label="Decline" className="btn btn-secondary btn-sm" askNote="Reason (shown to the students):" />
                    </span>
                  )}
                </div>
                {a.message && <p style={{ fontSize: 12.5, margin: "4px 0" }}>&ldquo;{a.message}&rdquo;</p>}
                {a.note && <p className="small-note" style={{ margin: "4px 0" }}>{a.note}</p>}
                <table style={{ marginTop: 6 }}>
                  <thead><tr><th>Student</th><th>Program</th><th>CGPA</th><th>Credits earned</th><th>Prerequisites</th></tr></thead>
                  <tbody>{ms.map((m) => { const s = d!.students.get(m.studentId); const st = standing.get(m.studentId); return (
                    <tr key={m.id}><td>{s?.name}<div className="small-note">{s?.rollNumber}{m.studentId === g?.leaderId ? " · leader" : ""}</div></td><td className="small-note">{s?.batch.degreeProgram} — {s?.batch.batchName}</td>
                      <td>{st?.cgpa ?? "—"}</td><td>{st?.earnedCredits ?? "—"}</td><td>{st ? (st.ok ? <span style={{ color: "var(--sage)" }}>Met</span> : <span style={{ color: "var(--rust)" }}>{st.reasons.join("; ")}</span>) : "—"}</td></tr>
                  ); })}</tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {d && (tab === "supervision" || tab === "panels") && (() => {
        const list = tab === "supervision" ? d!.supervised : d!.panelGroups;
        return (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{tab === "supervision" ? "Groups you supervise" : "Groups on your panels"}</h3>
            {tab === "panels" && d!.panels.map((p) => <p key={p.id} className="small-note" style={{ margin: "2px 0" }}><b>{p.name}</b> — {d!.myPanels.find((m) => m.panelId === p.id)?.role === "CHAIR" ? "session chair" : "member"}{p.sessionAt ? ` · ${p.sessionAt.toISOString().slice(0, 16).replace("T", " ")}` : ""}{p.venue ? ` · ${p.venue}` : ""}</p>)}
            {list.length === 0 ? <p className="small-note">None yet.</p> : (
              <table>
                <thead><tr><th>Group</th><th>Project</th><th>Students</th><th>Status</th><th /></tr></thead>
                <tbody>{list.map((g) => (
                  <tr key={g.id}>
                    <td><b>{g.name}</b></td><td>{g.proposalId ? d!.props.get(g.proposalId) : "—"}</td>
                    <td className="small-note">{d!.members.filter((m) => m.groupId === g.id).map((m) => d!.students.get(m.studentId)?.name).join(", ")}</td>
                    <td>{g.atRisk && <span className="badge badge-no">At risk</span>} {g.extendedUntil && <span className="badge badge-warn">Extended to {g.extendedUntil.toISOString().slice(0, 10)}</span>} {!g.atRisk && !g.extendedUntil && <span className="badge badge-ok">{g.status === "COMPLETED" ? "Completed" : "Active"}</span>}</td>
                    <td><Link href={`/fyp/groups/${g.id}`} className="act act-primary">{tab === "panels" ? "Evaluate" : "Open"}</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        );
      })()}
    </Shell>
  );
}
