import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import SurveysManager from "../../../components/SurveysManager";
import StandardSurveysButton from "../../../components/StandardSurveysButton";
import { STANDARD_SURVEYS } from "../../../lib/standardSurveys";


export default async function SurveysPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR" && !user.isAlumniCustodian) redirect("/dashboard");

  const chairmanId = await chairmanIdFor(user);
  const coordinators = chairmanId ? await prisma.user.findMany({ where: { managedById: chairmanId, role: "PROGRAM_COORDINATOR" } }) : [];
  const coordinatorIds = coordinators.map((c) => c.id);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } } });
  const plos = await prisma.pLO.findMany({ where: { batchId: { in: batches.map((b) => b.id) } }, orderBy: { number: "asc" } });
  const surveys = await prisma.surveyTemplate.findMany({
    where: { coordinatorId: { in: coordinatorIds } },
    include: { questions: true, _count: { select: { responses: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Feedback Surveys</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Measure indirect PLO attainment through stakeholder feedback — a second evidence source alongside direct
        (assessment-based) attainment, mapped to your Program Learning Outcomes.
      </p>
      {user.role === "PROGRAM_COORDINATOR" && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Standard OBE forms</h3>
          <p className="small-note">One click creates these forms for a batch, with one question per PLO (and per PEO for alumni and employers), rated 1 to 5. Each form becomes a separate indirect source for that PLO on <a href="/indirect-assessment">Direct &amp; Indirect PLOs</a>, weighted as you set there. Students also rate every course&apos;s CLOs in the course-exit survey in their portal.</p>
          <ul style={{ fontSize: 13, margin: "0 0 8px", paddingLeft: 18 }}>{STANDARD_SURVEYS.map((s) => <li key={s.key}><b>{s.title}</b>, {s.when}</li>)}</ul>
          <StandardSurveysButton batches={batches.filter((b) => b.coordinatorId === user.id).map((b) => [b.id, `${b.degreeProgram} — ${b.batchName}`] as [string, string])} />
        </div>
      )}
      <SurveysManager
        surveys={surveys.map((s) => ({ id: s.id, title: s.title, stakeholderType: s.stakeholderType, questions: s.questions.map((q) => ({ id: q.id, text: q.text })), _count: s._count }))}
        plos={Array.from(new Map(plos.map((p) => [p.number, p])).values()).map((p) => ({ id: p.id, number: p.number, title: p.title }))}
      />
    </Shell>
  );
}
