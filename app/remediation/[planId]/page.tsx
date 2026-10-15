import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { getPassingCriteria } from "../../../lib/passingCriteria";
import Shell from "../../../components/Shell";
import InlineScore from "../../../components/InlineScore";
import { ActionButton, ActionForm } from "../../../components/fyp/FypClient";
import { canManagePlan, money, PLAN_STATUS, remediationScope, REMEDIATION_KINDS } from "../../../lib/remediation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Remediation plan" };
const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-US")}`;
const API = "/api/remediation";
const RESULT: Record<string, [string, string]> = { ENROLLED: ["Enrolled", "badge-neutral"], CLEARED: ["Cleared", "badge-ok"], NOT_CLEARED: ["Not cleared", "badge-no"], WITHDRAWN: ["Withdrawn", "badge-neutral"] };

export default async function RemediationPlanPage({ params }: { params: { planId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const scope = await remediationScope(user);
  const plan = await prisma.remediationPlan.findUnique({ where: { id: params.planId } }).catch(() => null);
  if (!plan || plan.chairmanId !== scope.chairmanId) notFound();
  const manages = canManagePlan(scope, plan), teaches = plan.instructorId === user.id;
  if (!manages && !teaches && !scope.canCollect && !(scope.seesAll && (!scope.programs || scope.programs.includes(plan.coordinatorId)))) notFound();

  const [enrolments, crit, host] = await Promise.all([
    prisma.remediationEnrollment.findMany({ where: { planId: plan.id }, orderBy: { createdAt: "asc" } }),
    getPassingCriteria(plan.chairmanId),
    plan.hostCourseId ? prisma.course.findUnique({ where: { id: plan.hostCourseId }, select: { code: true, title: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } } }) : null,
  ]);
  const students = new Map((await prisma.student.findMany({ where: { id: { in: enrolments.map((e) => e.studentId).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true, batch: { select: { degreeProgram: true, batchName: true } } } })).map((s) => [s.id, s]));
  const instructor = plan.instructorId ? await prisma.user.findUnique({ where: { id: plan.instructorId }, select: { name: true } }) : null;
  const m = money(plan, enrolments);
  const live = enrolments.filter((e) => e.status !== "WITHDRAWN");

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 2 }}>{plan.title}</h1>
          <p className="small-note" style={{ margin: 0 }}>{REMEDIATION_KINDS[plan.kind]} · {plan.courseCode} {plan.courseTitle} · teacher {instructor?.name || "not named"} · <span className={`badge ${plan.status === "COMPLETED" ? "badge-ok" : plan.status === "CANCELLED" ? "badge-neutral" : "badge-warn"}`}>{PLAN_STATUS[plan.status]}</span></p>
        </div>
        <Link href="/remediation" className="btn btn-secondary btn-sm">← Remediation</Link>
      </div>

      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, fontSize: 13 }}>
          <div><b>Topics</b><div>{plan.topics.join(", ")}</div>{plan.cloCodes.length > 0 && <div className="small-note">CLOs raised on passing: {plan.cloCodes.join(", ")}</div>}</div>
          <div><b>{plan.kind === "JUNIOR_SITTING" ? "Where students sit in" : "Schedule"}</b>
            {plan.kind === "JUNIOR_SITTING" && host && <div>{host.code} {host.title} — {host.batch?.degreeProgram} {host.batch?.batchName}{host.instructor ? `, ${host.instructor.name}` : ""}: lecture{plan.lectureNumbers.length > 1 ? "s" : ""} {plan.lectureNumbers.join(", ")}</div>}
            {plan.schedule && <div style={{ whiteSpace: "pre-wrap" }}>{plan.schedule}</div>}
            {plan.startDate && <div className="small-note">Starts {plan.startDate.toISOString().slice(0, 10)}</div>}
          </div>
          <div><b>Micro-assessment</b><div>{plan.assessmentTitle || "Short quiz / assignment"}</div><div className="small-note">Pass mark {crit.cloPct}% clears the topics.</div></div>
          <div><b>Fee</b><div>{pkr(plan.feePerStudent)} per student · teacher&apos;s share {plan.instructorSharePct}%</div><div className="small-note">Collected {pkr(m.collected)} · due {pkr(m.due)} · teacher owed {pkr(m.owed)}{m.paidOut ? ` · paid ${pkr(m.paidOut)}` : ""}</div></div>
        </div>
        {manages && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {plan.status === "PLANNED" && <ActionButton url={API} body={{ action: "status", planId: plan.id, status: "RUNNING" }} label="Mark as running" />}
            {plan.status !== "COMPLETED" && plan.status !== "CANCELLED" && <ActionButton url={API} body={{ action: "status", planId: plan.id, status: "COMPLETED" }} label="Mark completed" className="btn btn-secondary btn-sm" confirmText="Mark this remediation completed?" />}
            {plan.status !== "CANCELLED" && plan.status !== "COMPLETED" && <ActionButton url={API} body={{ action: "status", planId: plan.id, status: "CANCELLED" }} label="Cancel" className="act act-danger" confirmText="Cancel this remediation?" />}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Students ({live.length})</h3>
        {enrolments.length === 0 ? <p className="small-note">No students enrolled.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Student</th><th>Fee</th><th>Micro-assessment</th><th>Result</th><th /></tr></thead>
              <tbody>{enrolments.map((e) => {
                const s = students.get(e.studentId);
                const feeOk = e.feeAmount <= 0 || e.feeStatus !== "UNPAID";
                return (
                  <tr key={e.id} style={{ opacity: e.status === "WITHDRAWN" ? 0.55 : 1 }}>
                    <td>{s?.name}<div className="small-note">{s?.rollNumber} · {s?.batch.degreeProgram} {s?.batch.batchName}</div></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {e.feeAmount <= 0 ? <span className="small-note">no fee</span> : e.feeStatus === "PAID" ? <><span className="badge badge-ok">Paid</span><div className="small-note">receipt {e.receiptNo}</div></> : e.feeStatus === "WAIVED" ? <span className="badge badge-neutral">Waived</span> : <span className="badge badge-warn">{pkr(e.feeAmount)} due</span>}
                      {e.status !== "WITHDRAWN" && e.feeAmount > 0 && e.feeStatus === "UNPAID" && (scope.canCollect || manages) && (
                        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                          {scope.canCollect && <ActionButton url={API} body={{ action: "fee", enrollmentId: e.id, feeStatus: "PAID" }} label="Record payment" className="act act-primary" askNote="Receipt number:" noteRequired />}
                          <ActionButton url={API} body={{ action: "fee", enrollmentId: e.id, feeStatus: "WAIVED" }} label="Waive" className="act act-neutral" confirmText="Waive this student's fee?" />
                        </div>
                      )}
                      {scope.canCollect && e.feeStatus !== "UNPAID" && e.scorePct === null && <div><ActionButton url={API} body={{ action: "fee", enrollmentId: e.id, feeStatus: "UNPAID" }} label="Undo" className="act act-neutral" /></div>}
                    </td>
                    <td>{e.status === "WITHDRAWN" ? "—" : (teaches || manages) ? (feeOk ? <InlineScore enrollmentId={e.id} initial={e.scorePct} passPct={crit.cloPct} /> : <span className="small-note">after the fee is paid or waived</span>) : e.scorePct !== null ? `${e.scorePct}%` : "—"}</td>
                    <td><span className={`badge ${RESULT[e.status]?.[1] || "badge-neutral"}`}>{RESULT[e.status]?.[0] || e.status}</span>{e.assessedAt && <div className="small-note">{e.assessedAt.toISOString().slice(0, 10)}{e.beforeJson ? " · transcript updated" : ""}</div>}</td>
                    <td>{manages && e.status === "ENROLLED" && e.scorePct === null && <ActionButton url={API} body={{ action: "withdraw", enrollmentId: e.id }} label="Withdraw" className="act act-danger" confirmText="Withdraw this student?" />}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        {manages && plan.status !== "CANCELLED" && (
          <ActionForm url={API} fixed={{ action: "addStudents", planId: plan.id }} submit="Enrol" collapsed openLabel="Enrol more students" done="Enrolled."
            fields={[{ name: "rollNumbers", label: "Roll numbers (separated by commas or spaces)", type: "textarea" }]} />
        )}
      </div>

      {scope.canCollect && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Teacher&apos;s pay</h3>
          <p style={{ fontSize: 13, margin: "0 0 6px" }}>{instructor?.name || "The teacher"} is owed <b>{pkr(m.owed)}</b> ({plan.instructorSharePct}% of {pkr(m.collected)} collected){m.paidOut ? `; ${pkr(m.paidOut)} already paid${plan.payoutAt ? ` on ${plan.payoutAt.toISOString().slice(0, 10)}` : ""}` : ""}.</p>
          {m.owed > 0 && <ActionForm url={API} fixed={{ action: "payout", planId: plan.id }} submit="Record payment" initial={{ amount: m.owed }} fields={[{ name: "amount", label: "Amount paid (PKR)", type: "number", width: 140 }]} done="Payment recorded." />}
        </div>
      )}
    </Shell>
  );
}
