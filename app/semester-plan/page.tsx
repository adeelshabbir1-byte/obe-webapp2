import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import SemesterPlanForm from "../../components/SemesterPlanForm";
import PassOnForm from "../../components/PassOnForm";
import GanttChart from "../../components/GanttChart";
import { prisma } from "../../lib/db";
import RemindButton from "../../components/RemindButton";
import { PLAN_ROLES, PLAN_TEMPLATE, ROLE_LABEL, SETTER_ROLES, planProgress, type PlanState } from "../../lib/deadlines";

const LABEL: Record<string, string> = { CHAIRMAN: "Institute Head", DEAN: "Dean", HEAD_OF_DEPARTMENT: "Chairman", DEPARTMENT_COORDINATOR: "Program Coordinator", PROGRAM_COORDINATOR: "Program Lead" };
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const iso = (d: Date) => d.toISOString().slice(0, 10);
const STATE: Record<PlanState, { text: string; colour: string }> = {
  BEHIND: { text: "BEHIND", colour: "#B3261E" }, AT_RISK: { text: "At risk", colour: "#B7791F" }, ON_TRACK: { text: "On track", colour: "#1B6CA8" }, COMPLETE: { text: "Complete", colour: "#2E7D4F" },
};

export default async function SemesterPlanPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!SETTER_ROLES.includes(user.role)) redirect("/deadlines");
  const isIH = user.role === "CHAIRMAN";
  const lines = await planProgress(user);
  const behind = lines.filter((l) => l.state === "BEHIND");
  const risk = lines.filter((l) => l.state === "AT_RISK");
  const starts = (await prisma.academicCalendarEntry.findMany({ where: { chairmanId: user.role === "CHAIRMAN" ? user.id : user.managedById || "none", kind: "SEMESTER_START" }, select: { termName: true, startDate: true } })) as { termName: string | null; startDate: Date }[];
  const startOf = (t: string) => starts.find((x) => x.termName === t)?.startDate || null;
  const now = new Date();
  const terms = Array.from(new Set(lines.map((l) => l.planTerm || "Other")));

  return (
    <Shell roleLabel={LABEL[user.role] || "Plan"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Semester plan</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        {isIH ? "Set a date for each task in the order the work happens. Each target belongs to a role, whoever holds it. Deans, Chairmen and Program Leads then pass them down with their own earlier dates." : "Targets set above you. Pass each one down to the people in your area with an earlier date so there is slack before the date above you."}
      </p>
      {isIH && <SemesterPlanForm items={PLAN_TEMPLATE.map((p) => ({ key: p.key, title: p.title, role: p.role, offset: p.offset, why: p.why, phase: p.phase, scope: p.scope }))} roles={PLAN_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />}

      {lines.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderLeft: `4px solid ${behind.length ? "#B3261E" : risk.length ? "#B7791F" : "#2E7D4F"}` }}>
          <b style={{ color: behind.length ? "#B3261E" : risk.length ? "#B7791F" : "#2E7D4F" }}>
            {behind.length ? `${behind.length} target${behind.length > 1 ? "s are" : " is"} behind` : risk.length ? `${risk.length} target${risk.length > 1 ? "s are" : " is"} at risk` : "Everything is on track"}
          </b>
          {behind.map((l) => <div key={l.id} style={{ fontSize: 12.5 }}>{l.title}: {l.behind} of {l.total} course{l.total > 1 ? "s" : ""} not done, {-l.daysLeft} day{-l.daysLeft === 1 ? "" : "s"} past {day(l.dueDate)}</div>)}
          {risk.map((l) => <div key={l.id} style={{ fontSize: 12.5, color: "#B7791F" }}>{l.title}: due in {l.daysLeft} day{l.daysLeft === 1 ? "" : "s"} and only {l.done} of {l.total} done</div>)}
        </div>
      )}

      {lines.length === 0 && <div className="card"><p style={{ color: "var(--slate)", margin: 0 }}>{isIH ? "No plan yet. Enter the semester start above to see suggested dates." : "The Institute Head has not published a plan yet."}</p></div>}

      {terms.map((term) => (
        <div key={term} className="card" style={{ marginBottom: 14, overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>{term}</h3>
          <div style={{ marginBottom: 12 }}><GanttChart lines={lines.filter((l) => (l.planTerm || "Other") === term)} start={startOf(term)} now={now} /></div>
          <table>
            <thead><tr><th>Final date</th><th>Task</th><th>Role</th><th>Progress</th><th>State</th><th>{isIH ? "Passed down" : "My date for my area"}</th></tr></thead>
            <tbody>{lines.filter((l) => (l.planTerm || "Other") === term).map((l) => {
              const st = STATE[l.state];
              const mineChild = l.passed.find((p) => p.by === user.name);
              const sug = new Date(l.dueDate.getTime() - 7 * 86400000);
              return (
                <tr key={l.id} style={{ background: l.state === "BEHIND" ? "rgba(179,38,30,0.07)" : undefined }}>
                  <td style={{ whiteSpace: "nowrap" }}><b>{day(l.dueDate)}</b><div style={{ fontSize: 11.5, color: "var(--slate)" }}>set by {l.setBy}</div></td>
                  <td><b>{l.title}</b></td>
                  <td>{l.role ? ROLE_LABEL[l.role] || l.role : "—"}</td>
                  <td style={{ minWidth: 130 }}>
                    <div style={{ background: "#e6e6e6", height: 8, borderRadius: 4 }}><div style={{ width: `${l.total ? Math.round((l.done / l.total) * 100) : 0}%`, background: st.colour, height: 8, borderRadius: 4 }} /></div>
                    <div style={{ fontSize: 11.5 }}>{l.done} of {l.total} courses{l.late ? `, ${l.late} late` : ""}</div>
                  </td>
                  <td><span style={{ background: st.colour, color: "#fff", borderRadius: 5, padding: "2px 7px", fontSize: 11.5 }}>{st.text}</span>
                    <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{l.state === "COMPLETE" ? "" : l.daysLeft >= 0 ? `${l.daysLeft} days left` : `${-l.daysLeft} days late`}</div></td>
                  <td>
                    {isIH ? (l.passed.length ? l.passed.map((p, i) => <div key={i} style={{ fontSize: 12 }}>{p.by}: {day(p.dueDate)} <span style={{ color: p.slack >= 7 ? "var(--slate)" : "#B7791F" }}>({p.slack} days slack)</span></div>) : <span style={{ fontSize: 12, color: "var(--slate)" }}>Not passed down yet</span>)
                      : l.mine ? <span style={{ fontSize: 12, color: "var(--slate)" }}>Set by you</span>
                      : <PassOnForm parentId={l.id} parentDate={iso(l.dueDate)} suggested={iso(sug)} current={mineChild ? iso(mineChild.dueDate) : ""} />}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
          {lines.filter((l) => (l.planTerm || "Other") === term && l.notDone.length > 0 && (l.state === "BEHIND" || l.state === "AT_RISK")).map((l) => (
            <details key={l.id} style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: 13 }}><b>{l.title}</b>: courses not done yet ({l.total - l.done})</summary>
              <ul style={{ fontSize: 12.5, margin: "6px 0 0 18px" }}>
                {l.notDone.map((n) => <li key={n.courseId}>{n.label} — {n.who || <span style={{ color: "#B3261E" }}>nobody holds this yet</span>}{n.whoId && <RemindButton deadlineId={l.id} toId={n.whoId} item={n.label} />}</li>)}
                {l.total - l.done > l.notDone.length && <li style={{ color: "var(--slate)" }}>and {l.total - l.done - l.notDone.length} more</li>}
              </ul>
            </details>
          ))}
        </div>
      ))}
    </Shell>
  );
}
