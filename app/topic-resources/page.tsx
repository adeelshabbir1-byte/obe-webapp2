import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { staffView, KINDS } from "../../lib/topicResources";
import { TopicResAdd, TopicResRemove } from "../../components/TopicResForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learning resources per topic" };

export default async function TopicResourcesPage({ searchParams }: { searchParams: { courseId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!searchParams.courseId) redirect("/plan-generate");
  const v = await staffView(user as never, String(searchParams.courseId)).catch(() => null);
  if (!v) redirect("/plan-generate");
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p className="small-note"><Link href={`/plan-generate?courseId=${v.course.id}`}>← Generate from the plan</Link></p>
      <h1>Learning resources — {v.course.code} {v.course.title}</h1>
      <p className="small-note">Link videos, readings, library books or exercises to each topic. Students who have not cleared a CLO yet see the resources of its topics beside their practice questions. Shared by every section of this course.</p>
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 13 }}><thead><tr><th>Lecture</th><th>Topic</th><th>CLO</th><th>Resources</th></tr></thead>
          <tbody>{v.lectures.map((l) => <tr key={l.n} data-lecture={l.n}><td>L{l.n}</td><td>{l.topic}</td><td>{l.clo || "—"}</td>
            <td>{l.res.map((r) => <div key={r.id}>{KINDS[r.kind] || r.kind}: {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a> : r.title}{r.note ? <span className="small-note"> — {r.note}</span> : null} <TopicResRemove courseId={v.course.id} id={r.id} /></div>)}
              <TopicResAdd courseId={v.course.id} lectureNumber={l.n} /></td></tr>)}</tbody></table>
      </div>
    </Shell>
  );
}
