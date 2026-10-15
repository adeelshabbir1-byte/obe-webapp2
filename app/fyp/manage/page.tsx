import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { ActionButton, ActionForm, ExternalLinkForm } from "../../../components/fyp/FypClient";
import { MilestonesEditor, PanelPicker, RenewExternalLink, RubricEditor } from "../../../components/fyp/FypAdminClient";
import { computeResults, cutoffsOf, onlyRoleGaps, EXTENSIONS, facultyOf, fypAccess, MILESTONE_KINDS, panelAvailability, REQUISITION_KINDS } from "../../../lib/fyp";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage Final Year Projects" };
const TABS: [string, string][] = [["setup", "Setup"], ["proposals", "Proposals"], ["groups", "Groups"], ["panels", "Panels"], ["results", "Results"], ["resources", "Budget and flags"]];
const PROPOSAL: Record<string, [string, string]> = { SUBMITTED: ["Waiting for review", "badge-warn"], APPROVED: ["Approved", "badge-ok"], REVISION: ["Returned for revision", "badge-no"], REJECTED: ["Rejected", "badge-no"], WITHDRAWN: ["Withdrawn", "badge-neutral"] };
const RESULT: Record<string, [string, string]> = { CONSOLIDATED: ["Waiting for the Chairman", "badge-warn"], APPROVED: ["Approved · sent to exams", "badge-ok"], RETURNED: ["Returned", "badge-no"], HELD: ["Held (extension)", "badge-warn"] };
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");
const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-US")}`;

// FYP administration for a department: the Chairman names the FYP Head and Committee and signs off results; the Head
// and Committee run the cycle — settings, milestones, rubric, proposal review, groups, panels, consolidation and budget.
export default async function FypManagePage({ searchParams }: { searchParams: { dept?: string; cycle?: string; tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const acc = await fypAccess(user);
  if (!acc.chairmanId) redirect("/dashboard");

  let missing = false;
  const allDepts = await prisma.department.findMany({ where: { chairmanId: acc.chairmanId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const visible = allDepts.filter((d) => acc.manages(d.id) || acc.chairs(d.id));
  if (!visible.length) redirect("/fyp");
  let cycles: Awaited<ReturnType<typeof prisma.fypCycle.findMany>> = [];
  let picked = searchParams.cycle ? await prisma.fypCycle.findFirst({ where: { id: searchParams.cycle, chairmanId: acc.chairmanId } }).catch(() => { missing = true; return null; }) : null;
  const dept = visible.find((d) => d.id === (picked?.departmentId || searchParams.dept)) || visible[0];
  if (picked && picked.departmentId !== dept.id) picked = null;
  if (!missing) cycles = await prisma.fypCycle.findMany({ where: { chairmanId: acc.chairmanId, departmentId: dept.id }, orderBy: { createdAt: "desc" } }).catch(() => { missing = true; return []; });
  const cycle = picked || cycles.find((c) => c.status === "OPEN") || cycles[0] || null;
  const manages = acc.manages(dept.id), chairs = acc.chairs(dept.id);
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "setup";
  const q = (t: string, extra: Record<string, string> = {}) => `/fyp/manage?${new URLSearchParams({ dept: dept.id, ...(cycle ? { cycle: cycle.id } : {}), tab: t, ...extra }).toString()}`;

  const faculty = await facultyOf(acc.chairmanId);
  const facultyName = new Map(faculty.map((f) => [f.id, f.name]));
  const facultyOptions: [string, string][] = faculty.map((f) => [f.id, `${f.name}${f.department ? ` — ${f.department}` : ""}`]);
  const staff = missing ? [] : await prisma.fypStaff.findMany({ where: { departmentId: dept.id }, orderBy: [{ role: "desc" }, { createdAt: "asc" }] });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: staff.map((s) => s.userId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const head = staff.find((s) => s.role === "HEAD");

  // Everything below works on the chosen cycle.
  const groups = cycle ? await prisma.fypGroup.findMany({ where: { cycleId: cycle.id }, orderBy: { name: "asc" } }) : [];
  const groupIds = groups.map((g) => g.id).concat(["none"]);
  const members = cycle ? await prisma.fypGroupMember.findMany({ where: { groupId: { in: groupIds } } }) : [];
  const students = new Map((await prisma.student.findMany({ where: { id: { in: members.map((m) => m.studentId).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true } })).map((s) => [s.id, s]));
  const proposals = cycle ? await prisma.fypProposal.findMany({ where: { cycleId: cycle.id }, orderBy: { createdAt: "asc" } }) : [];
  const proposalTitle = new Map(proposals.map((p) => [p.id, p.title]));
  const panels = cycle ? await prisma.fypPanel.findMany({ where: { cycleId: cycle.id }, orderBy: { name: "asc" } }) : [];
  const panelName = new Map(panels.map((p) => [p.id, p.name]));
  const peopleIds = [...proposals.map((p) => p.proposerId), ...groups.map((g) => g.supervisorId)].filter((x): x is string => !!x);
  const people = new Map((await prisma.user.findMany({ where: { id: { in: peopleIds.concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const ms = cycle && tab === "setup" ? await prisma.fypMilestone.findMany({ where: { cycleId: cycle.id }, orderBy: [{ orderIndex: "asc" }, { dueDate: "asc" }] }) : [];
  const cr = cycle && tab === "setup" ? await prisma.fypRubricCriterion.findMany({ where: { cycleId: cycle.id }, orderBy: { orderIndex: "asc" } }) : [];
  const memberNames = (gid: string) => members.filter((m) => m.groupId === gid && m.status === "JOINED").map((m) => students.get(m.studentId)?.name || "?");

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 2 }}>Manage Final Year Projects</h1>
          <p className="small-note" style={{ margin: 0 }}>
            {dept.name} · FYP Head: {head ? names.get(head.userId) : "not named yet"}
            {manages ? ` · you are ${acc.isHead(dept.id) ? "the FYP Head" : "on the FYP Committee"}` : chairs ? " · you sign off results" : ""}
          </p>
        </div>
        <Link href="/fyp" className="btn btn-secondary btn-sm">My FYP work</Link>
      </div>
      {missing && <div className="err">Final Year Projects are not set up in the database yet — run prisma/migration_fyp.sql in Supabase.</div>}

      {visible.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
          {visible.map((d) => <Link key={d.id} href={`/fyp/manage?dept=${d.id}&tab=${tab}`} className={`btn btn-sm ${d.id === dept.id ? "btn-brass" : "btn-secondary"}`}>{d.name}</Link>)}
        </div>
      )}
      {cycles.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "10px 0" }}>
          <span className="small-note">Cycle:</span>
          {cycles.map((c) => <Link key={c.id} href={`/fyp/manage?cycle=${c.id}&tab=${tab}`} className={`btn btn-sm ${c.id === cycle?.id ? "btn-brass" : "btn-secondary"}`}>{c.title}{c.status === "CLOSED" ? " (closed)" : ""}</Link>)}
        </div>
      )}

      <nav className="tabs no-print" aria-label="FYP management" style={{ marginBottom: 14 }}>
        {TABS.map(([k, t]) => {
          const count = k === "proposals" ? proposals.filter((p) => p.status === "SUBMITTED").length : k === "groups" ? groups.filter((g) => g.atRisk).length : 0;
          return <Link key={k} href={q(k)} className="tab" aria-current={tab === k ? "page" : undefined}>{t}{count ? ` (${count})` : ""}</Link>;
        })}
      </nav>

      {!missing && tab === "setup" && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>FYP Head and Committee</h3>
            <p className="small-note" style={{ marginTop: 0 }}>The department Chairman names the FYP Head — any faculty member — and the committee members who help run the cycle.</p>
            {staff.length === 0 ? <p className="small-note">No one has been named yet.</p> : (
              <table>
                <thead><tr><th>Faculty member</th><th>Role</th><th /></tr></thead>
                <tbody>{staff.map((s) => (
                  <tr key={s.id}>
                    <td>{names.get(s.userId) || "?"}</td>
                    <td>{s.role === "HEAD" ? <span className="badge badge-ok">FYP Head</span> : <span className="badge badge-neutral">Committee</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{chairs && <>
                      {s.role !== "HEAD" && <ActionButton url="/api/fyp/admin" body={{ action: "assignStaff", departmentId: dept.id, userId: s.userId, role: "HEAD" }} label="Make FYP Head" className="act act-primary" confirmText={`Make ${names.get(s.userId)} the FYP Head? The current Head moves to the committee.`} />}{" "}
                      <ActionButton url="/api/fyp/admin" body={{ action: "removeStaff", id: s.id }} label="Remove" className="act act-danger" confirmText="Remove from FYP administration?" />
                    </>}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {chairs && faculty.length > 0 && (
              <ActionForm url="/api/fyp/admin" fixed={{ action: "assignStaff", departmentId: dept.id }} submit="Assign" collapsed openLabel={head ? "Add a committee member / change the Head" : "Name the FYP Head"}
                initial={{ userId: faculty[0].id, role: head ? "COMMITTEE" : "HEAD" }}
                fields={[{ name: "userId", label: "Faculty member", type: "select", options: facultyOptions, width: 320 }, { name: "role", label: "Role", type: "select", options: [["HEAD", "FYP Head"], ["COMMITTEE", "Committee member"]], width: 170 }]} />
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>FYP cycles</h3>
            {cycles.length === 0 && <p className="small-note">No cycle yet. {manages ? "Open one to start taking proposals." : "The FYP Head opens one."}</p>}
            {manages && (
              <ActionForm url="/api/fyp/admin" fixed={{ action: "createCycle", departmentId: dept.id }} submit="Open cycle" collapsed={cycles.length > 0} openLabel="Open a new cycle"
                initial={{ title: `FYP ${new Date().getFullYear()}-${String((new Date().getFullYear() + 1) % 100).padStart(2, "0")}`, termName: "Fall", termYear: new Date().getFullYear() }}
                fields={[{ name: "title", label: "Name", width: 220 }, { name: "termName", label: "Result term", type: "select", options: [["Fall", "Fall"], ["Spring", "Spring"]], width: 110 }, { name: "termYear", label: "Year", type: "number", width: 90 }]}
                done="Cycle opened with the default milestones and rubric — adjust them below." />
            )}
          </div>

          {cycle && (
            <>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>{cycle.title} — rules</h3>
                {manages ? (
                  <ActionForm url="/api/fyp/admin" fixed={{ action: "updateCycle", cycleId: cycle.id }} submit="Save rules" done="Saved."
                    initial={{
                      title: cycle.title, status: cycle.status, termName: cycle.termName, termYear: cycle.termYear, courseCode: cycle.courseCode, courseTitle: cycle.courseTitle, creditHours: cycle.creditHours,
                      supervisorPct: cycle.supervisorPct, internalPct: cycle.internalPct, externalPct: cycle.externalPct, minGroupSize: cycle.minGroupSize, maxGroupSize: cycle.maxGroupSize,
                      minCgpa: cycle.minCgpa, minCreditHours: cycle.minCreditHours, maxApplications: cycle.maxApplications, cutoffs: cutoffsOf(cycle).map((c) => `${c.letter} ${c.minPct}`).join(", "),
                    }}
                    fields={[
                      { name: "title", label: "Name", width: 200 }, { name: "status", label: "Status", type: "select", options: [["OPEN", "Open"], ["CLOSED", "Closed"]], width: 100 },
                      { name: "termName", label: "Result term", type: "select", options: [["Fall", "Fall"], ["Spring", "Spring"]], width: 100 }, { name: "termYear", label: "Year", type: "number", width: 80 },
                      { name: "courseCode", label: "Transcript code", width: 110 }, { name: "courseTitle", label: "Transcript title", width: 220 }, { name: "creditHours", label: "Credits", type: "number", width: 70 },
                      { name: "supervisorPct", label: "Supervisor %", type: "number", width: 90 }, { name: "internalPct", label: "Internal panel %", type: "number", width: 100 }, { name: "externalPct", label: "External panel %", type: "number", width: 100 },
                      { name: "minGroupSize", label: "Min group", type: "number", width: 80 }, { name: "maxGroupSize", label: "Max group", type: "number", width: 80 },
                      { name: "minCgpa", label: "Min CGPA", type: "number", width: 80 }, { name: "minCreditHours", label: "Min credits earned", type: "number", width: 110 }, { name: "maxApplications", label: "Applications per group", type: "number", width: 130 },
                      { name: "cutoffs", label: "Grade cut-offs (letter and minimum %)", width: 420 },
                    ]} />
                ) : (
                  <p className="small-note">Supervisor {cycle.supervisorPct}% · internal panel {cycle.internalPct}% · external panel {cycle.externalPct}% · groups of {cycle.minGroupSize}–{cycle.maxGroupSize} · CGPA ≥ {cycle.minCgpa}, {cycle.minCreditHours}+ credits · posted as {cycle.courseCode} {cycle.courseTitle} ({cycle.creditHours} cr), {cycle.termName} {cycle.termYear}.</p>
                )}
              </div>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Milestones</h3>
                {(() => {
                  if (!manages) return <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{ms.map((m) => <li key={m.id}>{m.title} — {day(m.dueDate)}{m.weightPct ? ` · ${m.weightPct}%` : ""}</li>)}</ul>;
                  return <MilestonesEditor cycleId={cycle.id} kinds={MILESTONE_KINDS} initial={ms.map((m) => ({ id: m.id, kind: m.kind, title: m.title, dueDate: day(m.dueDate), weightPct: m.weightPct }))} />;
                })()}
              </div>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Evaluation rubric</h3>
                <p className="small-note" style={{ marginTop: 0 }}>Each criterion is tied to a Bloom level (C = cognitive, P = psychomotor, A = affective) and a PLO, so the scores feed the students&apos; PLO attainment.</p>
                {(() => {
                  if (!manages) return <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{cr.map((c) => <li key={c.id}>{c.name} — {c.bloomLevel || "—"} · PLO-{c.ploNumber ?? "—"} · out of {c.maxScore} · {c.appliesTo === "GROUP" ? "whole group" : "per student"}</li>)}</ul>;
                  return <RubricEditor cycleId={cycle.id} initial={cr.map((c) => ({ id: c.id, name: c.name, description: c.description, bloomLevel: c.bloomLevel, ploNumber: c.ploNumber, maxScore: c.maxScore, appliesTo: c.appliesTo }))} />;
                })()}
              </div>
            </>
          )}
        </>
      )}

      {!missing && !cycle && tab !== "setup" && <div className="card"><p className="small-note" style={{ margin: 0 }}>No FYP cycle yet — open one on the Setup tab.</p></div>}

      {!missing && cycle && tab === "proposals" && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Proposals</h3>
          {proposals.length === 0 ? <p className="small-note">No proposals yet. Faculty submit them from Final Year Projects → My proposals.</p> : (
            [...proposals].sort((a, b) => Number(b.status === "SUBMITTED") - Number(a.status === "SUBMITTED")).map((p) => {
              const taken = groups.filter((g) => g.proposalId === p.id).length;
              return (
                <div key={p.id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <b>{p.title}</b> <span className={`badge ${PROPOSAL[p.status]?.[1] || "badge-neutral"}`}>{PROPOSAL[p.status]?.[0] || p.status}</span>
                      <div className="small-note">{people.get(p.proposerId) || "?"}{p.domain ? ` · ${p.domain}` : ""} · {taken} of {p.maxGroups} group(s){p.ploNumbers.length ? ` · PLO ${p.ploNumbers.join(", ")}` : ""} · submitted {day(p.updatedAt)}</div>
                    </div>
                    {manages && (p.status === "SUBMITTED" || p.status === "REVISION") && (
                      <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <ActionButton url="/api/fyp/admin" body={{ action: "reviewProposal", proposalId: p.id, status: "APPROVED" }} label="Approve" askNote="Note for the proposer (optional):" />
                        <ActionButton url="/api/fyp/admin" body={{ action: "reviewProposal", proposalId: p.id, status: "REVISION" }} label="Return for revision" className="btn btn-secondary btn-sm" askNote="What should be revised?" noteRequired />
                        <ActionButton url="/api/fyp/admin" body={{ action: "reviewProposal", proposalId: p.id, status: "REJECTED" }} label="Reject" className="act act-danger" askNote="Why is it rejected?" noteRequired />
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, margin: "6px 0" }}>{p.abstract}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, fontSize: 12.5 }}>
                    {p.scope && <div><b>Scope</b><div style={{ whiteSpace: "pre-wrap" }}>{p.scope}</div></div>}
                    {p.skills && <div><b>Skills</b><div>{p.skills}</div></div>}
                    {p.hardware && <div><b>Hardware</b><div>{p.hardware}</div></div>}
                    {p.software && <div><b>Software</b><div>{p.software}</div></div>}
                    {p.outcomes && <div><b>Learning outcomes</b><div style={{ whiteSpace: "pre-wrap" }}>{p.outcomes}</div></div>}
                  </div>
                  {p.reviewNote && <p className="small-note" style={{ margin: "6px 0 0" }}>Review note: {p.reviewNote}</p>}
                </div>
              );
            })
          )}
        </div>
      )}

      {!missing && cycle && tab === "groups" && (await (async () => {
        const artifacts = await prisma.fypArtifact.findMany({ where: { groupId: { in: groupIds } }, select: { groupId: true, kind: true, similarityPct: true, createdAt: true }, orderBy: { createdAt: "desc" } });
        const pendingApps = await prisma.fypApplication.groupBy({ by: ["groupId"], where: { groupId: { in: groupIds }, status: "PENDING" }, _count: true });
        const active = groups.filter((g) => g.status !== "FORMING"), forming = groups.filter((g) => g.status === "FORMING");
        return (
          <>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Project groups ({active.length})</h3>
              {active.length === 0 ? <p className="small-note">No group has been accepted by a supervisor yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Group</th><th>Project · supervisor</th><th>Panel</th><th>Thesis readiness</th><th>Status</th><th /></tr></thead>
                    <tbody>{active.map((g) => {
                      const a = artifacts.filter((x) => x.groupId === g.id);
                      const sim = a.find((x) => x.kind === "SIMILARITY_REPORT");
                      return (
                        <tr key={g.id}>
                          <td><b>{g.name}</b><div className="small-note">{memberNames(g.id).join(", ")}</div></td>
                          <td>{g.proposalId ? proposalTitle.get(g.proposalId) : "—"}<div className="small-note">{g.supervisorId ? people.get(g.supervisorId) : "no supervisor"}</div></td>
                          <td>{manages ? <PanelPicker cycleId={cycle.id} groupId={g.id} panelId={g.panelId} panels={panels.map((p) => ({ id: p.id, name: p.name }))} /> : g.panelId ? panelName.get(g.panelId) : "—"}</td>
                          <td className="small-note">Draft {a.some((x) => x.kind === "THESIS_DRAFT") ? "✓" : "✗"} · similarity {sim ? <span style={{ color: (sim.similarityPct ?? 0) > 19 ? "var(--rust)" : undefined }}>{sim.similarityPct ?? "?"}%</span> : "✗"} · repo {a.some((x) => x.kind === "REPOSITORY") ? "✓" : "✗"}</td>
                          <td>
                            {g.atRisk && <span className="badge badge-no">At risk</span>} {g.extendedUntil && <span className="badge badge-warn">Extended to {day(g.extendedUntil)}</span>}
                            {!g.atRisk && !g.extendedUntil && <span className="badge badge-ok">{g.status === "COMPLETED" ? "Completed" : "On track"}</span>}
                            {(g.publicationFlag || g.patentFlag || g.incubatorFlag) && <div className="small-note">★ {[g.publicationFlag && "paper", g.patentFlag && "patent", g.incubatorFlag && "incubator"].filter(Boolean).join(", ")}</div>}
                          </td>
                          <td><Link href={`/fyp/groups/${g.id}`} className="act act-primary">Open</Link></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}
              <p className="small-note" style={{ marginBottom: 0 }}>Similarity above 19% is shown in red. Extensions, early-warning follow-up and requests are handled on each group&apos;s page.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Groups still forming ({forming.length})</h3>
              {forming.length === 0 ? <p className="small-note">None.</p> : (
                <table>
                  <thead><tr><th>Group</th><th>Members</th><th>Invitations open</th><th>Applications pending</th></tr></thead>
                  <tbody>{forming.map((g) => <tr key={g.id}><td>{g.name}</td><td className="small-note">{memberNames(g.id).join(", ")}</td><td>{members.filter((m) => m.groupId === g.id && m.status === "INVITED").length}</td><td>{pendingApps.find((x) => x.groupId === g.id)?._count || 0}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          </>
        );
      })())}

      {!missing && cycle && tab === "panels" && (await (async () => {
        const pm = await prisma.fypPanelMember.findMany({ where: { panelId: { in: panels.map((p) => p.id).concat(["none"]) } }, orderBy: { role: "asc" } });
        const externals = await prisma.fypExternal.findMany({ where: { cycleId: cycle.id }, orderBy: { name: "asc" } });
        const extName = new Map(externals.map((x) => [x.id, `${x.name}${x.organization ? ` (${x.organization})` : ""}`]));
        const unavailable = new Map(await Promise.all(panels.map(async (p) => [p.id, await panelAvailability(p.id)] as const)));
        const unassigned = groups.filter((g) => g.status === "ACTIVE" && !g.panelId).length;
        return (
          <>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Evaluation panels</h3>
                {manages && panels.length > 0 && (
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {unassigned > 0 && <ActionButton url="/api/fyp/admin" body={{ action: "autoAssign", cycleId: cycle.id, onlyUnassigned: true }} label={`Auto-assign ${unassigned} unassigned group(s)`} done="Assigned." />}
                    <ActionButton url="/api/fyp/admin" body={{ action: "autoAssign", cycleId: cycle.id, onlyUnassigned: false }} label="Re-map all groups" className="btn btn-secondary btn-sm" confirmText="Re-map every active group to a panel? Current assignments change." done="Re-mapped." />
                  </span>
                )}
              </div>
              <p className="small-note">Auto-assignment never puts a group before a panel its own supervisor sits on, prefers panels whose domain matches the project, avoids panels with a member unavailable at the session time, and keeps the load even.</p>
              {panels.length === 0 && <p className="small-note">No panels yet.</p>}
              {panels.map((p) => {
                const here = pm.filter((m) => m.panelId === p.id);
                const pg = groups.filter((g) => g.panelId === p.id);
                const away = unavailable.get(p.id) || [];
                const conflicts = pg.filter((g) => g.supervisorId && here.some((m) => m.userId === g.supervisorId));
                return (
                  <div key={p.id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div><b>{p.name}</b>{p.domain ? <span className="small-note"> · {p.domain}</span> : null}<div className="small-note">{p.sessionAt ? p.sessionAt.toISOString().slice(0, 16).replace("T", " ") : "no session time"}{p.venue ? ` · ${p.venue}` : ""} · {pg.length} group(s): {pg.map((g) => g.name).join(", ") || "none"}</div></div>
                      {manages && <ActionButton url="/api/fyp/admin" body={{ action: "deletePanel", cycleId: cycle.id, panelId: p.id }} label="Delete panel" className="act act-danger" confirmText="Delete this panel? Its groups become unassigned." />}
                    </div>
                    {away.length > 0 && <div className="small-note" style={{ color: "var(--rust)" }}>Unavailable at the session time: {away.map((id) => facultyName.get(id) || "?").join(", ")}.</div>}
                    {conflicts.length > 0 && <div className="small-note" style={{ color: "var(--rust)" }}>Conflict: the supervisor of {conflicts.map((g) => g.name).join(", ")} sits on this panel.</div>}
                    <table style={{ marginTop: 6 }}>
                      <tbody>{here.map((m) => (
                        <tr key={m.id}>
                          <td>{m.userId ? facultyName.get(m.userId) || "?" : extName.get(m.externalId || "") || "?"}</td>
                          <td>{m.role === "CHAIR" ? "Session chair" : m.role === "EXTERNAL" ? "External examiner" : "Internal examiner"}</td>
                          <td>{manages && <ActionButton url="/api/fyp/admin" body={{ action: "removePanelMember", cycleId: cycle.id, memberId: m.id }} label="Remove" className="act act-danger" />}</td>
                        </tr>
                      ))}{here.length === 0 && <tr><td className="small-note" colSpan={3}>No members yet.</td></tr>}</tbody>
                    </table>
                    {manages && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {faculty.length > 0 && <ActionForm url="/api/fyp/admin" fixed={{ action: "addPanelMember", cycleId: cycle.id, panelId: p.id }} submit="Add" collapsed openLabel="Add a faculty member"
                          initial={{ userId: faculty[0].id, role: here.some((m) => m.role === "CHAIR") ? "INTERNAL" : "CHAIR" }}
                          fields={[{ name: "userId", label: "Faculty member", type: "select", options: facultyOptions, width: 280 }, { name: "role", label: "As", type: "select", options: [["CHAIR", "Session chair"], ["INTERNAL", "Internal examiner"]], width: 160 }]} />}
                        {externals.length > 0 && <ActionForm url="/api/fyp/admin" fixed={{ action: "addPanelMember", cycleId: cycle.id, panelId: p.id, role: "EXTERNAL" }} submit="Add" collapsed openLabel="Add an external examiner"
                          initial={{ externalId: externals[0].id }} fields={[{ name: "externalId", label: "External evaluator", type: "select", options: externals.map((x) => [x.id, extName.get(x.id)!]), width: 280 }]} />}
                        <ActionForm url="/api/fyp/admin" fixed={{ action: "savePanel", cycleId: cycle.id, panelId: p.id }} submit="Save" collapsed openLabel="Edit panel"
                          initial={{ name: p.name, domain: p.domain || "", venue: p.venue || "", sessionAt: p.sessionAt ? p.sessionAt.toISOString().slice(0, 16) : "" }}
                          fields={[{ name: "name", label: "Name" }, { name: "domain", label: "Domain", width: 220 }, { name: "venue", label: "Venue" }, { name: "sessionAt", label: "Session", type: "datetime-local", width: 200 }]} />
                      </div>
                    )}
                  </div>
                );
              })}
              {manages && (
                <ActionForm url="/api/fyp/admin" fixed={{ action: "savePanel", cycleId: cycle.id }} submit="Create panel" collapsed openLabel="New panel"
                  fields={[{ name: "name", label: "Name", placeholder: "Panel A" }, { name: "domain", label: "Domain (e.g. AI, Networks)", width: 220 }, { name: "venue", label: "Venue" }, { name: "sessionAt", label: "Session", type: "datetime-local", width: 200 }]} />
              )}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>External and industry evaluators</h3>
              <p className="small-note" style={{ marginTop: 0 }}>Each external evaluator gets a private link that opens only the score sheets of their panel&apos;s groups — no account is needed.</p>
              {externals.length > 0 && (
                <table>
                  <thead><tr><th>Evaluator</th><th>Expertise</th><th>Link valid until</th><th /></tr></thead>
                  <tbody>{externals.map((x) => (
                    <tr key={x.id}>
                      <td>{x.name}<div className="small-note">{[x.designation, x.organization, x.email].filter(Boolean).join(" · ")}</div></td>
                      <td className="small-note">{x.expertise || "—"}</td>
                      <td>{day(x.expiresAt)}{x.expiresAt < new Date() && <span className="badge badge-no" style={{ marginLeft: 6 }}>expired</span>}</td>
                      <td>{manages && <RenewExternalLink cycleId={cycle.id} externalId={x.id} />}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              {manages && <ExternalLinkForm cycleId={cycle.id} />}
            </div>
          </>
        );
      })())}

      {!missing && cycle && tab === "results" && (await (async () => {
        const { rows, passPct } = await computeResults(cycle.id);
        const saved = new Map((await prisma.fypResult.findMany({ where: { cycleId: cycle.id } })).map((r) => [r.studentId, r]));
        const heads = rows[0]?.byMilestone || [];
        const waiting = Array.from(saved.values()).filter((r) => r.status === "CONSOLIDATED").length;
        const roleGaps = rows.filter((r) => onlyRoleGaps(r) && saved.get(r.studentId)?.status !== "APPROVED" && saved.get(r.studentId)?.status !== "CONSOLIDATED").length;
        const returned = Array.from(saved.values()).filter((r) => r.status === "RETURNED");
        const ploAgg = new Map<string, { sum: number; n: number; pass: number }>();
        for (const r of rows) for (const p of r.plo) { const e = ploAgg.get(p.label) || { sum: 0, n: 0, pass: 0 }; e.sum += p.pct; e.n++; if (p.passed) e.pass++; ploAgg.set(p.label, e); }
        return (
          <>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Results</h3>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {manages && <ActionButton url="/api/fyp/admin" body={{ action: "consolidate", cycleId: cycle.id }} label="Consolidate results" confirmText="Freeze the results of every student whose evaluation is complete and send them to the Chairman?" done="Consolidated and sent to the Chairman for sign-off." />}
                  {manages && roleGaps > 0 && <ActionButton url="/api/fyp/admin" body={{ action: "consolidate", cycleId: cycle.id, allowRoleGaps: true }} label={`Also consolidate ${roleGaps} with an evaluator role missing`} className="btn btn-secondary btn-sm" confirmText={`${roleGaps} student(s) have every milestone scored but miss an evaluator role (for example no external at the mid-term). Their missing role's share will be spread over the evaluators who scored, and the result will say so. Continue?`} done="Consolidated." />}
                  {chairs && waiting > 0 && <>
                    <ActionButton url="/api/fyp/admin" body={{ action: "signOff", cycleId: cycle.id, approve: true }} label={`Approve ${waiting} and submit to exams`} confirmText={`Approve ${waiting} result(s)? They are posted to the transcripts and sent to the Examination Department.`} done="Approved and submitted." />
                    <ActionButton url="/api/fyp/admin" body={{ action: "signOff", cycleId: cycle.id, approve: false }} label="Return to the FYP Head" className="btn btn-secondary btn-sm" askNote="What needs to change?" noteRequired />
                  </>}
                </span>
              </div>
              <p className="small-note">
                Each milestone combines the supervisor ({cycle.supervisorPct}%), internal panel ({cycle.internalPct}%) and external panel ({cycle.externalPct}%) scores; milestones are then weighted. Several evaluators in one role are averaged.
                {chairs && !manages ? " You sign off the consolidated results." : ""}
              </p>
              {returned.length > 0 && <div className="err">Returned by the Chairman: {returned[0].note}</div>}
              {rows.length === 0 ? <p className="small-note">No active groups yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Student</th><th>Group</th>{heads.map((m) => <th key={m.milestoneId}>{m.title} ({m.weightPct}%)</th>)}<th>Total</th><th>Grade</th><th>Status</th></tr></thead>
                    <tbody>{rows.map((r) => {
                      const s = saved.get(r.studentId);
                      return (
                        <tr key={r.studentId}>
                          <td>{r.name}<div className="small-note">{r.rollNumber}</div></td>
                          <td><Link href={`/fyp/groups/${r.groupId}`}>{r.groupName}</Link></td>
                          {r.byMilestone.map((x) => <td key={x.milestoneId}>{x.pct ?? "—"}</td>)}
                          <td><b>{r.totalPct ?? "—"}</b></td>
                          <td>{s ? s.grade : r.grade || "—"}</td>
                          <td>{s ? <span className={`badge ${RESULT[s.status]?.[1] || "badge-neutral"}`}>{RESULT[s.status]?.[0] || s.status}</span> : r.complete ? <span className="badge badge-neutral">Ready</span> : <span className="small-note" style={{ color: "var(--rust)" }}>Missing: {r.missing.slice(0, 2).join("; ")}{r.missing.length > 2 ? "…" : ""}</span>}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}
            </div>
            {ploAgg.size > 0 && (
              <div className="card">
                <h3 style={{ marginTop: 0 }}>PLO attainment from the FYP</h3>
                <table>
                  <thead><tr><th>PLO</th><th>Average</th><th>Students attaining (≥ {passPct}%)</th></tr></thead>
                  <tbody>{Array.from(ploAgg.entries()).sort((a, b) => Number(a[0].slice(4)) - Number(b[0].slice(4))).map(([k, e]) => <tr key={k}><td>{k}</td><td>{Math.round((e.sum / e.n) * 10) / 10}%</td><td>{e.pass} of {e.n}</td></tr>)}</tbody>
                </table>
                <p className="small-note" style={{ marginBottom: 0 }}>Once signed off, these feed each student&apos;s transcript and OBE dashboard.</p>
              </div>
            )}
          </>
        );
      })())}

      {!missing && cycle && tab === "resources" && (await (async () => {
        const reqs = await prisma.fypRequisition.findMany({ where: { groupId: { in: groupIds } }, orderBy: { createdAt: "desc" } });
        const exts = await prisma.fypExtension.findMany({ where: { groupId: { in: groupIds } }, orderBy: { createdAt: "desc" } });
        const gname = new Map(groups.map((g) => [g.id, g.name]));
        const sum = (st: string[]) => reqs.filter((r) => st.includes(r.status)).reduce((n, r) => n + (r.amount || 0), 0);
        const flagged = groups.filter((g) => g.publicationFlag || g.patentFlag || g.incubatorFlag);
        return (
          <>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Budget and hardware requisitions</h3>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, marginBottom: 8 }}>
                <span>Requested: <b>{pkr(sum(["REQUESTED"]))}</b></span><span>Approved: <b>{pkr(sum(["APPROVED"]))}</b></span><span>Issued / reimbursed: <b>{pkr(sum(["ISSUED", "REIMBURSED"]))}</b></span>
                <span>Industry-sponsored: <b>{reqs.filter((r) => r.sponsor).length}</b></span>
              </div>
              {reqs.length === 0 ? <p className="small-note">No requests yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Group</th><th>Request</th><th>Amount</th><th>Sponsor</th><th>Status</th><th /></tr></thead>
                    <tbody>{reqs.map((r) => (
                      <tr key={r.id}>
                        <td><Link href={`/fyp/groups/${r.groupId}`}>{gname.get(r.groupId)}</Link></td>
                        <td><b>{r.item}</b><div className="small-note">{REQUISITION_KINDS[r.kind] || r.kind}{r.details ? ` · ${r.details}` : ""}</div></td>
                        <td>{r.amount !== null ? pkr(r.amount) : "—"}</td><td>{r.sponsor || "Institute"}</td>
                        <td><span className="badge badge-neutral">{r.status.toLowerCase()}</span>{r.note && <div className="small-note">{r.note}</div>}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{manages && r.status === "REQUESTED" && <>
                          <ActionButton url="/api/fyp/admin" body={{ action: "decideRequisition", groupId: r.groupId, requisitionId: r.id, status: "APPROVED" }} label="Approve" className="act act-primary" />{" "}
                          <ActionButton url="/api/fyp/admin" body={{ action: "decideRequisition", groupId: r.groupId, requisitionId: r.id, status: "REJECTED" }} label="Reject" className="act act-danger" askNote="Reason:" />
                        </>}{manages && r.status === "APPROVED" && <ActionButton url="/api/fyp/admin" body={{ action: "decideRequisition", groupId: r.groupId, requisitionId: r.id, status: r.kind === "REIMBURSEMENT" ? "REIMBURSED" : "ISSUED" }} label={r.kind === "REIMBURSEMENT" ? "Mark reimbursed" : "Mark issued"} className="act act-neutral" />}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>High-impact projects</h3>
              {flagged.length === 0 ? <p className="small-note">No project has been flagged for a paper, patent or incubation yet.</p> : (
                <table>
                  <thead><tr><th>Group</th><th>Project</th><th>Flag</th><th>Why</th></tr></thead>
                  <tbody>{flagged.map((g) => <tr key={g.id}><td><Link href={`/fyp/groups/${g.id}`}>{g.name}</Link></td><td>{g.proposalId ? proposalTitle.get(g.proposalId) : "—"}</td><td>{[g.publicationFlag && "Research paper", g.patentFlag && "Patent", g.incubatorFlag && "Incubator"].filter(Boolean).join(", ")}</td><td className="small-note">{g.flagNote || "—"}</td></tr>)}</tbody>
                </table>
              )}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Extensions</h3>
              {exts.length === 0 ? <p className="small-note">None.</p> : (
                <table>
                  <thead><tr><th>Group</th><th>Extension</th><th>New deadline</th><th>Follow-up panel</th><th>Reason</th></tr></thead>
                  <tbody>{exts.map((e) => <tr key={e.id}><td><Link href={`/fyp/groups/${e.groupId}`}>{gname.get(e.groupId)}</Link></td><td>{EXTENSIONS[e.kind]?.label || e.kind}</td><td>{day(e.newDueDate)}</td><td>{day(e.followUpAt)}</td><td className="small-note">{e.reason}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          </>
        );
      })())}
    </Shell>
  );
}
