import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import SurveyResponseForm from "../../../components/SurveyResponseForm";

export default async function SurveyPage({ params }: { params: { token: string } }) {
  const response = await prisma.surveyResponse.findUnique({
    where: { token: params.token },
    include: { surveyTemplate: { include: { questions: { orderBy: { orderIndex: "asc" } } } } },
  });
  if (!response) notFound();

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F4EA", padding: 20 }}>
      <div style={{ background: "#fff", padding: "36px 40px", maxWidth: 560, width: "100%", border: "1px solid #E4DFCE" }}>
        {response.submittedAt ? (
          <>
            <h1 style={{ fontSize: 20, marginBottom: 10 }}>Thank you!</h1>
            <p style={{ fontSize: 13.5, color: "#5B6B7C" }}>Your response to "{response.surveyTemplate.title}" has already been recorded.</p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 20, marginBottom: 4 }}>{response.surveyTemplate.title}</h1>
            <p style={{ fontSize: 13, color: "#5B6B7C", marginBottom: 24 }}>
              Hi {response.respondentLabel}, please rate each statement from 1 (Strongly Disagree) to 5 (Strongly Agree).
            </p>
            <SurveyResponseForm token={params.token} questions={response.surveyTemplate.questions.map((q) => ({ id: q.id, text: q.text }))} />
          </>
        )}
      </div>
    </div>
  );
}
