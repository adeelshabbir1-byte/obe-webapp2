import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { feedbackTerms, termKey, termOf } from "../../lib/feedbackAnalysis";
import FeedbackTeacherView from "../../components/FeedbackTeacherView";
import HowCalculated from "../../components/HowCalculated";

export const dynamic = "force-dynamic";
export const metadata = { title: "My student feedback" };

// A teacher's own student feedback: counts per rating, averages, the total, every course across batches and the trend.
// Students are never named; results appear only from the minimum number of answers.
export default async function MyFeedbackPage({ searchParams }: { searchParams: { term?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) redirect("/dashboard");
  const terms = await feedbackTerms(chairmanId);
  const term = termOf(searchParams.term) || terms[0] || null;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My student feedback</h1>
      <p className="small-note">What your students said, question by question. You see counts and averages only — never who answered.</p>
      <HowCalculated shows="Your students' 1–5 answers to the teacher evaluation, per course and across every batch you taught.">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>For each question: how many students gave each rating and the average. The <b>total out of 100</b> weighs each question as the QEC In-charge decided.</li>
          <li>The <b>adjusted score</b> compares you with how generously the same batch rated all its teachers that term; it is what the Faculty Performance Report and course allocation use.</li>
          <li>A question is flagged as <b>consistently low</b> when it is under your own average and the department&apos;s in two or more courses; the matching FDP workshop is suggested.</li>
        </ul>
      </HowCalculated>
      {terms.length > 0 && (
        <form className="card" style={{ display: "flex", gap: 8 }}>
          <select name="term" defaultValue={term ? termKey(term) : ""} aria-label="Term">{terms.map((t) => <option key={termKey(t)} value={termKey(t)}>{t.name} {t.year}</option>)}</select>
          <button className="btn btn-secondary btn-sm">Show</button>
        </form>
      )}
      <FeedbackTeacherView chairmanId={chairmanId} teacherId={user.id} term={term} staff={false} />
    </Shell>
  );
}
