import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";

/** Surveys are visible/manageable institution-wide (chairman-scoped), by
 * either a Program Coordinator or the Chairman-designated alumni/employer
 * data custodian (who may hold any role) — since the alumni/employer pool
 * these surveys target is itself institution-wide. */
async function canManageSurveys(user: { role: string; isAlumniCustodian: boolean }) {
  return user.role === "PROGRAM_COORDINATOR" || user.isAlumniCustodian;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !(await canManageSurveys(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no institution on record for this account" }, { status: 400 });

  const coordinators = await prisma.user.findMany({ where: { managedById: chairmanId, role: "PROGRAM_COORDINATOR" } });
  const surveys = await prisma.surveyTemplate.findMany({
    where: { coordinatorId: { in: coordinators.map((c) => c.id) } },
    include: { questions: true, _count: { select: { responses: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ surveys });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !(await canManageSurveys(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.title || !body.stakeholderType || !Array.isArray(body.questions) || body.questions.length === 0) {
    return NextResponse.json({ error: "title, stakeholderType, and at least one question are required" }, { status: 400 });
  }
  if (!["STUDENT", "ALUMNI", "EMPLOYER"].includes(body.stakeholderType)) {
    return NextResponse.json({ error: "stakeholderType must be STUDENT, ALUMNI, or EMPLOYER" }, { status: 400 });
  }

  // SurveyTemplate needs an owning Coordinator record even if a non-Coordinator
  // custodian creates it — attribute it to their own Coordinator (SE/Instructor)
  // or themselves (if they are the Coordinator).
  const coordinatorId = user.role === "PROGRAM_COORDINATOR" ? user.id : user.managedById;
  if (!coordinatorId) return NextResponse.json({ error: "no coordinator on record to attribute this survey to" }, { status: 400 });

  const survey = await prisma.surveyTemplate.create({
    data: {
      coordinatorId, title: body.title, stakeholderType: body.stakeholderType,
      questions: {
        create: body.questions.map((q: any, i: number) => ({ text: q.text, mappedPloId: q.mappedPloId || null, mappedPeoLabel: q.mappedPeoLabel || null, orderIndex: i })),
      },
    },
    include: { questions: true },
  });

  return NextResponse.json({ survey }, { status: 201 });
}
