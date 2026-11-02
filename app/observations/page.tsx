import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { coursesToObserve, visible } from "../../lib/observation";
import { AREAS, RATING, summary } from "../../lib/observationCore";
import { ObserveForm, ReplyForm } from "../../components/ObservationForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Classroom observation" };

// Classroom observation (queue item 8.4): the HOD, Program Lead or a peer observes a lecture with a short form; the
// teacher reads it and replies; weak areas can be raised as a CQI item. Evidence for NCEAC and the QEC.
export default async function ObservationsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const [courses, v] = await Promise.all([coursesToObserve(user as never).catch(() => []), visible(user as never)]);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Classroom observation</h1>
      <p className="small-note">Observe a colleague&apos;s lecture with a short form. The planned topic comes from the lecture plan. The teacher sees it and can reply; weak areas can be raised as a CQI item. {v.manager ? "You see every observation in the institute." : "You see the observations you made and those of your own classes."}</p>
      <ObserveForm courses={courses} areas={AREAS} rating={RATING} />
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Observations</h3>
        {v.rows.length === 0 ? <p className="small-note">None yet.</p> : v.rows.map((o) => {
          const sc = JSON.parse(o.scoresJson || "{}") as Record<string, number>; const s = summary(sc, o.plannedTopic, o.taughtTopic);
          return (
            <div key={o.id} style={{ borderTop: "1px solid #eee", padding: "8px 0", fontSize: 13 }} data-obs={o.id}>
              <b>{o.course}</b> · {o.teacher} · observed by {o.observer} · {new Date(o.observedOn).toLocaleDateString("en-GB")}{o.lectureNumber ? ` · L${o.lectureNumber}` : ""} · average <b>{s.avg ?? "—"}</b>/4
              {o.plannedTopic && <div>Planned: {o.plannedTopic}{o.taughtTopic ? ` · taught: ${o.taughtTopic}` : ""}{s.onPlan === false ? " — not the planned topic" : ""}</div>}
              <div className="small-note">{AREAS.filter(([k]) => sc[k]).map(([k, l]) => `${l.split(":")[0]}: ${RATING[sc[k]]}`).join(" · ")}</div>
              {o.strengths && <div><b>Strengths:</b> {o.strengths}</div>}
              {o.improve && <div><b>To improve:</b> {o.improve}</div>}
              {o.teacherReply ? <div style={{ background: "#F1F4F9", padding: 6, borderRadius: 6, marginTop: 4 }}><b>Teacher&apos;s reply:</b> {o.teacherReply}</div> : o.teacherId === user.id ? <ReplyForm id={o.id} /> : null}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
