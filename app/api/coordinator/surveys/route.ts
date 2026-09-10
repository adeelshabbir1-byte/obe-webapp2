import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const surveys = await prisma.surveyTemplate.findMany({
    where: { coordinatorId: user.id },
    include: { questions: true, _count: { select: { responses: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ surveys });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.title || !body.stakeholderType || !Array.isArray(body.questions) || body.questions.length === 0) {
    return NextResponse.json({ error: "title, stakeholderType, and at least one question are required" }, { status: 400 });
  }
  if (!["STUDENT", "ALUMNI", "EMPLOYER"].includes(body.stakeholderType)) {
    return NextResponse.json({ error: "stakeholderType must be STUDENT, ALUMNI, or EMPLOYER" }, { status: 400 });
  }

  const survey = await prisma.surveyTemplate.create({
    data: {
      coordinatorId: user.id, title: body.title, stakeholderType: body.stakeholderType,
      questions: {
        create: body.questions.map((q: any, i: number) => ({ text: q.text, mappedPloId: q.mappedPloId || null, orderIndex: i })),
      },
    },
    include: { questions: true },
  });

  return NextResponse.json({ survey }, { status: 201 });
}
