import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { chairmanIdFor } from "../../../../../../lib/reportScope";
import { draftCqiAction } from "../../../../../../lib/cqiActionDraft";

// AI-drafts a starting "action taken" for an existing CQI finding — a
// suggestion the Chairman/OMC reviews and edits before saving, never
// written to the record directly by this endpoint.
export async function POST(req: NextRequest, { params }: { params: { cqiId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !["CHAIRMAN", "OMC"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return NextResponse.json({ error: "no chairman on record" }, { status: 400 });

  const record = await prisma.cqiRecord.findUnique({
    where: { id: params.cqiId },
    include: { course: { select: { code: true, title: true } }, batch: { select: { degreeProgram: true, batchName: true } } },
  });
  if (!record || record.chairmanId !== chairmanId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = await draftCqiAction(chairmanId, {
    finding: record.finding,
    sourceType: record.sourceType,
    sourceReference: record.sourceReference,
    courseLabel: record.course ? `${record.course.code} — ${record.course.title}` : null,
    batchLabel: record.batch ? `${record.batch.degreeProgram} — ${record.batch.batchName}` : null,
    metricBefore: record.metricBefore,
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ draft: result.draft });
}
