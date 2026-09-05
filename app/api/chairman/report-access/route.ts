import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rules = await prisma.reportAccessRule.findMany({ where: { chairmanId: user.id } });
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.reportId || !body.subjectType || !body.subjectValue) {
    return NextResponse.json({ error: "reportId, subjectType, and subjectValue are required" }, { status: 400 });
  }
  if (!["ROLE", "USER"].includes(body.subjectType)) return NextResponse.json({ error: "subjectType must be ROLE or USER" }, { status: 400 });

  const rule = await prisma.reportAccessRule.upsert({
    where: { chairmanId_reportId_subjectType_subjectValue: { chairmanId: user.id, reportId: body.reportId, subjectType: body.subjectType, subjectValue: body.subjectValue } },
    create: { chairmanId: user.id, reportId: body.reportId, subjectType: body.subjectType, subjectValue: body.subjectValue, canView: !!body.canView, canEdit: !!body.canEdit },
    update: { canView: !!body.canView, canEdit: !!body.canEdit },
  });

  return NextResponse.json({ rule }, { status: 201 });
}
