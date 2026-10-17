import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../../lib/reportScope";
import { courseQuestions } from "../../../../lib/obeQuestionBank";
import ObeQuiz from "../../../../components/ObeQuiz";

export const dynamic = "force-dynamic";

export default async function CoursePracticePage({ params, searchParams }: { params: { id: string }; searchParams: { set?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const head = user.role === "SUPER_USER" ? null : await chairmanIdFor(user).catch(() => null);
  const set = Number(searchParams.set) || 1;
  const bank = await courseQuestions(params.id, head, `${user.id}:${set}`);
  if (!bank) notFound();
  const pass = Math.ceil(bank.questions.length * 0.7);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <Link href="/learn" style={{ fontSize: 12.5 }}>← Learn OBE</Link>
      <h1 style={{ fontSize: 22, margin: "4px 0 4px" }}>Practice: {bank.course.code} — {bank.course.title}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13 }}>{bank.questions.length} questions from the HEC curriculum of this course ({bank.available} in the bank). <Link href={`/learn/course/${params.id}?set=${set + 1}`}>Another set →</Link></p>
      <ObeQuiz key={set} questions={bank.questions} progressKey={`course:${bank.course.id}`} passMark={pass} />
    </Shell>
  );
}
