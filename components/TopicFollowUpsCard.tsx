import Link from "next/link";
import { prisma } from "../lib/db";
import { proposeFollowUps } from "../lib/topicLinks";
import SendFollowUpsButton from "./SendFollowUpsButton";

type Who = { id: string; role: string; managedById: string | null };
const KIND: Record<string, string> = { WEAK_PREREQ: "Prerequisite topic not mastered", MISSED: "Planned but not taught", WEAK: "Most students below the pass mark" };

/**
 * On the instructor's Marks page: how the class did on each topic (from the items linked to its lectures), which
 * planned topics were never taught, and the follow-ups that go to the next courses. Sending records them for CQI.
 */
export default async function TopicFollowUpsCard({ courseId, viewer }: { courseId: string; viewer: Who }) {
  const { results, proposals, passPct, missedTopics } = await proposeFollowUps(courseId, viewer);
  const sent = await prisma.topicFollowUp.findMany({ where: { sourceCourseId: courseId }, orderBy: { createdAt: "asc" } }).catch(() => null);
  const assessed = results.filter((r) => r.students > 0).sort((a, b) => b.below / Math.max(1, b.students) - a.below / Math.max(1, a.students));
  const unsent = sent ? proposals.filter((p) => !sent.some((s) => s.kind === p.kind && s.topic === p.topic && s.targetCourseCode === p.targetCourseCode)) : proposals;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Results by topic and follow-ups</h3>
      <p className="small-note" style={{ marginTop: 0 }}>
        A student&apos;s score on a topic is their marks on the quizzes, assignments and exam questions linked to that topic&apos;s lectures.
        A topic is weak when most of the class scored below {passPct}%. Link items to lectures on the Assessments tab for a fuller picture.
      </p>
      {sent === null && <div className="err">The follow-up table is not in the database yet — run prisma/migration_oct2026_features.sql in Supabase.</div>}
      {assessed.length === 0 ? <p className="small-note">No marks on topic-linked items yet.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Topic</th><th>Lectures</th><th>Assessed by</th><th style={{ textAlign: "center" }}>Below {passPct}%</th><th style={{ textAlign: "center" }}>Class average</th></tr></thead>
            <tbody>
              {assessed.map((r) => {
                const weak = r.students >= 3 && r.below / r.students > 0.5;
                return (
                  <tr key={r.topic} style={weak ? { background: "#FBE2DF" } : undefined}>
                    <td><b>{r.topic}</b></td>
                    <td>{r.lectures.join(", ")}</td>
                    <td style={{ fontSize: 12 }}>{r.items.join(", ")}</td>
                    <td style={{ textAlign: "center", color: weak ? "var(--rust)" : "inherit", fontWeight: weak ? 700 : 400 }}>{r.below} of {r.students}</td>
                    <td style={{ textAlign: "center" }}>{r.avgPct !== null ? `${r.avgPct}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {missedTopics.length > 0 && (
        <p style={{ fontSize: 13 }}><b>Planned by the Subject Expert but not taught:</b> {missedTopics.join("; ")}</p>
      )}

      <h4 style={{ margin: "14px 0 6px" }}>Follow-ups</h4>
      {proposals.length === 0 && (!sent || sent.length === 0) && <p className="small-note" style={{ margin: 0 }}>Nothing to pass on: no weak or untaught topics so far.</p>}
      {unsent.length > 0 && (
        <>
          <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 13 }}>
            {unsent.map((p, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <span className="badge badge-warn" style={{ marginRight: 6 }}>{KIND[p.kind]}</span>
                <b>To {p.targetCourseCode}{p.targetTopic ? ` (${p.targetTopic})` : " — next offering"}:</b> {p.recommendation}
              </li>
            ))}
          </ul>
          <SendFollowUpsButton courseId={courseId} count={unsent.length} />
        </>
      )}
      {sent && sent.length > 0 && (
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>Sent follow-up</th><th>To</th><th>Status</th><th>Action taken</th></tr></thead>
          <tbody>
            {sent.map((s) => (
              <tr key={s.id}>
                <td><span className="small-note">{KIND[s.kind] || s.kind}:</span> {s.topic}</td>
                <td>{s.targetCourseCode}{s.targetTopic ? ` — ${s.targetTopic}` : s.targetCourseId ? "" : " (next offering)"}</td>
                <td>{s.status === "DONE" ? <span className="badge badge-ok">Done</span> : s.status === "IN_PROGRESS" ? <span className="badge badge-warn">In progress</span> : s.status === "DISMISSED" ? <span className="badge badge-neutral">Dismissed</span> : <span className="badge badge-neutral">Open</span>}</td>
                <td style={{ fontSize: 12 }}>{s.actionTaken || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ marginBottom: 0, fontSize: 12.5 }}><Link href="/follow-ups">All topic follow-ups →</Link></p>
    </div>
  );
}
