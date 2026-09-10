import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";

export async function POST(req: NextRequest, { params }: { params: { surveyId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const survey = await prisma.surveyTemplate.findUnique({ where: { id: params.surveyId } });
  if (!survey || survey.coordinatorId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const respondentIds: string[] = body.respondentIds || [];
  if (respondentIds.length === 0) return NextResponse.json({ error: "select at least one respondent" }, { status: 400 });

  let respondents: { id: string; name: string }[] = [];
  if (survey.stakeholderType === "STUDENT") {
    const students = await prisma.student.findMany({ where: { id: { in: respondentIds } } });
    respondents = students.map((s) => ({ id: s.id, name: s.name }));
  } else if (survey.stakeholderType === "ALUMNI") {
    const alumni = await prisma.alumni.findMany({ where: { id: { in: respondentIds }, coordinatorId: user.id } });
    respondents = alumni.map((a) => ({ id: a.id, name: a.name }));
  } else {
    const employers = await prisma.employer.findMany({ where: { id: { in: respondentIds }, coordinatorId: user.id } });
    respondents = employers.map((e) => ({ id: e.id, name: e.organizationName }));
  }

  const created = [];
  for (const r of respondents) {
    const token = crypto.randomBytes(16).toString("hex");
    const data: any = {
      surveyTemplateId: survey.id, token, respondentType: survey.stakeholderType, respondentLabel: r.name,
    };
    if (survey.stakeholderType === "STUDENT") data.studentId = r.id;
    if (survey.stakeholderType === "ALUMNI") data.alumniId = r.id;
    if (survey.stakeholderType === "EMPLOYER") data.employerId = r.id;

    const response = await prisma.surveyResponse.create({ data });
    created.push({ respondentLabel: r.name, token: response.token });
  }

  return NextResponse.json({ links: created });
}
