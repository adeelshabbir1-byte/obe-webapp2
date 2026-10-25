import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { academicRules, canSetRulesNow, examController, RULE_LABELS, RULE_OWNERS } from "../../lib/academicRules";
import { holdsFor } from "../../lib/autoRegister";
import { ActionForm } from "../../components/fyp/FypClient";
import KeyButton from "../../components/KeyButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Academic Rules" };

export default async function AcademicRulesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { extraRoles: true } });
  const setter = await canSetRulesNow({ id: user.id, role: user.role, extraRoles: me?.extraRoles }, chairmanId);
  const [rules, ctrl] = await Promise.all([academicRules(chairmanId), examController(chairmanId)]);
  const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } });
  const staff = user.role === "CHAIRMAN" ? await prisma.user.findMany({ where: { isActive: true, isVisitingPlaceholder: false, OR: [{ managedById: chairmanId }, { managedById: { in: leads.map((l) => l.id) } }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: leads.map((l) => l.id).concat("none") } }, select: { id: true, degreeProgram: true, batchName: true, advisor: { select: { name: true } } } });
  const holds = (await holdsFor({ batchId: { in: batches.map((b) => b.id).concat("none") }, status: "PENDING" })) || [];
  const canRun = setter || ["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "OMC"].includes(user.role);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Academic Rules &amp; Registration</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>
        CGPA limits for warning, probation, holding registration and dismissal review, and the attendance needed to sit the final exam. Set by the
        Controller of Examinations{ctrl ? ` (${ctrl.name})` : " (not named yet)"} or the Dean.
      </p>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Limits</h3>
        {setter ? (
          <ActionForm url="/api/academic-rules" fixed={{ action: "save" }} submit="Save limits" initial={rules as never} fields={RULE_LABELS.map(([k, l]) => ({ name: k, label: l, type: "number" as const, width: 90 }))} />
        ) : (
          <table style={{ fontSize: 13 }}><tbody>{RULE_LABELS.map(([k, l]) => <tr key={k}><td>{l}</td><td><b>{rules[k]}</b></td></tr>)}</tbody></table>
        )}
        <ul className="small-note" style={{ marginBottom: 0 }}>{RULE_LABELS.filter(([, , h]) => h).map(([k, l, h]) => <li key={k}><b>{l}:</b> {h}</li>)}</ul>
      </div>
      {user.role === "CHAIRMAN" && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Controller of Examinations</h3>
          <ActionForm url="/api/academic-rules" fixed={{ action: "controller" }} submit="Save" initial={{ userId: ctrl?.id || "" }} fields={[{ name: "userId", label: "Person", type: "select", options: [["", "— nobody —"], ...staff.map((s) => [s.id, s.name] as [string, string])] }]} />
        </div>
      )}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Automatic registration</h3>
        <p style={{ fontSize: 13, marginTop: 0 }}>Every active student is registered in all courses offered to their batch (it also runs every night). Students with CGPA under {rules.holdCgpa.toFixed(2)} are held for their advisor — unless the advisor has locked a plan for them, which is then registered. A course a student withdrew from is never added back.</p>
        {canRun && <KeyButton url="/api/academic-rules" body={{ action: "register" }} label="Register all batches now" />}
        <p style={{ fontSize: 13, margin: "10px 0 4px" }}><b>{holds.length}</b> student(s) waiting for their advisor:</p>
        {holds.length > 0 && (
          <table style={{ fontSize: 12.5 }}><thead><tr><th>Batch</th><th>Advisor</th><th style={{ textAlign: "center" }}>Waiting</th><th style={{ textAlign: "center" }}>Longest</th></tr></thead>
            <tbody>{batches.filter((b) => holds.some((h) => h.batchId === b.id)).map((b) => { const hs = holds.filter((h) => h.batchId === b.id); const days = Math.max(...hs.map((h) => Math.floor((Date.now() - new Date(h.createdAt).getTime()) / 864e5))); return <tr key={b.id}><td>{b.degreeProgram} — {b.batchName}</td><td>{b.advisor?.name || <span style={{ color: "#C62828" }}>no advisor named</span>}</td><td style={{ textAlign: "center" }}>{hs.length}</td><td style={{ textAlign: "center", color: days > 3 ? "#C62828" : undefined }}>{days} day(s)</td></tr>; })}</tbody>
          </table>
        )}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Who sets which rule</h3>
        <table style={{ fontSize: 12.5 }}><thead><tr><th>Rule</th><th>Set by</th><th></th></tr></thead>
          <tbody>{RULE_OWNERS.map(([r, who, href]) => <tr key={r}><td>{r}</td><td><b>{who}</b></td><td><Link href={href} className="small-note">open</Link></td></tr>)}</tbody>
        </table>
      </div>
    </Shell>
  );
}
