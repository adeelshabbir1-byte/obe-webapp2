import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor, coordinatorIdsFor } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { ActionButton, ActionForm } from "../../../components/fyp/FypClient";
import { breachesFor, rulesOf, TYPES } from "../../../lib/assessmentRules";
import OmcLimitsSection from "../../../components/OmcLimitsSection";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Assessment rules" };
const VIEW = ["OMC", "CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"];

export default async function AssessmentRulesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!VIEW.includes(user.role)) redirect("/dashboard");
  const chairmanId = await chairmanIdFor(user);
  const canEdit = ["OMC", "CHAIRMAN"].includes(user.role);
  const canDecide = ["OMC", "HEAD_OF_DEPARTMENT"].includes(user.role);
  const leads = ["OMC", "CHAIRMAN"].includes(user.role) ? (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((u) => u.id) : await coordinatorIdsFor(user);
  const [rules, breaches] = await Promise.all([rulesOf(chairmanId), breachesFor(leads).catch(() => [])]);
  const programs = Array.from(new Set((await prisma.batch.findMany({ where: { coordinatorId: { in: leads.concat(["none"]) } }, select: { degreeProgram: true } })).map((b) => b.degreeProgram))).sort();
  const fields = [
    { name: "label", label: "Name (optional)", width: 220 },
    { name: "types", label: `Types (comma): ${TYPES.join(", ")}`, width: 260 },
    { name: "level", label: "Applies to", type: "select" as const, options: [["COURSE", "the course total"], ["CLO", "each CLO's marks"]] as [string, string][] },
    { name: "minPct", label: "Min %", type: "number" as const, width: 80 },
    { name: "maxPct", label: "Max %", type: "number" as const, width: 80 },
    { name: "courseKind", label: "Courses", type: "select" as const, options: [["ALL", "All"], ["THEORY", "Theory only"], ["LAB", "Lab only"]] as [string, string][] },
    { name: "program", label: "Program", type: "select" as const, options: [["", "All programs"] as [string, string], ...programs.map((p) => [p, p] as [string, string])] },
  ];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Assessment Rules</h1>
      <p className="small-note" style={{ maxWidth: 900 }}>Limits on how much each type of assessment may count — for the course total or for each CLO&apos;s marks (e.g. &quot;Quiz + Assignment at most 25% of each CLO&quot;, &quot;Final at least 40%&quot;). A plan outside a rule can still be saved, but it needs the OMC&apos;s or the HOD&apos;s approval; the course expert and the teacher see this on their assessment plan.</p>
      <div className="card" style={{ overflowX: "auto" }}>
        <b>Rules</b>
        {rules.length === 0 ? <p className="small-note">No rules yet.</p> : (
          <table style={{ fontSize: 13, marginTop: 6 }}><thead><tr><th>Rule</th><th>Types</th><th>Applies to</th><th>Limit</th><th>Courses</th>{canEdit && <th></th>}</tr></thead>
            <tbody>{rules.map((r) => <tr key={r.id}><td>{r.label}</td><td>{r.types.join(" + ")}</td><td>{r.level === "CLO" ? "each CLO" : "course total"}</td><td>{[r.minPct !== null ? `≥ ${r.minPct}%` : "", r.maxPct !== null ? `≤ ${r.maxPct}%` : ""].filter(Boolean).join(" and ")}</td><td>{r.courseKind === "ALL" ? "all" : r.courseKind.toLowerCase()}{r.program ? ` · ${r.program}` : ""}</td>
              {canEdit && <td style={{ whiteSpace: "nowrap" }}><ActionForm url="/api/omc/assessment-rules" fixed={{ action: "save", id: r.id }} submit="Save" collapsed openLabel="Edit" initial={{ label: r.label, types: r.types.join(", "), level: r.level, minPct: r.minPct ?? "", maxPct: r.maxPct ?? "", courseKind: r.courseKind, program: r.program || "" }} fields={fields} /> <ActionButton url="/api/omc/assessment-rules" body={{ action: "delete", id: r.id }} label="Delete" className="btn btn-secondary btn-sm" confirmText="Delete this rule?" /></td>}</tr>)}</tbody></table>
        )}
        {canEdit && <div style={{ marginTop: 8 }}><ActionForm url="/api/omc/assessment-rules" fixed={{ action: "save" }} submit="Add rule" collapsed openLabel="+ Add a rule" initial={{ level: "CLO", courseKind: "ALL", types: "Quiz, Assignment", maxPct: "25" }} fields={fields} /></div>}
      </div>
      <OmcLimitsSection chairmanId={chairmanId} me={user.realUserId || user.id} canAct={user.role === "OMC"} />
      <div className="card" style={{ overflowX: "auto" }}>
        <b>Courses outside the rules ({breaches.length})</b>
        {breaches.length === 0 ? <p className="small-note">None this semester.</p> : (
          <table style={{ fontSize: 12.5, marginTop: 6 }}><thead><tr><th>Course</th><th>Plan</th><th>Rule</th><th>Where</th><th>Now</th><th>Status</th>{canDecide && <th></th>}</tr></thead>
            <tbody>{breaches.flatMap((c) => c.breaches.map((x, i) => (
              <tr key={c.courseId + c.source + x.ruleId + x.scope}>
                <td>{i === 0 ? c.label : ""}</td><td>{i === 0 ? (c.source === "SE" ? "course expert" : "teacher") : ""}</td><td>{x.rule}</td><td>{x.scope}</td><td>{x.value}% <span className="small-note">({x.limit})</span></td>
                <td style={{ fontWeight: 600, color: x.status === "APPROVED" ? "#23894f" : x.status === "REJECTED" ? "#c93c3c" : "#c98a0b" }}>{x.status === "PENDING" ? "needs approval" : x.status.toLowerCase()}{x.decidedBy ? <span className="small-note"> · {x.decidedBy}</span> : null}</td>
                {canDecide && <td style={{ whiteSpace: "nowrap" }}>{x.status !== "APPROVED" && <ActionButton url="/api/omc/assessment-rules" body={{ action: "decide", courseId: c.courseId, source: c.source, ruleId: x.ruleId, scope: x.scope, approve: true }} label="Approve" />} {x.status !== "REJECTED" && <ActionButton url="/api/omc/assessment-rules" body={{ action: "decide", courseId: c.courseId, source: c.source, ruleId: x.ruleId, scope: x.scope, approve: false }} label="Reject" className="btn btn-secondary btn-sm" askNote="What should change? (shown to the teacher)" />}</td>}
              </tr>)))}</tbody></table>
        )}
      </div>
    </Shell>
  );
}
