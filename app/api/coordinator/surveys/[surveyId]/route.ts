import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";

async function canManageSurveys(user: { role: string; isAlumniCustodian: boolean }) {
  return user.role === "PROGRAM_COORDINATOR" || user.isAlumniCustodian;
}

export async function PUT(req: NextRequest, { params }: { params: { surveyId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !(await canManageSurveys(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);

  const survey = await prisma.surveyTemplate.findUnique({ where: { id: params.surveyId }, include: { coordinator: true, responses: true } });
  if (!survey || survey.coordinator.managedById !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const hasResponses = survey.responses.length > 0;

  if (body.questions && hasResponses) {
    return NextResponse.json({ error: "this survey already has responses — questions can't be changed anymore (title still can be)" }, { status: 400 });
  }

  await prisma.surveyTemplate.update({ where: { id: params.surveyId }, data: { title: body.title ?? survey.title } });

  if (body.questions && !hasResponses) {
    await prisma.surveyQuestion.deleteMany({ where: { surveyTemplateId: params.surveyId } });
    await prisma.surveyQuestion.createMany({
      data: body.questions.map((q: any, i: number) => ({ surveyTemplateId: params.surveyId, text: q.text, mappedPloId: q.mappedPloId || null, orderIndex: i })),
    });
  }

  const updated = await prisma.surveyTemplate.findUnique({ where: { id: params.surveyId }, include: { questions: true } });
  return NextResponse.json({ survey: updated });
}
