import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";

const COURSE_TYPES = ["Core", "Elective", "Lab", "IDS", "General Education", "Capstone Project", "Field Experience"];

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const existing = await prisma.weightPolicy.findMany({ where: { chairmanId: user.managedById } });
  const byType = new Map(existing.map((p) => [p.courseType, p]));

  // Return one row per known course type, defaulting to 0-100 (unrestricted) if never set.
  const policies = COURSE_TYPES.map((t) => byType.get(t) || {
    id: null, courseType: t,
    assignmentMin: 0, assignmentMax: 100, quizMin: 0, quizMax: 100, projectMin: 0, projectMax: 100,
    labMin: 0, labMax: 100, midtermMin: 0, midtermMax: 100, finalMin: 0, finalMax: 100,
  });

  return NextResponse.json({ policies });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const body = await req.json();
  if (!body.courseType || !COURSE_TYPES.includes(body.courseType)) {
    return NextResponse.json({ error: "valid courseType is required" }, { status: 400 });
  }

  const fields = ["assignmentMin", "assignmentMax", "quizMin", "quizMax", "projectMin", "projectMax", "labMin", "labMax", "midtermMin", "midtermMax", "finalMin", "finalMax"];
  const data: Record<string, number> = {};
  for (const f of fields) {
    const v = parseInt(body[f], 10);
    if (isNaN(v) || v < 0 || v > 100) return NextResponse.json({ error: `${f} must be a number between 0 and 100` }, { status: 400 });
    data[f] = v;
  }
  // sanity: min <= max for each pair
  for (const key of ["assignment", "quiz", "project", "lab", "midterm", "final"]) {
    if (data[`${key}Min`] > data[`${key}Max`]) {
      return NextResponse.json({ error: `${key} minimum cannot exceed its maximum` }, { status: 400 });
    }
  }

  const policy = await prisma.weightPolicy.upsert({
    where: { chairmanId_courseType: { chairmanId: user.managedById, courseType: body.courseType } },
    create: { chairmanId: user.managedById, courseType: body.courseType, ...data },
    update: data,
  });

  await writeAuditLog({ actorUserId: user.id, action: "WEIGHT_POLICY_SET", entityType: "WeightPolicy", entityId: policy.id, metadata: { courseType: body.courseType } });

  return NextResponse.json({ policy });
}
