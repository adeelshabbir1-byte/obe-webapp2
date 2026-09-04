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
  const updaterIds = existing.map((p) => p.updatedById).filter((id): id is string => !!id);
  const updaters = updaterIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: updaterIds } } }) : [];
  const updaterNameById = new Map(updaters.map((u) => [u.id, u.name]));
  const byType = new Map(existing.map((p) => [p.courseType, { ...p, updatedByName: p.updatedById ? updaterNameById.get(p.updatedById) || null : null }]));

  // Return one row per known course type, defaulting to 0-100 (unrestricted) if never set.
  const policies = COURSE_TYPES.map((t) => byType.get(t) || {
    id: null, courseType: t, updatedByName: null,
    assignmentMin: 0, assignmentMax: 100, assignmentMinCount: 1,
    quizMin: 0, quizMax: 100, quizMinCount: 1,
    projectMin: 0, projectMax: 100, projectMinCount: 0,
    labMin: 0, labMax: 100, labMinCount: 0,
    midtermMin: 0, midtermMax: 100, midtermMinCount: 1,
    finalMin: 0, finalMax: 100, finalMinCount: 1,
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

  const fields = ["assignmentMin", "assignmentMax", "assignmentMinCount", "quizMin", "quizMax", "quizMinCount",
    "projectMin", "projectMax", "projectMinCount", "labMin", "labMax", "labMinCount",
    "midtermMin", "midtermMax", "midtermMinCount", "finalMin", "finalMax", "finalMinCount"];
  const data: Record<string, number> = {};
  for (const f of fields) {
    const v = parseInt(body[f], 10);
    const isCount = f.endsWith("MinCount");
    if (isNaN(v) || v < 0 || (!isCount && v > 100)) return NextResponse.json({ error: `${f} must be a valid number${isCount ? "" : " between 0 and 100"}` }, { status: 400 });
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
    create: { chairmanId: user.managedById, courseType: body.courseType, updatedById: user.id, ...data },
    update: { ...data, updatedById: user.id },
  });

  await writeAuditLog({ actorUserId: user.id, action: "WEIGHT_POLICY_SET", entityType: "WeightPolicy", entityId: policy.id, metadata: { courseType: body.courseType } });

  return NextResponse.json({ policy });
}
