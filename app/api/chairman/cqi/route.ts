import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { writeAuditLog } from "../../../../lib/audit";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !["CHAIRMAN", "OMC"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.finding) return NextResponse.json({ error: "finding is required" }, { status: 400 });

  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no chairman on record" }, { status: 400 });

  const record = await prisma.cqiRecord.create({
    data: {
      chairmanId, authorId: user.id, batchId: body.batchId || null, courseId: body.courseId || null,
      finding: body.finding, actionTaken: body.actionTaken || null,
    },
  });
  await writeAuditLog({ actorUserId: user.id, action: "CQI_RECORD_CREATED", entityType: "CqiRecord", entityId: record.id });
  return NextResponse.json({ record }, { status: 201 });
}
