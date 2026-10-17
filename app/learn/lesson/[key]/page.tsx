import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel } from "../../../../lib/reportScope";
import { LESSONS } from "../../../../lib/obeLessons";
import ObeQuiz from "../../../../components/ObeQuiz";

export default async function LessonPage({ params }: { params: { key: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const i = LESSONS.findIndex((l) => l.key === params.key);
  if (i < 0) notFound();
  const l = LESSONS[i];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <Link href="/learn" style={{ fontSize: 12.5 }}>← Learn OBE</Link>
      <h1 style={{ fontSize: 22, margin: "4px 0 10px" }}>{l.title}</h1>
      <div className="card" style={{ fontSize: 14, lineHeight: 1.6 }}>{l.body.map((p, k) => <p key={k} style={{ marginTop: k ? 10 : 0 }}>{p}</p>)}</div>
      <h3>Quiz — 4 of 5 to pass</h3>
      <ObeQuiz questions={l.quiz.map((q) => ({ prompt: q.prompt, options: q.options, answer: q.answer, why: q.why }))} progressKey={`lesson:${l.key}`} passMark={4} />
      {LESSONS[i + 1] && <p style={{ marginTop: 14 }}><Link href={`/learn/lesson/${LESSONS[i + 1].key}`}>Next: {LESSONS[i + 1].title} →</Link></p>}
    </Shell>
  );
}
