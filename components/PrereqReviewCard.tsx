import { reviewPromptsFor } from "../lib/prereqCascade";
import PrereqReviewPlanner from "./PrereqReviewPlanner";

/**
 * Shown on the teacher's lecture plan: the MILD / WEAK prerequisite topics of earlier courses that this course builds
 * on. Students may register without having mastered them, so the teacher plans a review (or a short recap) in a
 * lecture before the topic that needs it. Renders nothing when there are none.
 */
export default async function PrereqReviewCard({ courseId, canEdit }: { courseId: string; canEdit: boolean }) {
  const { prompts, lectures } = await reviewPromptsFor(courseId);
  if (!prompts.length) return null;
  const open = prompts.filter((p) => !p.plan).length;
  return (
    <details className="card" open={open > 0} style={{ borderLeft: `4px solid ${open ? "var(--rust)" : "var(--sage)"}` }}>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
        Review modules for prerequisite topics {open ? <span style={{ color: "var(--rust)", fontWeight: 600 }}>— {open} to plan</span> : <span style={{ color: "var(--sage)", fontWeight: 600 }}>— all planned</span>}
      </summary>
      <p className="small-note" style={{ marginTop: 8 }}>
        These topics from earlier courses are needed here but are not enforced at registration, so some students may not have mastered them.
        Pick the lecture (before the topic that needs it) where you review each one; it is added to that lecture in your plan.
      </p>
      <PrereqReviewPlanner courseId={courseId} prompts={prompts} lectures={lectures} canEdit={canEdit} />
    </details>
  );
}
