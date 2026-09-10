import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const response = await prisma.surveyResponse.findUnique({
    where: { token: params.token },
    include: { surveyTemplate: { include: { questions: true } } },
  });
  if (!response) return NextResponse.json({ error: "invalid link" }, { status: 404 });
  if (response.submittedAt) return NextResponse.json({ error: "this response has already been submitted" }, { status: 400 });

  const body = await req.json();
  const answers: Record<string, number> = body.answers || {};
  const questionIds = response.surveyTemplate.questions.map((q) => q.id);

  for (const qId of questionIds) {
    const val = answers[qId];
    if (typeof val !== "number" || val < 1 || val > 5) {
      return NextResponse.json({ error: "every question needs a rating from 1 to 5" }, { status: 400 });
    }
  }

  await prisma.$transaction([
    ...questionIds.map((qId) =>
      prisma.surveyAnswer.create({ data: { surveyResponseId: response.id, questionId: qId, ratingValue: answers[qId] } })
    ),
    prisma.surveyResponse.update({ where: { id: response.id }, data: { submittedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
