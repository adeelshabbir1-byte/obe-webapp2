import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import HowCalculated from "../../../components/HowCalculated";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { reviewBatchWhere } from "../../../lib/reviewScope";
import { loadLabCourse } from "../../../lib/labAccess";
import { labStatus } from "../../../lib/labTheory";

export const dynamic = "force-dynamic";

// Labs across the program: each lab course with its theory course, whether its marks go into the theory result, manuals,
// sessions held, plan problems and approval — and the mismatches that need someone's attention.
export default async function LabsOverview() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const where = user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : await reviewBatchWhere(user);
  if (!where) redirect("/dashboard");
  const labs = await prisma.course.findMany({ where: { courseType: "Lab", isOffered: true, batch: where }, select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { code: "asc" }, take: 120 });
  const rows = await Promise.all(labs.map(async (l) => {
    const loaded = await loadLabCourse(l.id);
    const st = await labStatus(l.id, loaded?.theory?.id || null);
    const theoryLab = loaded?.theory ? await prisma.assessmentInstrument.count({ where: { courseId: loaded.theory.id, source: "INSTRUCTOR", type: "Lab", partOfId: null } }) : 0;
    const problems: string[] = [];
    if (!loaded?.theory) problems.push("no theory course found (code should be the theory code + -L)");
    if (!loaded?.lab.labEngineer) problems.push("no Lab Engineer named");
    if (st.manualsMissing) problems.push(`${st.manualsMissing} manual(s) not uploaded`);
    if (st.manualsWaiting) problems.push(`${st.manualsWaiting} manual(s) waiting for the theory instructor's approval`);
    for (const i of st.issues.filter((x) => x.level === "bad").slice(0, 3)) problems.push(i.text);
    if (st.issues.filter((x) => x.level === "bad").length > 3) problems.push(`and ${st.issues.filter((x) => x.level === "bad").length - 3} more plan problem(s)`);
    if (st.setting.intoTheory && st.held && !st.setting.approvedAt) problems.push("lab marks entered but not yet approved into the theory result");
    if (st.setting.intoTheory && st.setting.approvedAt && !theoryLab) problems.push("approved, but the theory course has no Lab assessment any more");
    if (!st.setting.intoTheory && theoryLab) problems.push("the theory course has a Lab assessment but the lab is set as a separate course");
    if (st.setting.changeRequest) problems.push("the Lab Engineer asked to change approved marks");
    return { l, loaded, st, problems };
  }));
  const bad = rows.filter((r) => r.problems.length).length;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Labs Overview</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>Every lab course with its theory course: who leads it, whether its marks go into the theory result, and what does not match. <b style={{ color: bad ? "#B3261E" : "#1E6B3A" }}>{bad} of {rows.length} labs need attention.</b></p>
      <HowCalculated shows="Each lab course's status and the mismatches between the lab and its theory course.">
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
          <li>Manuals: each lab session needs a manual uploaded by the Lab Engineer and approved by the theory instructor before the session (reminders go to both three days before).</li>
          <li>Plan problems: a lab placed before the lecture that teaches its topic, a lab linked to a topic no longer in the lecture plan, or a lab with no topic.</li>
          <li>Labs held = sessions with marks; attendance = students with a mark ÷ students enrolled, over the sessions held.</li>
        </ul>
      </HowCalculated>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 13 }}>
          <thead><tr><th>Lab</th><th>Theory / lead</th><th>Lab Engineer</th><th>Marks</th><th>Manuals</th><th>Held</th><th>What needs attention</th></tr></thead>
          <tbody>{rows.map(({ l, loaded, st, problems }) => (
            <tr key={l.id}>
              <td>{loaded?.lead?.id === user.id || loaded?.lab.labEngineer?.id === user.id ? <a href={`/lab-engineer/labs/${l.id}`}><b>{l.code}</b></a> : <b>{l.code}</b>} {l.title}<div className="small-note" style={{ margin: 0 }}>{l.batch?.degreeProgram} {l.batch?.batchName}</div></td>
              <td>{loaded?.theory ? `${loaded.theory.code}` : "—"}<div className="small-note" style={{ margin: 0 }}>{loaded?.lead?.name || "no lead"}</div></td>
              <td>{loaded?.lab.labEngineer?.name || <span style={{ color: "#B3261E" }}>not named</span>}</td>
              <td>{st.setting.intoTheory ? <>Into theory ({st.setting.weightPct}%)<div className="small-note" style={{ margin: 0, color: st.setting.approvedAt ? "#1E6B3A" : "#9A3412" }}>{st.setting.approvedAt ? "approved, locked" : "not approved"}</div></> : "Separate course"}</td>
              <td style={{ color: st.manualsApproved < st.sessions ? "#9A3412" : "#1E6B3A", fontWeight: 700 }}>{st.manualsApproved}/{st.sessions}</td>
              <td>{st.held}/{st.sessions}</td>
              <td style={{ fontSize: 12.5 }}>{problems.length ? <ul style={{ margin: 0, paddingLeft: 16, color: "#B3261E" }}>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul> : <span style={{ color: "#1E6B3A", fontWeight: 700 }}>✓ nothing</span>}</td>
            </tr>
          ))}</tbody>
        </table>
        {rows.length === 0 && <p className="small-note">No offered lab courses.</p>}
      </div>
    </Shell>
  );
}
