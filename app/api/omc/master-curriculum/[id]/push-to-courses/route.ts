import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { writeAuditLog } from "../../../../../../lib/audit";
import { applyMasterPush, planMasterPush } from "../../../../../../lib/masterPush";

export const maxDuration = 300;

// GET: what an update would do (nothing is changed). POST { courseIds }: update those courses (send a few at a time).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const plan = await planMasterPush(user, params.id);
  if (!plan) return NextResponse.json({ error: "Only your own copy of a curriculum can be pushed to your courses." }, { status: 403 });
  return NextResponse.json({ plan });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(b.courseIds) ? b.courseIds.map(String).slice(0, 25) : [];
  const result = await applyMasterPush(user, params.id, ids);
  if (!result) return NextResponse.json({ error: "Only your own copy of a curriculum can be pushed to your courses." }, { status: 403 });
  await writeAuditLog({ actorUserId: user.id, action: "MASTER_CURRICULUM_PUSHED_TO_COURSES", entityType: "MasterCurriculum", entityId: params.id, metadata: result });
  return NextResponse.json(result);
}
