import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { resultsOf, MIN_RESPONSES } from "../../../lib/midFeedback";

export const dynamic = "force-dynamic";

// The teacher's mid-semester feedback results per course (Adeel prompt §6): only from 5 responses, with a suggested action.
export default async function InstructorMidFeedbackPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const courses = await prisma.course.findMany({ where: { isOffered: true, OR: [{ instructorId: user.id }, { sectionAssignments: { some: { instructorId: user.id } } }] }, select: { id: true, code: true, title: true } });
  const rows = await Promise.all(courses.map(async (c) => ({ c, r: await resultsOf(c.id) })));
  const PACE: Record<string, string> = { SLOW: "too slow", RIGHT: "about right", FAST: "too fast" };
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Mid-semester feedback</h1>
      <p className="small-note">Anonymous answers from your students (week 6 by default). Results show from {MIN_RESPONSES} responses. A suggested action links to the early-warning CQI actions, and is kept as CQI evidence.</p>
      {rows.length === 0 && <div className="card"><p>No offered courses.</p></div>}
      {rows.map(({ c, r }) => (
        <div className="card" key={c.id} style={{ marginBottom: 10 }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>{c.code} {c.title} <span className="small-note">· {r.n} response{r.n === 1 ? "" : "s"}</span></h3>
          {!r.ready ? <p className="small-note">Results show after {MIN_RESPONSES} responses.</p> : <>
            <p style={{ fontSize: 13 }}>Pace: {Object.entries(r.pace).map(([k, n]) => `${Math.round((100 * n) / r.n)}% ${PACE[k]}`).join(" · ")} · Clarity {r.clarity} / 5</p>
            {r.topics.length > 0 && <p style={{ fontSize: 13 }}>Hardest topics: {r.topics.map((t) => `${t.topic} (${t.pct}%)`).join(", ")}</p>}
            <p style={{ fontSize: 13, background: "#FFF8E1", padding: 8, borderRadius: 6 }}><b>Suggested:</b> {r.suggestion} <Link href="/remediation">CQI actions →</Link></p>
            {r.comments.length > 0 && <details><summary style={{ fontSize: 13, cursor: "pointer" }}>Comments ({r.comments.length})</summary><ul style={{ fontSize: 13 }}>{r.comments.map((x, i) => <li key={i}>{x}</li>)}</ul></details>}
          </>}
        </div>
      ))}
    </Shell>
  );
}
