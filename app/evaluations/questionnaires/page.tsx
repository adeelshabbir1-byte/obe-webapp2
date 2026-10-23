import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import { allQuestions, canEditQuestionnaires, qecIncharges, settingsFor, versionsOf } from "../../../lib/questionnaires";
import QuestionnaireEditor from "../../../components/QuestionnaireEditor";
import FeedbackWindowForm from "../../../components/FeedbackWindowForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback questionnaires" };

// The QEC In-charge (until one is named: the Institute Head or a Dean) keeps the student feedback questionnaires.
export default async function QuestionnairesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId || !(await canEditQuestionnaires(user, chairmanId))) redirect("/evaluations");
  const [teacher, course, s, qec, vT, vC] = await Promise.all([allQuestions(chairmanId, "TEACHER"), allQuestions(chairmanId, "COURSE"), settingsFor(chairmanId), qecIncharges(chairmanId), versionsOf(chairmanId, "TEACHER"), versionsOf(chairmanId, "COURSE")]);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Feedback questionnaires</h1>
          <p className="small-note" style={{ margin: 0 }}>
            Set by the QEC In-charge{qec.length ? ` (${qec.map((q) => q.name).join(", ")})` : " — not named yet, so the Institute Head or a Dean sets them. The Institute Head names one on the Organisation Chart"}.
            The HEC questions are version 1; every answer given so far stays valid.
          </p>
        </div>
        <Link href="/evaluations" className="btn btn-secondary btn-sm">Results</Link>
      </div>
      <FeedbackWindowForm fromWeek={s.fromWeek} toWeek={s.toWeek} minResponses={s.minResponses} />
      <QuestionnaireEditor key={teacher.map((q) => `${q.key}${q.version}${q.retired}`).join()} kind="TEACHER" title="Teacher evaluation" questions={teacher} versions={Object.fromEntries(vT)} />
      <QuestionnaireEditor key={course.map((q) => `${q.key}${q.version}${q.retired}`).join()} kind="COURSE" title="Course evaluation" questions={course} versions={Object.fromEntries(vC)} />
    </Shell>
  );
}
