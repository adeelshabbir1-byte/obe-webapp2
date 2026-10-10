import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor, roleLabel } from "../../../../lib/reportScope";
import { navForRole } from "../../../../components/reportNav";
import Shell from "../../../../components/Shell";
import SurveyDetailManager from "../../../../components/SurveyDetailManager";


export default async function SurveyDetailPage({ params }: { params: { surveyId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR" && !user.isAlumniCustodian) redirect("/dashboard");

  const survey = await prisma.surveyTemplate.findUnique({ where: { id: params.surveyId }, include: { questions: true, responses: true, coordinator: true } });
  const chairmanId = await chairmanIdFor(user);
  if (!survey || survey.coordinator.managedById !== chairmanId) notFound();

  const linkedIds = new Set(survey.responses.map((r) => r.studentId || r.alumniId || r.employerId));

  let respondents: { id: string; label: string; alreadyLinked: boolean }[] = [];
  if (survey.stakeholderType === "STUDENT") {
    const coordinators = await prisma.user.findMany({ where: { managedById: chairmanId, role: "PROGRAM_COORDINATOR" } });
    const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinators.map((c) => c.id) } } });
    const students = await prisma.student.findMany({ where: { batchId: { in: batches.map((b) => b.id) } } });
    respondents = students.map((s) => ({ id: s.id, label: `${s.name} (${s.rollNumber})`, alreadyLinked: linkedIds.has(s.id) }));
  } else if (survey.stakeholderType === "ALUMNI") {
    const alumni = await prisma.alumni.findMany({ where: { chairmanId, status: "APPROVED" } });
    respondents = alumni.map((a) => ({ id: a.id, label: `${a.name} (${a.degreeProgram} '${a.graduationYear})`, alreadyLinked: linkedIds.has(a.id) }));
  } else {
    const employers = await prisma.employer.findMany({ where: { chairmanId, status: "APPROVED" } });
    respondents = employers.map((e) => ({ id: e.id, label: e.organizationName, alreadyLinked: linkedIds.has(e.id) }));
  }

  const host = headers().get("host");
  const origin = `https://${host}`;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{survey.title}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>{survey.stakeholderType} survey — {survey.questions.length} question(s).</p>
      <SurveyDetailManager
        surveyId={survey.id}
        respondents={respondents}
        existingResponses={survey.responses.map((r) => ({ respondentLabel: r.respondentLabel, submitted: !!r.submittedAt, token: r.token }))}
        origin={origin}
      />
    </Shell>
  );
}
